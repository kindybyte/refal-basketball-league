-- =============================================================================
-- REFAL Basketball League — Core schema
-- Migration 0001: extensions, enums, tables, constraints, indexes
--
-- Design principles:
--   * Privacy by default — personal data lives in RLS-locked base tables.
--     Nothing personal is published except through controlled views (0003).
--   * Single source of truth — the official score is DERIVED from scoring
--     events via GENERATED columns, never written independently.
--   * Soft-correction — match events are never hard-deleted by operators;
--     they are voided with a reason so the action history stays auditable.
-- =============================================================================

create extension if not exists pgcrypto;      -- gen_random_uuid(), digest()
create extension if not exists citext;         -- case-insensitive email

-- -----------------------------------------------------------------------------
-- Enumerated types
-- -----------------------------------------------------------------------------
create type tournament_status  as enum ('upcoming', 'ongoing', 'completed', 'archived');
create type tournament_format  as enum ('round_robin', 'groups_playoff', 'single_elimination');
create type team_status        as enum ('active', 'withdrawn');
create type player_status      as enum ('active', 'inactive', 'withdrawn');
create type app_role           as enum ('admin', 'operator');
create type account_status     as enum ('active', 'disabled');

create type match_status       as enum ('scheduled', 'live', 'pending_confirmation', 'completed', 'postponed', 'cancelled');
create type match_stage        as enum ('round_robin', 'group', 'quarterfinal', 'semifinal', 'final', 'third_place');
create type period_status      as enum ('pending', 'active', 'ended');

-- Event types that the operator can record during a match.
create type match_event_type   as enum ('ft', 'fg2', 'fg3', 'rebound', 'assist', 'steal', 'block', 'turnover', 'foul');
create type rebound_kind       as enum ('offensive', 'defensive');

create type consent_purpose    as enum ('publish_name', 'publish_stats');
create type consent_status     as enum ('pending', 'granted', 'declined', 'revoked');
create type consent_method     as enum ('self_token', 'legal_guardian', 'in_person', 'other');
create type signer_type        as enum ('self', 'legal_guardian');

create type privacy_request_type   as enum ('access', 'rectification', 'erasure', 'revoke_consent', 'objection');
create type privacy_request_status as enum ('open', 'in_progress', 'resolved', 'rejected');

-- -----------------------------------------------------------------------------
-- Shared trigger: maintain updated_at
-- -----------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Identity & roles
-- `app_users` is the canonical identity + role table. It fulfils the spec's
-- `admin_users` (role = 'admin') and the operator identity (role = 'operator').
-- It references Supabase auth.users so authentication/MFA is handled by Auth.
-- -----------------------------------------------------------------------------
create table public.app_users (
  id            uuid primary key references auth.users (id) on delete cascade,
  role          app_role       not null,
  full_name     text           not null,
  status        account_status not null default 'active',
  -- MFA is mandatory for admins; enforced in the app + checked here for audit.
  mfa_required  boolean        not null default true,
  created_by    uuid references public.app_users (id),
  created_at    timestamptz    not null default now(),
  updated_at    timestamptz    not null default now()
);
create index app_users_role_idx on public.app_users (role) where status = 'active';
create trigger app_users_updated_at before update on public.app_users
  for each row execute function public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- Tournaments & settings
