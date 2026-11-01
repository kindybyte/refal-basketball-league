-- =============================================================================
-- REFAL Basketball League
-- Migration 0003: Row Level Security, privilege grants, and PUBLIC VIEWS
--
-- Privacy model (spec §11.1, §11.8):
--   * RLS is enabled on EVERY base table. Anonymous visitors get NO policy on
--     base tables, so a direct PostgREST query returns zero rows.
--   * The public site reads ONLY through the `public_*` views below. These views
--     run with the owner's rights and expose exclusively publishable columns.
--     Names appear only where an ACTIVE publish_name consent exists; individual
--     stats only where publish_stats consent exists. Contacts are NEVER exposed.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere
-- -----------------------------------------------------------------------------
alter table public.app_users              enable row level security;
alter table public.tournaments            enable row level security;
alter table public.tournament_settings    enable row level security;
alter table public.tournament_groups      enable row level security;
alter table public.teams                  enable row level security;
alter table public.players                enable row level security;
alter table public.private_player_contacts enable row level security;
alter table public.team_memberships       enable row level security;
alter table public.matches                enable row level security;
alter table public.bracket_slots          enable row level security;
alter table public.match_periods          enable row level security;
alter table public.match_events           enable row level security;
alter table public.match_results          enable row level security;
alter table public.standings              enable row level security;
alter table public.operator_assignments   enable row level security;
alter table public.consent_text_versions  enable row level security;
alter table public.consent_tokens         enable row level security;
alter table public.consent_records        enable row level security;
alter table public.privacy_requests       enable row level security;
alter table public.audit_logs             enable row level security;

-- Belt-and-braces: strip default table privileges from the ANONYMOUS role on
-- the most sensitive tables, so anon cannot touch them even by accident.
-- NOTE: we must NOT revoke from `authenticated` — admins/operators act under
-- that role and are restricted by the RLS policies below. RLS only applies when
-- the role still holds the base table GRANT; revoking it would turn every
-- admin write into "permission denied for table …".
revoke all on public.players                 from anon;
revoke all on public.private_player_contacts from anon;
revoke all on public.consent_tokens          from anon;
revoke all on public.consent_records         from anon;
revoke all on public.audit_logs              from anon;

-- -----------------------------------------------------------------------------
-- Admin: full control over internal tables (checked via is_admin()).
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'tournaments','tournament_settings','tournament_groups','teams','players',
    'private_player_contacts','team_memberships','matches','bracket_slots',
    'match_periods','match_events','match_results','standings',
    'operator_assignments','consent_text_versions','consent_tokens',
    'consent_records','privacy_requests','audit_logs','app_users'
  ]
  loop
    execute format('drop policy if exists %I on public.%I;', t || '_admin_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin());',
      t || '_admin_all', t
    );
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Self-service: a user can read their own app_users row.
-- -----------------------------------------------------------------------------
drop policy if exists app_users_self_select on public.app_users;
create policy app_users_self_select on public.app_users
  for select to authenticated using (id = auth.uid());

-- -----------------------------------------------------------------------------
-- Operator: scoped READ access limited to their assigned matches.
-- (All operator WRITES go through SECURITY DEFINER functions in 0002.)
-- -----------------------------------------------------------------------------
drop policy if exists operator_assignments_self on public.operator_assignments;
create policy operator_assignments_self on public.operator_assignments
  for select to authenticated
  using (operator_user_id = auth.uid());

drop policy if exists matches_operator_read on public.matches;
create policy matches_operator_read on public.matches
  for select to authenticated
  using (public.is_active_operator_for_match(id));

drop policy if exists match_periods_operator_read on public.match_periods;
create policy match_periods_operator_read on public.match_periods
  for select to authenticated
  using (public.is_active_operator_for_match(match_id));

drop policy if exists match_events_operator_read on public.match_events;
create policy match_events_operator_read on public.match_events
  for select to authenticated
  using (public.is_active_operator_for_match(match_id));

drop policy if exists match_results_operator_read on public.match_results;
create policy match_results_operator_read on public.match_results
  for select to authenticated
  using (public.is_active_operator_for_match(match_id));

-- Operator may read the two teams + their players for an assigned match so the
-- console can list and pick players. Contacts remain admin-only (no policy).
drop policy if exists teams_operator_read on public.teams;
create policy teams_operator_read on public.teams
  for select to authenticated
  using (exists (
    select 1 from public.matches m
     where (m.home_team_id = teams.id or m.away_team_id = teams.id)
       and public.is_active_operator_for_match(m.id)
  ));

