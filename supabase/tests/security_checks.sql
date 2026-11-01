-- =============================================================================
-- REFAL Basketball League — security & privacy self-tests (spec §11.10)
--
-- HOW TO RUN: paste the whole file into the Supabase SQL Editor and execute.
-- Everything runs inside a single transaction that ROLLS BACK at the end, so no
-- test data remains. A successful run prints a series of "PASS: …" notices and
-- finishes without error. Any "FAIL …" aborts the transaction.
--
-- These cover: generated score integrity, idempotency, consent-gated name
-- publication (grant + revoke), and that the anonymous role cannot read the
-- raw players/contacts tables.
-- =============================================================================

begin;

create temp table _ids (k text primary key, v uuid) on commit drop;

-- --- Setup: a throwaway tournament / team / player / match ------------------
do $$
declare v_t uuid; v_team uuid; v_p uuid; v_m uuid;
begin
  insert into public.tournaments (name, is_demo) values ('__TEST__', true) returning id into v_t;
  insert into public.teams (tournament_id, name, short_name, is_demo)
    values (v_t, 'Test Team', 'TST', true) returning id into v_team;
  insert into public.players (tournament_id, team_id, internal_code, first_name, last_name, jersey_number, is_demo)
    values (v_t, v_team, 'TST-1', 'Иван', 'Тестов', 7, true) returning id into v_p;
  insert into public.matches (tournament_id, home_team_id, away_team_id, status, is_demo)
    values (v_t, v_team, v_team, 'live', true) returning id into v_m;
  insert into _ids values ('t', v_t), ('team', v_team), ('p', v_p), ('m', v_m);
end $$;

-- --- Test 1: score is derived from events (generated column) ----------------
do $$
declare m uuid; team uuid; p uuid; pts int;
begin
  select v into m from _ids where k = 'm';
  select v into team from _ids where k = 'team';
  select v into p from _ids where k = 'p';
  insert into public.match_events (match_id, team_id, player_id, event_type, made, client_event_id)
    values (m, team, p, 'fg3', true, gen_random_uuid())
    returning points into pts;
  if pts <> 3 then raise exception 'FAIL: generated points for fg3 = % (expected 3)', pts; end if;
  raise notice 'PASS: scoring event yields generated points = 3';
end $$;

-- --- Test 2: idempotency — duplicate client_event_id is rejected ------------
do $$
declare m uuid; team uuid; p uuid; ceid uuid := gen_random_uuid();
begin
  select v into m from _ids where k = 'm';
  select v into team from _ids where k = 'team';
  select v into p from _ids where k = 'p';
  insert into public.match_events (match_id, team_id, player_id, event_type, made, client_event_id)
    values (m, team, p, 'fg2', true, ceid);
  begin
    insert into public.match_events (match_id, team_id, player_id, event_type, made, client_event_id)
      values (m, team, p, 'fg2', true, ceid);
    raise exception 'FAIL: duplicate client_event_id was accepted (double count possible)';
  exception when unique_violation then
    raise notice 'PASS: duplicate client_event_id blocked (no double counting)';
  end;
end $$;

-- --- Test 3: name is published ONLY with active consent --------------------
do $$
declare p uuid; nm text; pub boolean;
begin
  select v into p from _ids where k = 'p';

  select display_name, name_is_public into nm, pub from public.public_players where player_id = p;
  if pub then raise exception 'FAIL: name_is_public true without consent'; end if;
  if nm = 'Иван Тестов' then raise exception 'FAIL: real name exposed without consent'; end if;
  raise notice 'PASS: name hidden without consent (shown as "%")', nm;

  insert into public.consent_records (player_id, purpose, status, granted_at)
    values (p, 'publish_name', 'granted', now());
  select display_name, name_is_public into nm, pub from public.public_players where player_id = p;
  if not pub or nm <> 'Иван Тестов' then raise exception 'FAIL: name not shown after consent ("%", %)', nm, pub; end if;
  raise notice 'PASS: real name shown after consent granted';

  update public.consent_records set status = 'revoked', revoked_at = now()
    where player_id = p and purpose = 'publish_name';
  select name_is_public into pub from public.public_players where player_id = p;
  if pub then raise exception 'FAIL: name still public after consent revoked'; end if;
  raise notice 'PASS: name hidden again after consent revoked (API reflects revocation)';
end $$;

-- --- Test 4: anonymous role cannot read raw players / contacts --------------
set local role anon;
do $$
declare cnt int;
begin
  begin
    select count(*) into cnt from public.players;
    if cnt <> 0 then raise exception 'FAIL: anon read % rows from players', cnt; end if;
    raise notice 'PASS: anon sees 0 rows in players (RLS)';
  exception when insufficient_privilege then
    raise notice 'PASS: anon denied on players (insufficient_privilege)';
  end;

  begin
    select count(*) into cnt from public.private_player_contacts;
    if cnt <> 0 then raise exception 'FAIL: anon read % rows from contacts', cnt; end if;
    raise notice 'PASS: anon sees 0 rows in private_player_contacts (RLS)';
  exception when insufficient_privilege then
    raise notice 'PASS: anon denied on private_player_contacts';
  end;

  -- but the public views ARE readable
  perform 1 from public.public_teams;
  raise notice 'PASS: anon can read public_teams view';
end $$;
reset role;

do $$ begin raise notice '================ ALL SECURITY CHECKS PASSED ================'; end $$;

rollback;
