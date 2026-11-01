-- =============================================================================
-- REFAL Basketball League
-- Migration 0008: add the 'league_playoff' value to the tournament_format enum.
-- (0007 added the logic but not the enum value — this fixes
--  "invalid input value for enum tournament_format: league_playoff".)
-- Idempotent and safe to run on PostgreSQL 12+.
-- =============================================================================

alter type public.tournament_format add value if not exists 'league_playoff';
