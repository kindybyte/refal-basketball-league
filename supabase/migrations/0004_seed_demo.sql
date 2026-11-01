-- =============================================================================
-- REFAL Basketball League
-- Migration 0004: consent notice text + clearly-labelled DEMO data
--
-- Every row here is is_demo = true and uses synthetic names. This is NOT real
-- personal data (spec §7, §11.6, §17). Admins can delete the demo tournament
-- from the panel before running the real event.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Consent notice (versioned). Edit/append new versions over time; never mutate
-- an old version that players have already signed.
-- -----------------------------------------------------------------------------
insert into public.consent_text_versions (version, body_md)
values (
  '2026-11-v1',
$md$## Согласие на обработку и публикацию персональных данных

**Организатор (оператор персональных данных):** оргкомитет турнира «REFAL Basketball League», площадка «Рефал», г. Бишкек, Кыргызская Республика.

**Какие данные обрабатываются:** имя, фамилия, игровой номер, команда, игровая статистика. Контактные данные (телефон, e-mail) собираются только при наличии отдельной необходимости и никогда не публикуются.

**Цели:** организация и проведение баскетбольного турнира, ведение статистики, публикация результатов.

**Что может быть опубликовано (только с вашего согласия):**
- ваши имя и фамилия в составах команд и результатах;
- ваша индивидуальная игровая статистика, связанная с вашим именем.

**Кто увидит публикацию:** любой посетитель публичного сайта турнира.

**Где обрабатываются данные:** на инфраструктуре облачного провайдера. При трансграничной передаче организатор обязан обеспечить правовое основание по ст. 89 Цифрового кодекса КР.

**Срок хранения:** на время проведения турнира и ограниченный период для подведения итогов; затем данные удаляются или обезличиваются.

**Ваши права:** вы можете отказаться от публичного размещения ФИО и при этом участвовать в турнире под нейтральным обозначением. Вы можете в любой момент запросить доступ, исправление, отзыв согласия и удаление данных.

**Как связаться / отозвать согласие:** через оргкомитет турнира.
$md$
)
on conflict (version) do nothing;

