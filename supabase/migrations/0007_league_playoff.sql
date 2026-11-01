-- =============================================================================
-- REFAL Basketball League
-- Migration 0007: "league + top-4 playoff" support
--
--   * bracket_slots.seed_rank — a slot that resolves to the team finishing at a
--     given rank in the single-table league (1st..4th), filled once the whole
--     league stage is played.
--   * resolve_bracket() now also fills seed-ranked slots.
--   * No draws in basketball: confirming/submitting a tied result is rejected
--     unless the tournament explicitly allows draws (overtime instead).
-- =============================================================================

alter table public.bracket_slots
  add column if not exists seed_rank int;

-- --- resolve_bracket: match-winner/loser slots + league seed slots ----------
create or replace function public.resolve_bracket(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  slot record;
  v_team uuid;
  v_total int;
  v_done int;
begin
  -- (1) Slots fed by the winner/loser of a specific match.
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
      update public.matches set home_team_id = v_team where home_slot_id = slot.id and home_team_id is null;
      update public.matches set away_team_id = v_team where away_slot_id = slot.id and away_team_id is null;
    end if;
  end loop;

  -- (2) League seed slots (1st..Nth) — resolved only once every league match
  --     (round_robin / group stage) is completed, so the table is final.
  select count(*), count(*) filter (where status = 'completed')
    into v_total, v_done
    from public.matches
   where tournament_id = p_tournament_id and stage in ('round_robin', 'group');

  if v_total > 0 and v_total = v_done then
    for slot in
      select * from public.bracket_slots
       where tournament_id = p_tournament_id and seed_rank is not null
    loop
      select team_id into v_team
        from public.standings
       where tournament_id = p_tournament_id and group_id is null and rank = slot.seed_rank;

      if v_team is not null and v_team is distinct from slot.resolved_team_id then
        update public.bracket_slots set resolved_team_id = v_team where id = slot.id;
        update public.matches set home_team_id = v_team where home_slot_id = slot.id and home_team_id is null;
        update public.matches set away_team_id = v_team where away_slot_id = slot.id and away_team_id is null;
      end if;
    end loop;
  end if;
end;
$$;

-- --- submit_match_result: reject a tie when draws are not allowed -----------
create or replace function public.submit_match_result(p_match_id uuid, p_went_overtime boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_home uuid; v_away uuid; v_home_score int; v_away_score int;
  v_tournament uuid; v_draws_allowed boolean;
begin
  if not (public.is_admin() or public.is_active_operator_for_match(p_match_id)) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select tournament_id, home_team_id, away_team_id into v_tournament, v_home, v_away
    from public.matches where id = p_match_id;

  select coalesce(sum(points) filter (where team_id = v_home), 0),
         coalesce(sum(points) filter (where team_id = v_away), 0)
    into v_home_score, v_away_score
    from public.match_events where match_id = p_match_id and not voided;

  select draws_allowed into v_draws_allowed from public.tournament_settings where tournament_id = v_tournament;
  if v_home_score = v_away_score and not coalesce(v_draws_allowed, false) then
    raise exception 'Ничья недопустима в баскетболе — сыграйте овертайм и отправьте результат заново.';
  end if;

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

-- --- confirm_match_result: same guard on the authoritative path -------------
create or replace function public.confirm_match_result(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament uuid; v_home uuid; v_away uuid;
  v_home_score int; v_away_score int; v_winner uuid; v_draw boolean;
  v_draws_allowed boolean;
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
  select draws_allowed into v_draws_allowed from public.tournament_settings where tournament_id = v_tournament;
  if v_draw and not coalesce(v_draws_allowed, false) then
    raise exception 'Ничья недопустима — матч должен иметь победителя (овертайм).';
  end if;

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
