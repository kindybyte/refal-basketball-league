-- =============================================================================
-- REFAL Basketball League
-- Migration 0010: shared game clock so spectators see the live time.
--
--   * matches.clock_seconds / clock_running / clock_updated_at hold the clock
--     state. The operator writes it on state CHANGES only (start/pause/reset/
--     period) via set_match_clock() — no per-second writes.
--   * Viewers derive the live value: running ⇒ clock_seconds minus the seconds
--     elapsed since clock_updated_at; paused ⇒ clock_seconds as-is.
-- =============================================================================

alter table public.matches
  add column if not exists clock_seconds   int,
  add column if not exists clock_running   boolean not null default false,
  add column if not exists clock_updated_at timestamptz;

-- Operator/admin writes the clock state (authorized in-function).
create or replace function public.set_match_clock(
  p_match_id uuid,
  p_seconds int,
  p_running boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or public.is_active_operator_for_match(p_match_id)) then
    raise exception 'not authorized to set the match clock' using errcode = '42501';
  end if;
  update public.matches
     set clock_seconds = greatest(0, p_seconds),
         clock_running = p_running,
         clock_updated_at = now()
   where id = p_match_id;
end;
$$;

revoke all on function public.set_match_clock(uuid, int, boolean) from public;
grant execute on function public.set_match_clock(uuid, int, boolean) to authenticated;

-- Expose clock + current period on the public match view (append-only).
create or replace view public.public_matches as
  select
    m.id, m.tournament_id, m.group_id, m.stage, m.round_number,
    m.home_team_id, m.away_team_id, m.scheduled_at, m.court_number, m.status, m.is_demo,
    coalesce(ht.short_name, hs.label, 'TBD') as home_label,
    coalesce(at.short_name, aws.label, 'TBD') as away_label,
    ht.name as home_name, at.name as away_name,
    ht.color as home_color, at.color as away_color,
    case
      when m.status = 'live' then (
        select coalesce(sum(points),0)::int from public.match_events
         where match_id = m.id and team_id = m.home_team_id and not voided)
      when m.status in ('pending_confirmation','completed') then r.home_score
      else null
    end as home_score,
    case
      when m.status = 'live' then (
        select coalesce(sum(points),0)::int from public.match_events
         where match_id = m.id and team_id = m.away_team_id and not voided)
      when m.status in ('pending_confirmation','completed') then r.away_score
      else null
    end as away_score,
    (m.status = 'completed') as is_final,
    r.winner_team_id,
    ht.logo_path as home_logo_path,
    at.logo_path as away_logo_path,
    m.clock_seconds,
    m.clock_running,
    m.clock_updated_at,
    (select max(period_number) from public.match_periods mp where mp.match_id = m.id) as current_period
  from public.matches m
  left join public.teams ht on ht.id = m.home_team_id
  left join public.teams at on at.id = m.away_team_id
  left join public.bracket_slots hs on hs.id = m.home_slot_id
  left join public.bracket_slots aws on aws.id = m.away_slot_id
  left join public.match_results r on r.match_id = m.id;