-- -----------------------------------------------------------------------------
create table public.tournaments (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  venue        text not null default 'Рефал',
  city         text not null default 'Бишкек',
  status       tournament_status not null default 'upcoming',
  -- Demonstration data is explicitly flagged so it is never confused with real.
  is_demo      boolean not null default false,
  archived_at  timestamptz,
  created_by   uuid references public.app_users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger tournaments_updated_at before update on public.tournaments
  for each row execute function public.tg_set_updated_at();

create table public.tournament_settings (
  tournament_id      uuid primary key references public.tournaments (id) on delete cascade,
  format             tournament_format not null default 'round_robin',
  start_date         date,
  end_date           date,
  -- Explicit playing days (array of ISO dates). Empty ⇒ every day in range.
  playing_days       date[] not null default '{}',
  daily_start_time   time   not null default '18:00',
  daily_end_time     time   not null default '23:00',
  match_duration_min int    not null default 80  check (match_duration_min > 0),
  break_between_min  int    not null default 15  check (break_between_min >= 0),
  min_rest_hours     int    not null default 20  check (min_rest_hours >= 0),
  courts_count       int    not null default 1   check (courts_count >= 1),
  rounds_per_opponent int   not null default 1   check (rounds_per_opponent >= 1),
  -- Scoring for the standings table.
  points_win         int not null default 2,
  points_loss        int not null default 0,
  points_draw        int not null default 1,
  draws_allowed      boolean not null default false,   -- basketball: usually overtime instead
  overtime_enabled   boolean not null default true,
  third_place_match  boolean not null default true,
  -- Ordered list of tie-break criteria, e.g. ["head_to_head","point_diff","points_for"].
  tiebreakers        jsonb not null default '["head_to_head","point_diff","points_for","wins"]'::jsonb,
  min_games_for_leaders int not null default 1 check (min_games_for_leaders >= 0),
  periods_per_game   int not null default 4 check (periods_per_game between 1 and 12),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create trigger tournament_settings_updated_at before update on public.tournament_settings
  for each row execute function public.tg_set_updated_at();

create table public.tournament_groups (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  name          text not null,
  group_index   int  not null,
  created_at    timestamptz not null default now(),
  unique (tournament_id, group_index)
);
create index tournament_groups_tournament_idx on public.tournament_groups (tournament_id);

-- -----------------------------------------------------------------------------
-- Teams
-- -----------------------------------------------------------------------------
create table public.teams (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  group_id      uuid references public.tournament_groups (id) on delete set null,
  name          text not null,
  short_name    text not null,
  color         text not null default '#E8793A',   -- muted basketball orange
  logo_path     text,                              -- storage object path, not a public URL
  description   text,
  status        team_status not null default 'active',
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint teams_color_hex check (color ~* '^#[0-9a-f]{6}$'),
  constraint teams_short_name_len check (char_length(short_name) between 1 and 6),
  unique (tournament_id, name)
);
create index teams_tournament_idx on public.teams (tournament_id);
create index teams_group_idx on public.teams (group_id);
create trigger teams_updated_at before update on public.teams
  for each row execute function public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- Players — INTERNAL roster data (RLS-locked; never public directly).
-- Names are stored here but are only ever published through the consent-aware
-- public view (migration 0003). public_alias is a self-chosen, non-identifying
-- nickname that may be shown without name-publication consent.
-- -----------------------------------------------------------------------------
create table public.players (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  team_id        uuid references public.teams (id) on delete set null,
  -- Internal, non-personal identifier used as the neutral public fallback.
  internal_code  text not null,
  first_name     text not null,
  last_name      text not null,
  public_alias   text,
  jersey_number  int  not null check (jersey_number between 0 and 99),
  -- Optional, off-by-default extra field. Contacts live in a separate table.
  position       text,
  status         player_status not null default 'active',
  -- Minor flag drives the legal-guardian consent path (section 11.5).
  is_minor       boolean not null default false,
  is_demo        boolean not null default false,
  created_by     uuid references public.app_users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Jersey numbers are unique within a team; guards against accidental dupes.
  constraint players_unique_jersey unique (team_id, jersey_number),
  -- Internal code unique within a tournament.
  constraint players_unique_code unique (tournament_id, internal_code)
);
create index players_tournament_idx on public.players (tournament_id);
create index players_team_idx on public.players (team_id);
create trigger players_updated_at before update on public.players
  for each row execute function public.tg_set_updated_at();

-- Contact data — maximum protection (section 11.6). Separate table, locked by
-- RLS, never exposed in any public view, never logged, never bulk-exported.
create table public.private_player_contacts (
  player_id   uuid primary key references public.players (id) on delete cascade,
  phone       text,
  email       citext,
  -- Legal basis note: why these contacts are held at all (data minimisation).
  purpose_note text,
  created_by  uuid references public.app_users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint contacts_email_format check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
create trigger private_player_contacts_updated_at before update on public.private_player_contacts
  for each row execute function public.tg_set_updated_at();

-- Membership history (audit of team changes). players.team_id stays the single
-- canonical "current team"; this log is written by trigger when it changes.
create table public.team_memberships (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references public.players (id) on delete cascade,
  team_id    uuid references public.teams (id) on delete set null,
  from_ts    timestamptz not null default now(),
  to_ts      timestamptz,
  created_at timestamptz not null default now()
);
create index team_memberships_player_idx on public.team_memberships (player_id);

create or replace function public.tg_log_team_membership()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and new.team_id is not null then
    insert into public.team_memberships (player_id, team_id) values (new.id, new.team_id);
  elsif tg_op = 'UPDATE' and new.team_id is distinct from old.team_id then
    update public.team_memberships
       set to_ts = now()
     where player_id = new.id and to_ts is null;
    if new.team_id is not null then
      insert into public.team_memberships (player_id, team_id) values (new.id, new.team_id);
    end if;
  end if;
  return new;
end;
$$;
create trigger players_membership_log
  after insert or update of team_id on public.players
  for each row execute function public.tg_log_team_membership();

-- -----------------------------------------------------------------------------
-- Matches, periods, events, results
-- -----------------------------------------------------------------------------
create table public.matches (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  group_id       uuid references public.tournament_groups (id) on delete set null,
  stage          match_stage not null default 'round_robin',
  round_number   int,
  -- Teams may be unknown for playoff matches until feeder results land; in that
  -- case home/away_team_id stay null and the bracket slot labels are shown.
  home_team_id   uuid references public.teams (id) on delete set null,
  away_team_id   uuid references public.teams (id) on delete set null,
  home_slot_id   uuid,   -- FK added after bracket_slots exists
  away_slot_id   uuid,
  scheduled_at   timestamptz,
  court_number   int not null default 1 check (court_number >= 1),
  duration_min   int,
  status         match_status not null default 'scheduled',
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint matches_distinct_teams
    check (home_team_id is null or away_team_id is null or home_team_id <> away_team_id)
);
create index matches_tournament_idx on public.matches (tournament_id);
create index matches_scheduled_idx on public.matches (scheduled_at);
create index matches_status_idx on public.matches (status);
create index matches_home_team_idx on public.matches (home_team_id);
create index matches_away_team_idx on public.matches (away_team_id);
create trigger matches_updated_at before update on public.matches
  for each row execute function public.tg_set_updated_at();

create table public.bracket_slots (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null references public.tournaments (id) on delete cascade,
  stage           match_stage not null,
  slot_index      int not null,
  label           text not null,          -- e.g. "Победитель ЧФ-1"
  -- How this slot gets resolved: winner/loser of a source match.
  source_match_id uuid references public.matches (id) on delete set null,
  takes_winner    boolean not null default true,
  resolved_team_id uuid references public.teams (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (tournament_id, stage, slot_index)
);
create index bracket_slots_tournament_idx on public.bracket_slots (tournament_id);

alter table public.matches
  add constraint matches_home_slot_fk foreign key (home_slot_id) references public.bracket_slots (id) on delete set null,
  add constraint matches_away_slot_fk foreign key (away_slot_id) references public.bracket_slots (id) on delete set null;

create table public.match_periods (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null references public.matches (id) on delete cascade,
  period_number int not null check (period_number >= 1),
  is_overtime  boolean not null default false,
  status       period_status not null default 'pending',
  started_at   timestamptz,
  ended_at     timestamptz,
  created_at   timestamptz not null default now(),
  unique (match_id, period_number)
);
create index match_periods_match_idx on public.match_periods (match_id);

-- Match events — the single source of truth for the score and all stats.
-- `points` is a GENERATED column so the operator can never alter the score
-- independently of the recorded shot (spec §8 "Логика подсчёта").
create table public.match_events (
  id              uuid primary key default gen_random_uuid(),
  match_id        uuid not null references public.matches (id) on delete cascade,
  period_id       uuid references public.match_periods (id) on delete set null,
  team_id         uuid not null references public.teams (id) on delete cascade,
  player_id       uuid references public.players (id) on delete set null,
  event_type      match_event_type not null,
  made            boolean,                         -- required for ft/fg2/fg3
  rebound_type    rebound_kind,                    -- required for rebound
  -- Links an assist to the specific made shot it set up (spec §8).
  assisted_event_id uuid references public.match_events (id) on delete set null,
  points smallint generated always as (
    case
      when event_type = 'ft'  and made then 1
      when event_type = 'fg2' and made then 2
      when event_type = 'fg3' and made then 3
      else 0
    end
  ) stored,
  -- Soft correction: events are voided (with reason), never silently deleted.
  voided       boolean not null default false,
  void_reason  text,
  voided_by    uuid references public.app_users (id),
  voided_at    timestamptz,
  -- Idempotency key: a retried request with the same key is a no-op (spec §8
  -- "без двойного начисления при повторной отправке запроса").
  client_event_id uuid not null,
  game_clock_seconds int,
  created_by   uuid references public.app_users (id),
  created_at   timestamptz not null default now(),

  constraint match_events_made_consistency check (
    (event_type in ('ft','fg2','fg3') and made is not null)
    or (event_type not in ('ft','fg2','fg3') and made is null)
  ),
  constraint match_events_rebound_consistency check (
    (event_type = 'rebound' and rebound_type is not null)
    or (event_type <> 'rebound' and rebound_type is null)
  ),
  constraint match_events_assist_link check (
    assisted_event_id is null or event_type = 'assist'
  ),
  -- Same client key can't create two events in the same match.
  constraint match_events_idem unique (match_id, client_event_id)
);
create index match_events_match_idx on public.match_events (match_id) where not voided;
create index match_events_player_idx on public.match_events (player_id) where not voided;
create index match_events_team_idx on public.match_events (team_id) where not voided;
create index match_events_created_idx on public.match_events (match_id, created_at);

-- Official, confirmed result snapshot. Scores are the authoritative figures the
-- standings read from; they are filled from events on confirmation.
create table public.match_results (
  match_id       uuid primary key references public.matches (id) on delete cascade,
  home_score     int not null default 0 check (home_score >= 0),
  away_score     int not null default 0 check (away_score >= 0),
  winner_team_id uuid references public.teams (id) on delete set null,
  went_overtime  boolean not null default false,
  is_draw        boolean not null default false,
  submitted_by   uuid references public.app_users (id),
  submitted_at   timestamptz,
  confirmed_by   uuid references public.app_users (id),
  confirmed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger match_results_updated_at before update on public.match_results
  for each row execute function public.tg_set_updated_at();

-- Standings — DERIVED table, only ever written by the recompute function (0002).
create table public.standings (
  id               uuid primary key default gen_random_uuid(),
  tournament_id    uuid not null references public.tournaments (id) on delete cascade,
  group_id         uuid references public.tournament_groups (id) on delete cascade,
  team_id          uuid not null references public.teams (id) on delete cascade,
  played           int not null default 0,
  wins             int not null default 0,
  losses           int not null default 0,
  draws            int not null default 0,
  points_for       int not null default 0,
  points_against   int not null default 0,
  point_diff       int not null default 0,
  tournament_points int not null default 0,
  rank             int,
  updated_at       timestamptz not null default now(),
  unique (tournament_id, team_id)
);
create index standings_tournament_idx on public.standings (tournament_id);
create index standings_group_idx on public.standings (group_id);

-- -----------------------------------------------------------------------------
-- Operator assignments (scoped, per-match authority)
-- -----------------------------------------------------------------------------
create table public.operator_assignments (
  id               uuid primary key default gen_random_uuid(),
  match_id         uuid not null references public.matches (id) on delete cascade,
  operator_user_id uuid not null references public.app_users (id) on delete cascade,
  assigned_by      uuid references public.app_users (id),
  assigned_at      timestamptz not null default now(),
  revoked_at       timestamptz
);
-- At most one ACTIVE assignment per (match, operator).
create unique index operator_assignments_active_idx
  on public.operator_assignments (match_id, operator_user_id)
  where revoked_at is null;
create index operator_assignments_operator_idx on public.operator_assignments (operator_user_id);

-- -----------------------------------------------------------------------------
-- Consent & privacy (section 11.3 / 11.4)
-- -----------------------------------------------------------------------------
create table public.consent_text_versions (
  id           uuid primary key default gen_random_uuid(),
  version      text not null unique,          -- e.g. "2026-11-v1"
  body_md      text not null,                 -- full consent notice (markdown)
  effective_from timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- One-time, time-limited tokens. We store only a HASH of the token; the raw
-- token exists only in the link/QR handed to the player (spec §11.3).
create table public.consent_tokens (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.players (id) on delete cascade,
  token_hash   bytea not null unique,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_by   uuid references public.app_users (id),
  created_at   timestamptz not null default now()
);
create index consent_tokens_player_idx on public.consent_tokens (player_id);

create table public.consent_records (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references public.players (id) on delete cascade,
  purpose         consent_purpose not null,
  status          consent_status not null default 'pending',
  text_version_id uuid references public.consent_text_versions (id),
  token_id        uuid references public.consent_tokens (id),
  method          consent_method not null default 'self_token',
  signer          signer_type not null default 'self',
  -- Minimal evidence only — no excessive technical fingerprinting (§11.3).
  evidence        jsonb not null default '{}'::jsonb,
  granted_at      timestamptz,
  declined_at     timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index consent_records_player_idx on public.consent_records (player_id);
-- At most one ACTIVE (granted, not revoked) consent per player+purpose.
create unique index consent_records_active_idx
  on public.consent_records (player_id, purpose)
  where status = 'granted' and revoked_at is null;
create trigger consent_records_updated_at before update on public.consent_records
  for each row execute function public.tg_set_updated_at();

create table public.privacy_requests (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid references public.players (id) on delete set null,
  type          privacy_request_type not null,
  status        privacy_request_status not null default 'open',
  details       text,
  resolution_note text,
  handled_by    uuid references public.app_users (id),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
create index privacy_requests_status_idx on public.privacy_requests (status);

-- -----------------------------------------------------------------------------
-- Audit log — administrative actions. No PII, no contact data, no raw tokens.
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.app_users (id) on delete set null,
  actor_role  app_role,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  summary     text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
