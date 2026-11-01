-- =============================================================================
-- REFAL Basketball League
-- Migration 0005: expose a few non-personal settings to the public tournament
-- view so the site can apply the configurable leaders threshold (§10).
-- CREATE OR REPLACE VIEW preserves existing grants.
-- =============================================================================

create or replace view public.public_tournaments as
  select t.id, t.name, t.venue, t.city, t.status, t.is_demo,
         s.format, s.start_date, s.end_date, s.third_place_match,
         s.min_games_for_leaders, s.periods_per_game
    from public.tournaments t
    left join public.tournament_settings s on s.tournament_id = t.id
   where t.status <> 'archived' or t.archived_at is not null;
