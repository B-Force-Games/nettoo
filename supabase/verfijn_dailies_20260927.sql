-- TEMPLATE: uitvoeren via het gegenereerde verfijn_dailies_20260927.sql.
-- Vervangt alleen de huidige review-Dailies. Bestaande inhoud en betrokken
-- Daily-scores worden eerst herstelbaar opgeslagen. Accounts en andere modi
-- blijven intact. Niet automatisch uitvoeren: lokaal previewen vereist geen SQL.
begin;
lock table public.puzzles in share row exclusive mode;
lock table public.user_plays in share row exclusive mode;
lock table public.archive_plays in share row exclusive mode;
create table if not exists public.daily_quality_history (
  edition text primary key, archived_at timestamptz not null default now(),
  puzzles jsonb not null, user_plays jsonb not null, archive_plays jsonb not null
);
alter table public.daily_quality_history enable row level security;
revoke all on public.daily_quality_history from anon, authenticated;
create temporary table quality_daily_input (
  id uuid primary key, scheduled_date date unique not null, operator text not null,
  question_1 text not null, question_2 text not null, question_3 text not null,
  a1 bigint not null, a2 bigint not null, a3 bigint not null
) on commit drop;
insert into quality_daily_input values
  ('20253ced-7ec5-5323-b339-6a78b81ffcf5', '2026-09-21', '−', 'How many original Pokémon were there?', 'How many centimetres wide is the Mona Lisa?', 'What percentage of Antarctica is covered by ice?', 151, 53, 98),
  ('0896861a-1a4f-5bfa-bb00-a9ff9418548a', '2026-09-22', '+', 'How many lifeboats did the Titanic carry?', 'How many kilometres long is the Channel Tunnel?', 'What percentage of Australia is desert or arid land?', 20, 50, 70),
  ('f0722ae5-5ba7-5d39-ba27-a15bd2ab1cc8', '2026-09-23', '÷', 'How many wingbeats per second can a hummingbird reach?', 'How many rings are in the Olympic symbol?', 'How many pieces does each player start with in chess?', 80, 5, 16),
  ('a23cb364-1739-55d6-a7bd-e90a2692ddc2', '2026-09-24', '−', 'In what year was the first digital camera developed?', 'How many rooms does Buckingham Palace have?', 'How many kilograms does an adult giraffe weigh?', 1975, 775, 1200),
  ('509fe953-9b6a-5584-b6d6-fdc09bdcaf6d', '2026-09-25', '×', 'What percentage of the human body is water?', 'How many horizontal stripes are on the flag of the Netherlands?', 'About how many kilograms does a blue whale''s heart weigh?', 60, 3, 180),
  ('a2074395-f518-5924-b9d4-16f25032daf1', '2026-09-26', '+', 'How many kilocalories are in a McDonald’s cheeseburger in the United States?', 'How many days does Ramadan last?', 'How tall is the Eiffel Tower including its antenna?', 300, 30, 330),
  ('97a5dd0a-7948-559c-8fba-8ca112723546', '2026-09-27', '×', 'How many cards does each player start with in UNO?', 'How many players are on the court at once in basketball?', 'How many years did Elizabeth II reign?', 7, 10, 70),
  ('d1edfefa-83c4-57c2-8cf0-4d4a98c9a674', '2026-09-28', '+', 'How many days does Mars take to orbit the Sun?', 'How many kilometres per hour does sound travel?', 'In what year did the Titanic sink?', 687, 1225, 1912),
  ('52312ae1-78da-521a-b810-3a8e0aee1976', '2026-09-29', '+', 'How many teeth does a typical adult human have?', 'How many stars are on the flag of the United States?', 'How many kilometres long is the Panama Canal?', 32, 50, 82),
  ('2d9689a1-b04e-5b54-b29d-ff48975908a0', '2026-09-30', '÷', 'In what year was Apple founded?', 'How many white keys are on a standard concert piano?', 'How old was the oldest cat ever recorded?', 1976, 52, 38),
  ('6fea3460-291d-5414-b2f6-a2057a4dd3a1', '2026-10-01', '×', 'How many seasons does Friends have?', 'How many players are on the field in a football match altogether?', 'How many kilograms does an adult male Bengal tiger weigh?', 10, 22, 220),
  ('a358fd8d-24c4-52d8-a2aa-e538704391f4', '2026-10-02', '×', 'How many stages does the Tour de France usually have?', 'How tall is the Statue of Liberty including its pedestal?', 'In what year was Mount Everest first successfully climbed?', 21, 93, 1953),
  ('37bac17f-3638-501f-842d-a1621448bad4', '2026-10-03', '÷', 'How many countries are members of NATO?', 'How many recognized planets are in our Solar System?', 'How many main islands does Japan have?', 32, 8, 4),
  ('373a1de6-b1ab-50d0-94e1-86f68b439a7b', '2026-10-04', '−', 'How many squares are on a standard chessboard?', 'What percentage of Earth’s surface is land?', 'How many Grammy Awards has Beyoncé won?', 64, 29, 35),
  ('8c3d1a95-8c2e-57c8-a4b0-e16210e086a8', '2026-10-05', '+', 'At how many degrees Celsius does water boil at sea level?', 'How long is one lap of a standard outdoor athletics track?', 'How many seconds does sunlight take to reach Earth?', 100, 400, 500),
  ('e86c10f9-f712-5b6b-99b3-16be78feb079', '2026-10-06', '+', 'How many legs does a spider have?', 'How many darts does a player throw in a standard turn?', 'How many time zones does Russia have?', 8, 3, 11),
  ('a47caa66-5fda-59df-8efa-91e7fd0b5564', '2026-10-07', '÷', 'How many kilocalories does a McDonald’s Big Mac contain?', 'How many letters does the Turkish alphabet have?', 'How many baby teeth are in a child’s complete set?', 580, 29, 20),
  ('354d31c1-51eb-5f30-b708-e082f71feff3', '2026-10-08', '−', 'How many points can you score in one turn in darts?', 'How many states make up the United States?', 'How many million people live in Mexico?', 180, 50, 130),
  ('ed6309d5-56a4-52b9-ba83-cb35ba45acb1', '2026-10-09', '+', 'How many EU countries adopted the euro when it was launched in 1999?', 'How many squares are on a standard Scrabble board?', 'How many episodes of Friends were made?', 11, 225, 236),
  ('63ccd7f7-c1a5-59ed-8545-49fc90d5be5d', '2026-10-10', '−', 'How many million people live in Colombia?', 'How many spaces are on a standard Monopoly board?', 'How many stripes are on the flag of the United States?', 53, 40, 13)