-- -----------------------------------------------------------------------------
-- Demo tournament
-- -----------------------------------------------------------------------------
do $seed$
declare
  v_t uuid;
  v_g1 uuid; v_g2 uuid;
  v_group_ids uuid[];
  v_teamnames text[] := array[
    'Манас Старс','Ала-Тоо Иглз','Чуй Тайгерс','Иссык-Куль Вэйвз',
    'Тянь-Шань Беарс','Нарын Фолконз','Ош Лайтнинг','Бишкек Кингз'
  ];
  v_shorts text[] := array['MNS','ALT','CHU','ISK','TNS','NRN','OSH','BSH'];
  v_colors text[] := array['#E8793A','#2F6FEB','#1FA463','#B5453B','#7A4FD1','#E0A526','#17A2B8','#444B55'];
  v_first text[] := array['Азамат','Бакыт','Данияр','Эржан','Нурлан','Темир','Руслан','Канат','Марат','Эмир'];
  v_last  text[] := array['Осмонов','Бейшеев','Турсунов','Асанов','Жумабеков','Садыков','Калыков','Исаков'];
  v_teams uuid[] := '{}';
  v_tid uuid;
  v_grp uuid;
  i int; j int;
  v_day date := date '2026-11-03';
  v_slot_time time;
  v_match_counter int := 0;
  -- round-robin pairings for a 4-team group (indices into the group's 4 teams)
  v_pairs int[][] := array[array[1,2],array[3,4],array[1,3],array[2,4],array[1,4],array[2,3]];
  a int; b int;
  v_sf1 uuid; v_sf2 uuid; v_fin uuid; v_tp uuid;  -- bracket slots
  v_m_sf1 uuid; v_m_sf2 uuid;
begin
  insert into public.tournaments (name, venue, city, status, is_demo)
  values ('REFAL Basketball League (ДЕМО)', 'Рефал', 'Бишкек', 'ongoing', true)
  returning id into v_t;

  insert into public.tournament_settings (
    tournament_id, format, start_date, end_date, daily_start_time, daily_end_time,
    match_duration_min, break_between_min, min_rest_hours, courts_count,
    third_place_match, min_games_for_leaders, periods_per_game
  ) values (
    v_t, 'groups_playoff', date '2026-11-03', date '2026-11-30', '18:00', '23:00',
    80, 15, 20, 1, true, 1, 4
  );

  insert into public.tournament_groups (tournament_id, name, group_index)
    values (v_t, 'Группа A', 1) returning id into v_g1;
  insert into public.tournament_groups (tournament_id, name, group_index)
    values (v_t, 'Группа B', 2) returning id into v_g2;
  v_group_ids := array[v_g1, v_g2];

  -- Teams + players
  for i in 1..8 loop
    v_grp := v_group_ids[ ((i-1)/4) + 1 ];
    insert into public.teams (tournament_id, group_id, name, short_name, color, status, is_demo)
    values (v_t, v_grp, v_teamnames[i], v_shorts[i], v_colors[i], 'active', true)
    returning id into v_tid;
    v_teams := array_append(v_teams, v_tid);

    for j in 1..6 loop
      insert into public.players (
        tournament_id, team_id, internal_code, first_name, last_name,
        jersey_number, status, is_demo
      ) values (
        v_t, v_tid,
        'DEMO-' || v_shorts[i] || '-' || j::text,
        v_first[ ((i*3 + j) % 10) + 1 ],
        v_last[ ((i + j) % 8) + 1 ],
        (j * 3 + 4),  -- 7,10,13,16,19,22 — unique within team
        'active', true
      );
    end loop;
  end loop;

  -- Group-stage round-robin matches (one court, spaced by day)
  for i in 0..1 loop                               -- group 0 (teams 1..4), group 1 (teams 5..8)
    v_grp := v_group_ids[i+1];
    for j in 1..6 loop                             -- 6 pairings per group
      a := v_pairs[j][1] + i*4;
      b := v_pairs[j][2] + i*4;
      -- two matches per day: 18:00 and 19:45
      if v_match_counter % 2 = 0 and v_match_counter > 0 then
        v_day := v_day + 1;
      end if;
      v_slot_time := case when v_match_counter % 2 = 0 then time '18:00' else time '19:45' end;
      insert into public.matches (
        tournament_id, group_id, stage, round_number,
        home_team_id, away_team_id, scheduled_at, court_number, duration_min, status, is_demo
      ) values (
        v_t, v_grp, 'group', ((j-1)/2)+1,
        v_teams[a], v_teams[b],
        (v_day + v_slot_time)::timestamptz, 1, 80, 'scheduled', true
      );
      v_match_counter := v_match_counter + 1;
    end loop;
  end loop;

  -- Playoff bracket slots: winners/runners-up of each group feed the semifinals.
  insert into public.bracket_slots (tournament_id, stage, slot_index, label) values
    (v_t, 'semifinal', 1, 'Победитель группы A'),
    (v_t, 'semifinal', 2, 'Второе место группы B'),
    (v_t, 'semifinal', 3, 'Победитель группы B'),
    (v_t, 'semifinal', 4, 'Второе место группы A');
  insert into public.bracket_slots (tournament_id, stage, slot_index, label) values
    (v_t, 'final', 1, 'Победитель ПФ-1'),
    (v_t, 'final', 2, 'Победитель ПФ-2'),
    (v_t, 'third_place', 1, 'Проигравший ПФ-1'),
    (v_t, 'third_place', 2, 'Проигравший ПФ-2');

  select id into v_sf1 from public.bracket_slots where tournament_id = v_t and stage='semifinal' and slot_index=1;
  select id into v_sf2 from public.bracket_slots where tournament_id = v_t and stage='semifinal' and slot_index=3;

  -- Semifinal matches (teams unknown yet → use slot placeholders)
  v_day := v_day + 2;
  insert into public.matches (tournament_id, stage, round_number, home_slot_id, away_slot_id, scheduled_at, court_number, duration_min, status, is_demo)
  values (v_t, 'semifinal', 1,
    (select id from public.bracket_slots where tournament_id=v_t and stage='semifinal' and slot_index=1),
    (select id from public.bracket_slots where tournament_id=v_t and stage='semifinal' and slot_index=2),
    (v_day + time '18:00')::timestamptz, 1, 80, 'scheduled', true)
  returning id into v_m_sf1;

  insert into public.matches (tournament_id, stage, round_number, home_slot_id, away_slot_id, scheduled_at, court_number, duration_min, status, is_demo)
  values (v_t, 'semifinal', 1,
    (select id from public.bracket_slots where tournament_id=v_t and stage='semifinal' and slot_index=3),
    (select id from public.bracket_slots where tournament_id=v_t and stage='semifinal' and slot_index=4),
    (v_day + time '19:45')::timestamptz, 1, 80, 'scheduled', true)
  returning id into v_m_sf2;

  -- Final + third place feed from the semifinals.
  update public.bracket_slots set source_match_id = v_m_sf1, takes_winner = true
    where tournament_id=v_t and stage='final' and slot_index=1;
  update public.bracket_slots set source_match_id = v_m_sf2, takes_winner = true
    where tournament_id=v_t and stage='final' and slot_index=2;
  update public.bracket_slots set source_match_id = v_m_sf1, takes_winner = false
    where tournament_id=v_t and stage='third_place' and slot_index=1;
  update public.bracket_slots set source_match_id = v_m_sf2, takes_winner = false
    where tournament_id=v_t and stage='third_place' and slot_index=2;

  v_day := v_day + 2;
  insert into public.matches (tournament_id, stage, round_number, home_slot_id, away_slot_id, scheduled_at, court_number, duration_min, status, is_demo)
  values (v_t, 'third_place', 1,
    (select id from public.bracket_slots where tournament_id=v_t and stage='third_place' and slot_index=1),
    (select id from public.bracket_slots where tournament_id=v_t and stage='third_place' and slot_index=2),
    (v_day + time '18:00')::timestamptz, 1, 80, 'scheduled', true);

  insert into public.matches (tournament_id, stage, round_number, home_slot_id, away_slot_id, scheduled_at, court_number, duration_min, status, is_demo)
  values (v_t, 'final', 1,
    (select id from public.bracket_slots where tournament_id=v_t and stage='final' and slot_index=1),
    (select id from public.bracket_slots where tournament_id=v_t and stage='final' and slot_index=2),
    (v_day + time '20:00')::timestamptz, 1, 80, 'scheduled', true);

  -- Initialise an empty standings table for the demo tournament.
  perform public.recompute_standings(v_t);
end
$seed$;
