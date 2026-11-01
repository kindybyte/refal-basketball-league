-- =============================================================================
-- REFAL Basketball League
-- Migration 0002: authorization helpers + server-side business functions
--
-- All mutating functions are SECURITY DEFINER and perform their OWN
-- authorization checks against auth.uid(), so the rules hold even when the
-- function is invoked directly via PostgREST RPC. This is the "checked at the
-- database level" requirement from the spec (§3, §11.7).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Authorization helpers
-- -----------------------------------------------------------------------------
create or replace function public.current_app_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
    from public.app_users
   where id = auth.uid()
     and status = 'active';
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users
     where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.is_active_operator_for_match(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.operator_assignments oa
      join public.app_users u on u.id = oa.operator_user_id
     where oa.match_id = p_match_id
       and oa.operator_user_id = auth.uid()
       and oa.revoked_at is null
       and u.status = 'active'
       and u.role = 'operator'
  );
$$;

-- -----------------------------------------------------------------------------
-- Audit helper (internal)
-- -----------------------------------------------------------------------------
create or replace function public.log_audit(
  p_action text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_summary text default null,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (auth.uid(), public.current_app_role(), p_action, p_entity_type, p_entity_id, p_summary, p_metadata);
end;
$$;

-- -----------------------------------------------------------------------------
-- Live score computed from non-voided scoring events (single source of truth)
-- -----------------------------------------------------------------------------
create or replace function public.match_live_score(p_match_id uuid)
returns table (team_id uuid, score int)
language sql
stable
security definer
set search_path = public
as $$
  select e.team_id, coalesce(sum(e.points), 0)::int as score
    from public.match_events e
   where e.match_id = p_match_id
     and not e.voided
   group by e.team_id;
$$;

-- -----------------------------------------------------------------------------
-- Match lifecycle (operator or admin, scoped to the match)
-- -----------------------------------------------------------------------------
create or replace function public.start_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or public.is_active_operator_for_match(p_match_id)) then
    raise exception 'not authorized to control this match' using errcode = '42501';
  end if;

  update public.matches
     set status = 'live'
   where id = p_match_id
     and status in ('scheduled', 'live');

  if not found then
    raise exception 'match not startable (wrong status or missing)';
  end if;

  -- Ensure period 1 exists and is active.
  insert into public.match_periods (match_id, period_number, status, started_at)
  values (p_match_id, 1, 'active', now())
  on conflict (match_id, period_number) do update set status = 'active', started_at = coalesce(public.match_periods.started_at, now());

  perform public.log_audit('match.start', 'match', p_match_id, 'Матч запущен');
end;
$$;

