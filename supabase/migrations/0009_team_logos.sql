-- =============================================================================
-- REFAL Basketball League
-- Migration 0009: team logos
--   * public Storage bucket `team-logos` (2 MB cap, images only)
--   * expose logo paths through the public match/standings views
-- Uploads are performed server-side with the service role (which bypasses
-- Storage RLS), so no insert policies are required; the bucket is public-read.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-logos', 'team-logos', true, 2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

-- --- public_matches: append home/away logo paths -----------------------------
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
    at.logo_path as away_logo_path
  from public.matches m
  left join public.teams ht on ht.id = m.home_team_id
  left join public.teams at on at.id = m.away_team_id
  left join public.bracket_slots hs on hs.id = m.home_slot_id
  left join public.bracket_slots aws on aws.id = m.away_slot_id
  left join public.match_results r on r.match_id = m.id;

-- --- public_standings: append team logo path ---------------------------------
create or replace view public.public_standings as
  select
    st.tournament_id, st.group_id, st.team_id, st.played, st.wins, st.losses,
    st.draws, st.points_for, st.points_against, st.point_diff,
    st.tournament_points, st.rank,
    te.name as team_name, te.short_name, te.color,
    g.name as group_name,
    te.logo_path
  from public.standings st
  join public.teams te on te.id = st.team_id
  left join public.tournament_groups g on g.id = st.group_id;