;
do $$
begin
  if (select count(*) from quality_daily_input) <> 20 then
    raise exception 'Onvolledige kwaliteitsselectie';
  end if;
  if exists (select 1 from quality_daily_input where a1<=0 or a2<=0 or a3<=0
    or case operator when '+' then a1+a2<>a3 when '−' then a1-a2<>a3
       when '×' then a1*a2<>a3 when '÷' then a1<>a2*a3 else true end) then
    raise exception 'Ongeldige vergelijking';
  end if;
  if exists (select 1 from public.puzzles where scheduled_date is not null
    and daily_edition is distinct from 'reviewed-20260927'
    and daily_edition is distinct from 'daily-curated-20260927') then
    raise exception 'Onbekende actieve Daily-editie: controleer eerst de bestaande planning';
  end if;
  if not exists (select 1 from public.daily_quality_history where edition='daily-curated-20260927') then
    if exists(select 1 from public.puzzles where daily_edition='daily-curated-20260927') then
      raise exception 'De nieuwe editie bestaat al zonder herstelarchief';
    end if;
    insert into public.daily_quality_history(edition,puzzles,user_plays,archive_plays)
    values ('daily-curated-20260927',
      (select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from public.puzzles p where scheduled_date is not null),
      (select coalesce(jsonb_agg(to_jsonb(u)),'[]'::jsonb) from public.user_plays u
        where puzzle_date in (select scheduled_date from public.puzzles where scheduled_date is not null
                             union select scheduled_date from quality_daily_input)),
      (select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from public.archive_plays a where puzzle_no between 1 and 25));
    -- Oude nummers 1–25 worden vervangen; scorebetekenis mag niet meeverhuizen.
    delete from public.user_plays where puzzle_date in (
      select scheduled_date from public.puzzles where scheduled_date is not null
      union select scheduled_date from quality_daily_input);
    delete from public.archive_plays where puzzle_no between 1 and 25;
    update public.puzzles set scheduled_date=null where scheduled_date is not null;
  end if;
end $$;
insert into public.puzzles(id,scheduled_date,operator,question_1,question_2,question_3,
  true_answer_1,true_answer_2,true_answer_3,status,daily_edition)
select id,scheduled_date,operator,question_1,question_2,question_3,a1,a2,a3,'scheduled','daily-curated-20260927'
from quality_daily_input on conflict(id) do nothing;
do $$
begin
  if exists(select 1 from quality_daily_input i left join public.puzzles p on p.id=i.id
    where p.id is null or p.scheduled_date is distinct from i.scheduled_date
      or p.daily_edition is distinct from 'daily-curated-20260927' or p.status is distinct from 'scheduled'
      or p.operator is distinct from i.operator or p.question_1 is distinct from i.question_1
      or p.question_2 is distinct from i.question_2 or p.question_3 is distinct from i.question_3
      or p.true_answer_1 is distinct from i.a1 or p.true_answer_2 is distinct from i.a2
      or p.true_answer_3 is distinct from i.a3) then
    raise exception 'Bestaande inhoud wijkt af; gehele transactie teruggedraaid';
  end if;
end $$;
commit;
select scheduled_date,question_1,operator from public.puzzles
where daily_edition='daily-curated-20260927' order by scheduled_date;