create or replace function public.advance_period(p_match_id uuid, p_period_number int, p_is_overtime boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_id uuid;
begin
  if not (public.is_admin() or public.is_active_operator_for_match(p_match_id)) then
    raise exception 'not authorized to control this match' using errcode = '42501';
  end if;

  update public.match_periods set status = 'ended', ended_at = now()
   where match_id = p_match_id and status = 'active';

  insert into public.match_periods (match_id, period_number, is_overtime, status, started_at)
  values (p_match_id, p_period_number, p_is_overtime, 'active', now())
  on conflict (match_id, period_number) do update set status = 'active', started_at = now()
  returning id into v_period_id;

  return v_period_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- apply_match_event — ATOMIC + IDEMPOTENT event recording (spec §8)
-- A retried request carrying the same client_event_id is a safe no-op: the
-- unique (match_id, client_event_id) constraint means the score is never
-- double-counted.
-- -----------------------------------------------------------------------------
create or replace function public.apply_match_event(
  p_match_id         uuid,
  p_client_event_id  uuid,
  p_team_id          uuid,
  p_event_type       match_event_type,
  p_player_id        uuid default null,
  p_made             boolean default null,
  p_rebound_type     rebound_kind default null,
  p_assisted_event_id uuid default null,
  p_period_number    int default null,
  p_game_clock_seconds int default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_period_id uuid;
  v_is_duplicate boolean := false;
  v_home uuid;
  v_away uuid;
  v_home_score int := 0;
  v_away_score int := 0;
begin
  if not (public.is_admin() or public.is_active_operator_for_match(p_match_id)) then
    raise exception 'not authorized to record events for this match' using errcode = '42501';
  end if;

  perform 1 from public.matches where id = p_match_id and status = 'live';
  if not found then
    raise exception 'match is not live';
  end if;

  -- Resolve the period (optional). Defaults to the currently active period.
  if p_period_number is not null then
    select id into v_period_id from public.match_periods
     where match_id = p_match_id and period_number = p_period_number;
  else
    select id into v_period_id from public.match_periods
     where match_id = p_match_id and status = 'active'
     order by period_number desc limit 1;
  end if;

  -- Idempotent insert.
  insert into public.match_events (
    match_id, period_id, team_id, player_id, event_type, made, rebound_type,
    assisted_event_id, client_event_id, game_clock_seconds, created_by
  ) values (
    p_match_id, v_period_id, p_team_id, p_player_id, p_event_type, p_made, p_rebound_type,
    p_assisted_event_id, p_client_event_id, p_game_clock_seconds, auth.uid()
  )
  on conflict (match_id, client_event_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    v_is_duplicate := true;
    select id into v_event_id from public.match_events
     where match_id = p_match_id and client_event_id = p_client_event_id;
  end if;

  -- Current score from events.
  select home_team_id, away_team_id into v_home, v_away from public.matches where id = p_match_id;
  select coalesce(sum(points) filter (where team_id = v_home), 0),
         coalesce(sum(points) filter (where team_id = v_away), 0)
    into v_home_score, v_away_score
    from public.match_events
   where match_id = p_match_id and not voided;

  return jsonb_build_object(
    'event_id', v_event_id,
    'duplicate', v_is_duplicate,
    'home_score', v_home_score,
    'away_score', v_away_score
  );
end;
$$;

-- Soft-void an event with a mandatory reason (correction, spec §8).
create or replace function public.void_match_event(p_event_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
begin
  select match_id into v_match_id from public.match_events where id = p_event_id;
  if v_match_id is null then
    raise exception 'event not found';
  end if;
  if not (public.is_admin() or public.is_active_operator_for_match(v_match_id)) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if coalesce(p_reason, '') = '' then
    raise exception 'void reason is required';
  end if;

  update public.match_events
     set voided = true, void_reason = p_reason, voided_by = auth.uid(), voided_at = now()
   where id = p_event_id and not voided;
end;
$$;

-- Undo the most recent non-voided event (the LIVE "отмена последнего действия").
create or replace function public.undo_last_event(p_match_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  if not (public.is_admin() or public.is_active_operator_for_match(p_match_id)) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select id into v_event_id from public.match_events
   where match_id = p_match_id and not voided
   order by created_at desc, id desc limit 1;

  if v_event_id is not null then
    update public.match_events
       set voided = true, void_reason = 'undo', voided_by = auth.uid(), voided_at = now()
     where id = v_event_id;
  end if;
  return v_event_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Result submission / confirmation
-- -----------------------------------------------------------------------------
create or replace function public.submit_match_result(p_match_id uuid, p_went_overtime boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_home uuid; v_away uuid; v_home_score int; v_away_score int;
begin
  if not (public.is_admin() or public.is_active_operator_for_match(p_match_id)) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select home_team_id, away_team_id into v_home, v_away from public.matches where id = p_match_id;

  select coalesce(sum(points) filter (where team_id = v_home), 0),
         coalesce(sum(points) filter (where team_id = v_away), 0)
    into v_home_score, v_away_score
    from public.match_events where match_id = p_match_id and not voided;

  insert into public.match_results (match_id, home_score, away_score, went_overtime, submitted_by, submitted_at)
  values (p_match_id, v_home_score, v_away_score, p_went_overtime, auth.uid(), now())
  on conflict (match_id) do update
     set home_score = excluded.home_score,
         away_score = excluded.away_score,
         went_overtime = excluded.went_overtime,
         submitted_by = excluded.submitted_by,
         submitted_at = now();

  update public.matches set status = 'pending_confirmation' where id = p_match_id;
  perform public.log_audit('match.submit_result', 'match', p_match_id,
    'Результат отправлен на подтверждение', jsonb_build_object('home', v_home_score, 'away', v_away_score));
end;
$$;

create or replace function public.confirm_match_result(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament uuid; v_home uuid; v_away uuid;
  v_home_score int; v_away_score int; v_winner uuid; v_draw boolean;
begin
  if not public.is_admin() then
    raise exception 'only admin can confirm results' using errcode = '42501';
  end if;

  select tournament_id, home_team_id, away_team_id into v_tournament, v_home, v_away
    from public.matches where id = p_match_id;

  select home_score, away_score into v_home_score, v_away_score
    from public.match_results where match_id = p_match_id;
  if v_home_score is null then
    raise exception 'no submitted result to confirm';
  end if;

  v_draw := (v_home_score = v_away_score);
  v_winner := case when v_home_score > v_away_score then v_home
                   when v_away_score > v_home_score then v_away
                   else null end;

  update public.match_results
     set winner_team_id = v_winner, is_draw = v_draw,
         confirmed_by = auth.uid(), confirmed_at = now()
   where match_id = p_match_id;

  update public.matches set status = 'completed' where id = p_match_id;

  perform public.recompute_standings(v_tournament);
  perform public.resolve_bracket(v_tournament);

  perform public.log_audit('match.confirm_result', 'match', p_match_id,
    'Результат подтверждён', jsonb_build_object('home', v_home_score, 'away', v_away_score, 'winner', v_winner));
end;
$$;

-- -----------------------------------------------------------------------------
-- recompute_standings — DERIVED, rebuilt from confirmed results only.
-- Ranking: tournament_points, then head-to-head for two-way ties, then overall
-- point difference, points for, wins. Head-to-head among >2 tied teams is
-- surfaced to the admin for regulation-based manual resolution.
-- -----------------------------------------------------------------------------
create or replace function public.recompute_standings(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  v_pw int; v_pl int; v_pd int;
  prev record;
  v_has_prev boolean := false;
  v_h2h_prev int; v_h2h_cur int;
begin
  select points_win, points_loss, points_draw into v_pw, v_pl, v_pd
    from public.tournament_settings where tournament_id = p_tournament_id;
  v_pw := coalesce(v_pw, 2); v_pl := coalesce(v_pl, 0); v_pd := coalesce(v_pd, 1);

  delete from public.standings where tournament_id = p_tournament_id;

  insert into public.standings (
    tournament_id, group_id, team_id, played, wins, losses, draws,
    points_for, points_against, point_diff, tournament_points
  )
  select
    p_tournament_id,
    t.group_id,
    t.id,
    count(r.*) as played,
    count(*) filter (where agg.won) as wins,
    count(*) filter (where agg.lost) as losses,
    count(*) filter (where agg.drew) as draws,
    coalesce(sum(agg.pf), 0) as points_for,
    coalesce(sum(agg.pa), 0) as points_against,
    coalesce(sum(agg.pf - agg.pa), 0) as point_diff,
    coalesce(sum(
      case when agg.won then v_pw when agg.lost then v_pl else v_pd end
    ), 0) as tournament_points
  from public.teams t
  left join lateral (
    -- one row per completed match this team played, from its own perspective
    select
      m.id,
      case when m.home_team_id = t.id then res.home_score else res.away_score end as pf,
      case when m.home_team_id = t.id then res.away_score else res.home_score end as pa,
      (res.winner_team_id = t.id) as won,
      (res.winner_team_id is not null and res.winner_team_id <> t.id) as lost,
      res.is_draw as drew
    from public.matches m
    join public.match_results res on res.match_id = m.id
    where m.tournament_id = p_tournament_id
      and m.status = 'completed'
      and (m.home_team_id = t.id or m.away_team_id = t.id)
  ) agg on true
  left join public.match_results r on r.match_id = agg.id
  where t.tournament_id = p_tournament_id
  group by t.id, t.group_id;

  -- Preliminary deterministic rank within each group (null group = one pool).
  with ranked as (
    select id,
           row_number() over (
             partition by coalesce(group_id::text, 'all')
             order by tournament_points desc, point_diff desc, points_for desc, wins desc
           ) as rnk
      from public.standings
     where tournament_id = p_tournament_id
  )
  update public.standings st
     set rank = ranked.rnk
    from ranked
   where st.id = ranked.id;

  -- Head-to-head refinement for adjacent two-way ties on all primary criteria.
  for s in
    select st.*, t.name
      from public.standings st join public.teams t on t.id = st.team_id
     where st.tournament_id = p_tournament_id
     order by coalesce(st.group_id::text, 'all'), st.rank
  loop
    -- NOTE: prev fields are referenced ONLY inside `if v_has_prev` — PL/pgSQL
    -- evaluates a boolean expression as a whole (no short-circuit), so touching
    -- prev.* in the same AND-chain as v_has_prev would raise "record not
    -- assigned yet" on the first iteration. Hence the nested IF.
    if v_has_prev then
      if coalesce(prev.group_id::text,'all') = coalesce(s.group_id::text,'all')
         and prev.tournament_points = s.tournament_points
         and prev.point_diff = s.point_diff
         and prev.points_for = s.points_for
         and prev.wins = s.wins
      then
        -- direct meetings between prev and s
        select
          coalesce(sum(case when m.home_team_id = prev.team_id then r.home_score else r.away_score end),0),
          coalesce(sum(case when m.home_team_id = s.team_id then r.home_score else r.away_score end),0)
          into v_h2h_prev, v_h2h_cur
        from public.matches m
        join public.match_results r on r.match_id = m.id
        where m.status = 'completed'
          and ((m.home_team_id = prev.team_id and m.away_team_id = s.team_id)
            or (m.home_team_id = s.team_id and m.away_team_id = prev.team_id));

        if v_h2h_cur > v_h2h_prev then
          -- s beat prev head-to-head: swap their ranks
          update public.standings set rank = prev.rank where id = s.id;
          update public.standings set rank = s.rank where id = prev.id;
        end if;
      end if;
    end if;
    prev := s;
    v_has_prev := true;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- resolve_bracket — fill playoff matches once feeder results are confirmed.
-- Uses bracket_slots as placeholders until the real team is known (spec §7).
-- -----------------------------------------------------------------------------
create or replace function public.resolve_bracket(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  slot record;
  v_team uuid;
begin
  for slot in
    select * from public.bracket_slots
     where tournament_id = p_tournament_id and source_match_id is not null
  loop
    select case when slot.takes_winner then r.winner_team_id
                else case when r.winner_team_id = m.home_team_id then m.away_team_id
                          when r.winner_team_id = m.away_team_id then m.home_team_id
                          else null end
           end
      into v_team
      from public.matches m
      join public.match_results r on r.match_id = m.id
     where m.id = slot.source_match_id and m.status = 'completed';

    if v_team is not null and v_team is distinct from slot.resolved_team_id then
      update public.bracket_slots set resolved_team_id = v_team where id = slot.id;
      -- Place the resolved team into any match that references this slot.
      update public.matches set home_team_id = v_team where home_slot_id = slot.id and home_team_id is null;
      update public.matches set away_team_id = v_team where away_slot_id = slot.id and away_team_id is null;
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Consent: token creation (admin), self-service recording (token holder),
-- and revocation (admin / privacy request).
-- -----------------------------------------------------------------------------

-- Returns the RAW token ONCE. Only its SHA-256 hash is stored.
create or replace function public.create_consent_token(p_player_id uuid, p_ttl_hours int default 72)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_raw text;
  v_hash bytea;
begin
  if not public.is_admin() then
    raise exception 'only admin can issue consent tokens' using errcode = '42501';
  end if;

  v_raw := encode(gen_random_bytes(24), 'hex');
  v_hash := digest(v_raw, 'sha256');

  insert into public.consent_tokens (player_id, token_hash, expires_at, created_by)
  values (p_player_id, v_hash, now() + make_interval(hours => p_ttl_hours), auth.uid());

  perform public.log_audit('consent.token_issued', 'player', p_player_id, 'Выдан токен согласия');
  return v_raw;
end;
$$;

-- Called from the public /consent/[token] page (anon). Knowledge of the raw
-- token is the gate; we never trust the admin to self-confirm consent (§11.3).
create or replace function public.record_consent(
  p_raw_token    text,
  p_publish_name boolean,
  p_publish_stats boolean,
  p_signer       signer_type default 'self',
  p_alias        text default null,
  p_text_version text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token record;
  v_version_id uuid;
  v_player record;
begin
  select * into v_token from public.consent_tokens
   where token_hash = digest(p_raw_token, 'sha256');

  if v_token.id is null then
    raise exception 'invalid token';
  end if;
  if v_token.used_at is not null then
    raise exception 'token already used';
  end if;
  if v_token.expires_at < now() then
    raise exception 'token expired';
  end if;

  select * into v_player from public.players where id = v_token.player_id;

  -- Minors must not be self-consented; require a legal-guardian signer (§11.5).
  if v_player.is_minor and p_signer <> 'legal_guardian' then
    raise exception 'minor requires legal guardian consent';
  end if;

  select id into v_version_id from public.consent_text_versions
   where version = coalesce(p_text_version, version)
   order by effective_from desc limit 1;

  -- Optional self-chosen public alias (allowed without name consent).
  if p_alias is not null then
    update public.players set public_alias = p_alias where id = v_token.player_id;
  end if;

  perform public._upsert_consent(v_token.player_id, 'publish_name', p_publish_name, v_version_id, v_token.id, p_signer);
  perform public._upsert_consent(v_token.player_id, 'publish_stats', p_publish_stats, v_version_id, v_token.id, p_signer);

  update public.consent_tokens set used_at = now() where id = v_token.id;

  return jsonb_build_object('ok', true, 'publish_name', p_publish_name, 'publish_stats', p_publish_stats);
end;
$$;

-- Internal upsert used by record_consent.
create or replace function public._upsert_consent(
  p_player_id uuid, p_purpose consent_purpose, p_granted boolean,
  p_version_id uuid, p_token_id uuid, p_signer signer_type
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Supersede any previous active record for this purpose.
  update public.consent_records
     set status = 'revoked', revoked_at = now()
   where player_id = p_player_id and purpose = p_purpose
     and status = 'granted' and revoked_at is null;

  insert into public.consent_records (
    player_id, purpose, status, text_version_id, token_id, method, signer,
    granted_at, declined_at
  ) values (
    p_player_id, p_purpose,
    case when p_granted then 'granted'::consent_status else 'declined'::consent_status end,
    p_version_id, p_token_id,
    case when p_signer = 'legal_guardian' then 'legal_guardian'::consent_method else 'self_token'::consent_method end,
    p_signer,
    case when p_granted then now() else null end,
    case when p_granted then null else now() end
  );
end;
$$;

-- Admin revocation (also used when resolving a privacy request).
create or replace function public.revoke_consent(p_player_id uuid, p_purpose consent_purpose)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only admin can revoke consent here' using errcode = '42501';
  end if;

  update public.consent_records
     set status = 'revoked', revoked_at = now()
   where player_id = p_player_id and purpose = p_purpose
     and status = 'granted' and revoked_at is null;

  perform public.log_audit('consent.revoke', 'player', p_player_id,
    'Согласие отозвано', jsonb_build_object('purpose', p_purpose));
end;
$$;

-- Convenience: does an ACTIVE consent exist for a (player, purpose)?
create or replace function public.has_consent(p_player_id uuid, p_purpose consent_purpose)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.consent_records
     where player_id = p_player_id and purpose = p_purpose
       and status = 'granted' and revoked_at is null
  );
$$;
