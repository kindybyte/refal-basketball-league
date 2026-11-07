-- =============================================================================
-- REFAL Basketball League
-- Migration 0011: weekday-restricted scheduling + fixed match interval.
--   * game_weekdays  — days of week matches may be played on (0=Sun..6=Sat,
--     matching JS getUTCDay). Empty array ⇒ every day in the range.
--   * match_interval_min — minutes between consecutive match START times on a
--     game day (e.g. 60 ⇒ 19:00, 20:00, 21:00 …).
-- =============================================================================

alter table public.tournament_settings
  add column if not exists game_weekdays    int[] not null default '{}',
  add column if not exists match_interval_min int not null default 60
    check (match_interval_min > 0);
