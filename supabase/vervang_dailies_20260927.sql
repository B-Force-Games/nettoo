-- Netto: vervang de Daily-reeks door 25 goedgekeurde puzzels vanaf 21 september 2026.
-- Genereer het uitvoerbare bestand met tools/maak_review_dailies.py.
-- Voer NIET deze template uit. Gebruik vervang_dailies_20260927.sql.
--
-- Oude puzzels blijven bestaan; hun oorspronkelijke planning wordt eerst volledig
-- bewaard in daily_replacement_history. De oude Daily-scores worden eenmalig
-- gereset, op verzoek van de eigenaar. Accounts en andere spelmodi blijven intact.
-- Eén transactie. Herhalen archiveert niets opnieuw en wist geen nieuwe scores.
begin;
lock table public.puzzles in share row exclusive mode;
alter table public.puzzles add column if not exists daily_edition text;
create table if not exists public.daily_replacement_history (
  edition text primary key, archived_at timestamptz not null default now(), puzzles jsonb not null
);
alter table public.daily_replacement_history enable row level security;
revoke all on public.daily_replacement_history from anon, authenticated;

create temporary table reviewed_daily_input (
  id uuid primary key, scheduled_date date unique not null, operator text not null,
  question_1 text not null, question_2 text not null, question_3 text not null,
  a1 bigint not null, a2 bigint not null, a3 bigint not null
) on commit drop;
insert into reviewed_daily_input values
  ('b002c770-1319-57bc-9862-8daf6adc94fd', '2026-09-21', '−', 'How many original Pokémon were there?', 'How many centimetres wide is the Mona Lisa?', 'What percentage of Antarctica is covered by ice?', 151, 53, 98),
  ('30cb0de4-308a-5250-b465-776e3a7ed47a', '2026-09-22', '−', 'In what year was the first digital camera developed?', 'How many rooms does Buckingham Palace have?', 'How many kilograms does an adult giraffe weigh?', 1975, 775, 1200),
  ('73c1705e-91ae-51ac-baab-a10b5f934329', '2026-09-23', '÷', 'How many days does Venus take to complete one full rotation?', 'How many bones are in one human hand?', 'How many Muses are there in Greek mythology?', 243, 27, 9),
  ('0b2dafc6-386b-599b-bc96-829a61f50eff', '2026-09-24', '+', 'How many episodes does Breaking Bad have?', 'How many protons does a uranium atom have?', 'How many sonnets did Shakespeare write?', 62, 92, 154),
  ('ffc27a64-007c-51ec-af80-77f7b52cb1cf', '2026-09-25', '×', 'How many consonant letters are in the Thai script?', 'How many symphonies are included in the traditional numbered list of Mozart’s symphonies?', 'In what year was the first steam locomotive built?', 44, 41, 1804),
  ('1b34bb4e-c69b-58e5-9cdb-52d27e0b913a', '2026-09-26', '−', 'How tall is the Eiffel Tower including its antenna?', 'How many dots and power pellets must Pac-Man eat to clear a maze?', 'How many neurons does the human brain contain?', 330, 244, 86),
  ('c889a869-385a-5ef6-b24a-2104cc2c58e4', '2026-09-27', '+', 'How many floors do the Petronas Twin Towers have?', 'How many chemical elements are in the periodic table?', 'How many bones are in an adult human body?', 88, 118, 206),
  ('1bc44f1c-16ca-55f0-820a-7ce2a9b9c862', '2026-09-28', '+', 'How many days does Mars take to orbit the Sun?', 'How many kilometres per hour does sound travel?', 'In what year did the Titanic sink?', 687, 1225, 1912),
  ('51c322d5-120d-5538-89bf-52594d33800b', '2026-09-29', '÷', 'How many metres high is the Burj Khalifa?', 'How many holes are on a standard golf course?', 'How many chromosomes are in a typical human body cell?', 828, 18, 46),
  ('edaa23f0-5d8e-5682-9b6d-d595632e9a62', '2026-09-30', '−', 'How many metres deep is the world’s deepest freshwater lake?', 'How many steps are there from ground level to the 86th floor of the Empire State Building?', 'How many days did the Mayflower’s voyage to North America take?', 1642, 1576, 66),
  ('cfaf10ba-ebd8-51ce-b6eb-a49003d46ce7', '2026-10-01', '×', 'How many grams of sugar are in a 330 ml can of Coca-Cola?', 'How many teeth does an adult dog normally have?', 'How many metres deep is Lake Tanganyika?', 35, 42, 1470),
  ('4b194ce1-6733-50a2-ae70-538cef119256', '2026-10-02', '×', 'How many chromosomes does an onion have in a body cell?', 'How tall was the tallest dog ever?', 'In what year was the New York Stock Exchange founded?', 16, 112, 1792),
  ('5042680c-9027-5fa5-8d94-57672073cbd7', '2026-10-03', '÷', 'How many kilocalories does a McDonald’s Big Mac contain?', 'How many letters does the Turkish alphabet have?', 'How many baby teeth are in a child’s complete set?', 580, 29, 20),
  ('7a0c54a8-485a-5512-af55-84eac4473d59', '2026-10-04', '÷', 'In what year was Apple founded?', 'How many white keys are on a standard concert piano?', 'How old was the oldest cat ever recorded?', 1976, 52, 38),
  ('2b523062-d3d3-56e7-941c-c766a550c37c', '2026-10-05', '×', 'How many stages does the Tour de France usually have?', 'How tall is the Statue of Liberty including its pedestal?', 'In what year was Mount Everest first successfully climbed?', 21, 93, 1953),
  ('9dd13e68-b76d-5876-9976-9f77c5aeae9c', '2026-10-06', '÷', 'How many days is an elephant pregnant?', 'How many letters does the Hebrew alphabet have?', 'How many minutes does one full rotation of the London Eye take?', 660, 22, 30),
  ('6693dd20-4dc7-5eea-9d61-94a16773c651', '2026-10-07', '×', 'How many books are in the main Harry Potter series?', 'How many electors make up the US Electoral College?', 'How long is the Mississippi River?', 7, 538, 3766),
  ('b643cba0-235e-5651-bb74-e19d13483250', '2026-10-08', '−', 'How many meters tall is the Shanghai Tower?', 'How fast did the Shanghai Maglev travel at its former top operating speed?', 'How many episodes does the US version of The Office have?', 632, 431, 201),
  ('f9cbcad8-3038-5eff-b02c-3f0a1b40adaf', '2026-10-09', '+', 'How many days is a cow pregnant?', 'How many electoral votes are needed to win a U.S. presidential election?', 'How many metres high is the CN Tower?', 283, 270, 553),
  ('e0a626b3-89dc-507e-9020-8b99025244db', '2026-10-10', '−', 'How many squares are on a standard chessboard?', 'What percentage of Earth’s surface is land?', 'How many Grammy Awards has Beyoncé won?', 64, 29, 35),
  ('8643e529-1906-58fb-9d54-064446aae3c3', '2026-10-11', '−', 'In what year was Nintendo founded?', 'How many meters deep is the Grand Canyon at its deepest point?', 'How many piano sonatas did Beethoven compose?', 1889, 1857, 32),
  ('a2184b34-b536-51f2-a9eb-eedc7d97af93', '2026-10-12', '×', 'How many million tonnes of bananas were produced worldwide in 2022?', 'How many minutes does a full day-and-night cycle last in Minecraft?', 'How many kilograms does a blue whale’s tongue weigh?', 135, 20, 2700),
  ('12527657-e5de-5554-9d64-c4c929982417', '2026-10-13', '×', 'How many thousand kilometers of submarine internet cables are in service worldwide?', 'How many times does the International Space Station orbit Earth in one day?', 'How many standard 20-foot containers can the world’s largest container ship carry?', 1500, 16, 24000),
  ('77c04fb0-0927-5f4d-a232-9c26337f67c0', '2026-10-14', '+', 'How many EU countries adopted the euro when it was launched in 1999?', 'How many squares are on a standard Scrabble board?', 'How many episodes of Friends were made?', 11, 225, 236),
  ('78725b72-4430-5906-be10-5de82dc6e5d2', '2026-10-15', '+', 'How many strings does a standard concert pedal harp have?', 'How many facets does a standard round brilliant diamond have?', 'How many satellites did India launch on a single rocket in its 2017 record mission?', 47, 57, 104)
