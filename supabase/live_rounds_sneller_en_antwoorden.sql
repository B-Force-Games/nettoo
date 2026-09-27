-- Bewaar ronde-antwoorden veilig voor het eindscherm en houd de overgang kort.
-- Voer dit na live_rounds.sql uit. De bestaande lobby's en scores blijven staan.
begin;

create table if not exists netto_live.round_results (
  code text not null references netto_live.rooms on delete cascade,
  round_no integer not null,
  puzzle jsonb not null,
  winner uuid,
  players jsonb not null,
  primary key (code, round_no)
);
alter table netto_live.round_results enable row level security;
revoke all on netto_live.round_results from public, anon, authenticated;

create or replace function netto_live.advance(p_code text, p_now timestamptz)
returns void language plpgsql security definer set search_path = pg_catalog, netto_live as $$
declare r netto_live.rooms%rowtype; winning uuid; results jsonb;
begin
  select * into r from netto_live.rooms where code=p_code for update;
  if r.phase='lobby' then return; end if;
  if r.phase='playing' then
    -- Verlopen heartbeats zijn voor deze ronde geen geldige inzending.
    update netto_live.members set disqualified_round=r.round_no
      where code=p_code and seen_at < p_now-interval '12 seconds';
    if p_now >= r.deadline or (p_now >= r.starts_at and not exists (
      select 1 from netto_live.members m where m.code=p_code
      and not exists (select 1 from netto_live.submissions s
        where s.code=p_code and s.round_no=r.round_no and s.user_id=m.user_id)
    )) then
      select s.user_id into winning from netto_live.submissions s
        join netto_live.members m on m.code=s.code and m.user_id=s.user_id
        where s.code=p_code and s.round_no=r.round_no and m.disqualified_round<>r.round_no
        order by s.factor, s.submitted_at, s.sequence limit 1;
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',m.user_id,'name',m.name,
        'answers',case when m.disqualified_round=r.round_no then null else to_jsonb(s.answers) end,
        'factor',case when m.disqualified_round=r.round_no then null else to_jsonb(s.factor) end
      ) order by m.joined_at),'[]'::jsonb) into results
        from netto_live.members m left join netto_live.submissions s
          on s.code=m.code and s.round_no=r.round_no and s.user_id=m.user_id
        where m.code=p_code;
      insert into netto_live.round_results(code,round_no,puzzle,winner,players)
        values(p_code,r.round_no,r.puzzle,winning,results)
        on conflict (code,round_no) do nothing;
      update netto_live.members set points=points+1 where code=p_code and user_id=winning;
      update netto_live.rooms set phase='reveal', winner=winning, deadline=p_now+interval '4 seconds'
        where code=p_code;
    end if;
  elsif r.phase='reveal' and p_now >= r.deadline then
    if r.round_no >= r.rounds then
      update netto_live.rooms set phase='finished',deadline=null where code=p_code;
    else
      update netto_live.rooms set phase='playing',round_no=round_no+1,winner=null,
        puzzle=(select puzzle from netto_live.puzzles where id<>coalesce(r.puzzle->>'id','') order by random() limit 1),
        starts_at=p_now+interval '1 second',deadline=p_now+make_interval(secs=>r.seconds+1)
        where code=p_code;
    end if;
  end if;
end $$;
revoke all on function netto_live.advance(text,timestamptz) from public,anon,authenticated;

-- Alleen leden van een afgeronde wedstrijd mogen de volledige geschiedenis ophalen.
create or replace function public.live_rounds_results(p_code text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, netto_live as $$
declare uid uuid := auth.uid(); room_code text := upper(trim(p_code)); result jsonb;
begin
  if uid is null then raise exception 'LOGIN_REQUIRED'; end if;
  if not exists (select 1 from netto_live.rooms r where r.code=room_code and r.phase='finished')
    then raise exception 'MATCH_NOT_FINISHED'; end if;
  if not exists (select 1 from netto_live.members m where m.code=room_code and m.user_id=uid)
    then raise exception 'NOT_A_MEMBER'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'round',r.round_no,'puzzle',r.puzzle,'winner',r.winner,'players',r.players
  ) order by r.round_no),'[]'::jsonb) into result
    from netto_live.round_results r where r.code=room_code;
  return result;
end $$;
revoke all on function public.live_rounds_results(text) from public,anon;
grant execute on function public.live_rounds_results(text) to authenticated;
notify pgrst, 'reload schema';
commit;
