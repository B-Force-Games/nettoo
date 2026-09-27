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
-- SELECTIE_WAARDEN
;
do $$
begin
  if (select count(*) from quality_daily_input) <> SELECTIE_AANTAL then
    raise exception 'Onvolledige kwaliteitsselectie';
  end if;
  if exists (select 1 from quality_daily_input where a1<=0 or a2<=0 or a3<=0
    or case operator when '+' then a1+a2<>a3 when '−' then a1-a2<>a3
       when '×' then a1*a2<>a3 when '÷' then a1<>a2*a3 else true end) then
    raise exception 'Ongeldige vergelijking';
  end if;
  if exists (select 1 from public.puzzles where scheduled_date is not null
    and daily_edition is distinct from 'reviewed-20260927'
    and daily_edition is distinct from 'SELECTIE_EDITIE') then
    raise exception 'Onbekende actieve Daily-editie: controleer eerst de bestaande planning';
  end if;
  if not exists (select 1 from public.daily_quality_history where edition='SELECTIE_EDITIE') then
    if exists(select 1 from public.puzzles where daily_edition='SELECTIE_EDITIE') then
      raise exception 'De nieuwe editie bestaat al zonder herstelarchief';
    end if;
    insert into public.daily_quality_history(edition,puzzles,user_plays,archive_plays)
    values ('SELECTIE_EDITIE',
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
select id,scheduled_date,operator,question_1,question_2,question_3,a1,a2,a3,'scheduled','SELECTIE_EDITIE'
from quality_daily_input on conflict(id) do nothing;
do $$
begin
  if exists(select 1 from quality_daily_input i left join public.puzzles p on p.id=i.id
    where p.id is null or p.scheduled_date is distinct from i.scheduled_date
      or p.daily_edition is distinct from 'SELECTIE_EDITIE' or p.status is distinct from 'scheduled'
      or p.operator is distinct from i.operator or p.question_1 is distinct from i.question_1
      or p.question_2 is distinct from i.question_2 or p.question_3 is distinct from i.question_3
      or p.true_answer_1 is distinct from i.a1 or p.true_answer_2 is distinct from i.a2
      or p.true_answer_3 is distinct from i.a3) then
    raise exception 'Bestaande inhoud wijkt af; gehele transactie teruggedraaid';
  end if;
end $$;
commit;
select scheduled_date,question_1,operator from public.puzzles
where daily_edition='SELECTIE_EDITIE' order by scheduled_date;
