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
-- SELECTIE_WAARDEN
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