drop policy if exists players_operator_read on public.players;
create policy players_operator_read on public.players
  for select to authenticated
  using (exists (
    select 1 from public.matches m
     where (m.home_team_id = players.team_id or m.away_team_id = players.team_id)
       and public.is_active_operator_for_match(m.id)
  ));

-- =============================================================================
-- PUBLIC VIEWS — the ONLY surface the anonymous site is allowed to read.
-- =============================================================================

create or replace view public.public_tournaments as
  select t.id, t.name, t.venue, t.city, t.status, t.is_demo,
         s.format, s.start_date, s.end_date, s.third_place_match
    from public.tournaments t
    left join public.tournament_settings s on s.tournament_id = t.id
   where t.status <> 'archived' or t.archived_at is not null; -- archived still viewable

create or replace view public.public_teams as
  select te.id, te.tournament_id, te.group_id, te.name, te.short_name,
         te.color, te.logo_path, te.description, te.status, te.is_demo,
         g.name as group_name
    from public.teams te
    left join public.tournament_groups g on g.id = te.group_id;

-- Consent-aware player directory. first_name/last_name are NEVER selected into
-- this view unless an active publish_name consent exists.
create or replace view public.public_players as
  select
    p.id as player_id,
    p.tournament_id,
    p.team_id,
    p.jersey_number,
    p.position,
    p.status,
    p.is_demo,
    public.has_consent(p.id, 'publish_name')  as name_is_public,
    public.has_consent(p.id, 'publish_stats') as stats_is_public,
    case
      when public.has_consent(p.id, 'publish_name')
        then p.first_name || ' ' || p.last_name
      when p.public_alias is not null and length(trim(p.public_alias)) > 0
        then p.public_alias
      else 'Игрок №' || p.jersey_number::text
    end as display_name
  from public.players p;

-- Live/confirmed scoreboard. Live scores come from events; confirmed scores
-- from the official result. Bracket placeholder labels shown when team unknown.
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
    r.winner_team_id
  from public.matches m
  left join public.teams ht on ht.id = m.home_team_id
  left join public.teams at on at.id = m.away_team_id
  left join public.bracket_slots hs on hs.id = m.home_slot_id
  left join public.bracket_slots aws on aws.id = m.away_slot_id
  left join public.match_results r on r.match_id = m.id;

-- Live event feed with a consent-aware player label (same rules as the view).
create or replace view public.public_match_events as
  select
    e.id, e.match_id, e.team_id, e.event_type, e.made, e.rebound_type,
    e.points, e.period_id, e.created_at,
    mp.period_number,
    case
      when e.player_id is null then null
      when public.has_consent(e.player_id, 'publish_name')
        then (select first_name || ' ' || last_name from public.players where id = e.player_id)
      else coalesce(
        (select nullif(trim(public_alias), '') from public.players where id = e.player_id),
        'Игрок №' || (select jersey_number from public.players where id = e.player_id)::text
      )
    end as player_label
  from public.match_events e
  left join public.match_periods mp on mp.id = e.period_id
  where not e.voided;

create or replace view public.public_standings as
  select
    st.tournament_id, st.group_id, st.team_id, st.played, st.wins, st.losses,
    st.draws, st.points_for, st.points_against, st.point_diff,
    st.tournament_points, st.rank,
    te.name as team_name, te.short_name, te.color,
    g.name as group_name
  from public.standings st
  join public.teams te on te.id = st.team_id
  left join public.tournament_groups g on g.id = st.group_id;

