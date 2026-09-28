-- Laat de database dezelfde Londense kalenderdag gebruiken als de frontend.
-- Uitvoeren in de Supabase SQL Editor. Veilig om opnieuw uit te voeren.
begin;
drop policy if exists puzzles_select_published on public.puzzles;
create policy puzzles_select_published
  on public.puzzles for select
  to anon, authenticated
  using (
    status = 'scheduled'
    and scheduled_date <= (now() at time zone 'Europe/London')::date
  );
commit;