;
do $$
begin
  if (select count(*) from reviewed_daily_input) <> 25 then
    raise exception 'De selectie moet precies 25 Dailies bevatten';
  end if;
  if exists (select 1 from reviewed_daily_input where a1 <= 0 or a2 <= 0 or a3 <= 0
    or case operator when '+' then a1+a2 <> a3 when '−' then a1-a2 <> a3
       when '×' then a1*a2 <> a3 when '÷' then a1 <> a2*a3 else true end) then
    raise exception 'Ongeldige vergelijking in de selectie';
  end if;
  if not exists (select 1 from public.daily_replacement_history where edition='reviewed-20260927') then
    insert into public.daily_replacement_history(edition,puzzles)
      select 'reviewed-20260927',coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb)
      from public.puzzles p where p.scheduled_date is not null;
    -- Alleen Daily-scores resetten. Bij herhalen blijven nieuwe scores behouden.
    delete from public.user_plays;
    delete from public.archive_plays;
    -- De oude vragen en UUID's blijven als niet-ingeplande rijen bewaard.
    update public.puzzles set scheduled_date=null where scheduled_date is not null;
  end if;
end $$;
insert into public.puzzles(id,scheduled_date,operator,question_1,question_2,question_3,
                          true_answer_1,true_answer_2,true_answer_3,status,daily_edition)
select id,scheduled_date,operator,question_1,question_2,question_3,a1,a2,a3,'scheduled','reviewed-20260927'
from reviewed_daily_input
on conflict(id) do nothing;
do $$
begin
  if exists (select 1 from reviewed_daily_input i left join public.puzzles p on p.id=i.id
    where p.id is null or p.scheduled_date is distinct from i.scheduled_date
    or p.operator is distinct from i.operator or p.status <> 'scheduled'
    or p.daily_edition is distinct from 'reviewed-20260927'
    or p.question_1 is distinct from i.question_1 or p.question_2 is distinct from i.question_2
    or p.question_3 is distinct from i.question_3
    or p.true_answer_1 is distinct from i.a1 or p.true_answer_2 is distinct from i.a2
    or p.true_answer_3 is distinct from i.a3) then
    raise exception 'Bestaande puzzel wijkt af: transactie afgebroken zonder scores te veranderen';
  end if;
end $$;

commit;
select scheduled_date,question_1,operator from public.puzzles
where daily_edition='reviewed-20260927' order by scheduled_date;