-- Aggregate player stats — ONLY for players with active publish_stats consent.
-- Players without that consent are absent from the view entirely, so they can
-- never appear in public leaderboards (spec §10, §11.1).
create or replace view public.public_player_stats as
  select
    p.id as player_id,
    p.tournament_id,
    p.team_id,
    case
      when public.has_consent(p.id, 'publish_name')
        then p.first_name || ' ' || p.last_name
      else coalesce(nullif(trim(p.public_alias), ''), 'Игрок №' || p.jersey_number::text)
    end as display_name,
    public.has_consent(p.id, 'publish_name') as name_is_public,
    count(distinct e.match_id) as games_played,
    coalesce(sum(e.points), 0) as total_points,
    count(*) filter (where e.event_type = 'rebound') as rebounds,
    count(*) filter (where e.event_type = 'assist')  as assists,
    count(*) filter (where e.event_type = 'steal')   as steals,
    count(*) filter (where e.event_type = 'block')   as blocks,
    count(*) filter (where e.event_type = 'turnover') as turnovers,
    count(*) filter (where e.event_type in ('fg2','fg3')) as fga,
    count(*) filter (where e.event_type in ('fg2','fg3') and e.made) as fgm,
    count(*) filter (where e.event_type = 'fg3') as tpa,
    count(*) filter (where e.event_type = 'fg3' and e.made) as tpm,
    count(*) filter (where e.event_type = 'ft') as fta,
    count(*) filter (where e.event_type = 'ft' and e.made) as ftm
  from public.players p
  left join public.match_events e on e.player_id = p.id and not e.voided
  where public.has_consent(p.id, 'publish_stats')
  group by p.id;

-- Aggregate TEAM stats (not individual → no personal data).
create or replace view public.public_team_stats as
  select
    st.tournament_id, st.team_id, te.name as team_name, te.short_name, te.color,
    st.played, st.points_for, st.points_against, st.point_diff,
    case when st.played > 0 then round(st.points_for::numeric / st.played, 1) else 0 end as ppg_for,
    case when st.played > 0 then round(st.points_against::numeric / st.played, 1) else 0 end as ppg_against
  from public.standings st
  join public.teams te on te.id = st.team_id;

create or replace view public.public_bracket as
  select
    bs.id as slot_id, bs.tournament_id, bs.stage, bs.slot_index, bs.label,
    bs.source_match_id, bs.takes_winner, bs.resolved_team_id,
    te.short_name as resolved_short_name, te.name as resolved_name, te.color as resolved_color
  from public.bracket_slots bs
  left join public.teams te on te.id = bs.resolved_team_id;

-- Current consent notice text for the public consent page.
create or replace view public.public_consent_text as
  select id, version, body_md, effective_from
    from public.consent_text_versions
   order by effective_from desc;

-- -----------------------------------------------------------------------------
-- Grants: expose ONLY the views to the web roles.
-- -----------------------------------------------------------------------------
grant select on
  public.public_tournaments, public.public_teams, public.public_players,
  public.public_matches, public.public_match_events, public.public_standings,
  public.public_player_stats, public.public_team_stats, public.public_bracket,
  public.public_consent_text
to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Function execute grants (defense in depth)
-- -----------------------------------------------------------------------------
-- Anonymous consent submission is the only mutating function anon may call.
revoke all on function public.record_consent(text, boolean, boolean, signer_type, text, text) from public;
grant execute on function public.record_consent(text, boolean, boolean, signer_type, text, text) to anon, authenticated;

-- Read helpers usable by the public site.
grant execute on function public.match_live_score(uuid) to anon, authenticated;
grant execute on function public.has_consent(uuid, consent_purpose) to anon, authenticated;

-- Operator / admin functions: authenticated only (they self-check the role).
revoke all on function public.start_match(uuid) from public;
revoke all on function public.advance_period(uuid, int, boolean) from public;
revoke all on function public.apply_match_event(uuid, uuid, uuid, match_event_type, uuid, boolean, rebound_kind, uuid, int, int) from public;
revoke all on function public.void_match_event(uuid, text) from public;
revoke all on function public.undo_last_event(uuid) from public;
revoke all on function public.submit_match_result(uuid, boolean) from public;
revoke all on function public.confirm_match_result(uuid) from public;
revoke all on function public.create_consent_token(uuid, int) from public;
revoke all on function public.revoke_consent(uuid, consent_purpose) from public;

grant execute on function public.start_match(uuid) to authenticated;
grant execute on function public.advance_period(uuid, int, boolean) to authenticated;
grant execute on function public.apply_match_event(uuid, uuid, uuid, match_event_type, uuid, boolean, rebound_kind, uuid, int, int) to authenticated;
grant execute on function public.void_match_event(uuid, text) to authenticated;
grant execute on function public.undo_last_event(uuid) to authenticated;
grant execute on function public.submit_match_result(uuid, boolean) to authenticated;
grant execute on function public.confirm_match_result(uuid) to authenticated;
grant execute on function public.create_consent_token(uuid, int) to authenticated;
grant execute on function public.revoke_consent(uuid, consent_purpose) to authenticated;
