-- Live Rondes: instelbaar maximum van 2–8 spelers, server-side bewaakt.
-- Uitvoeren NA live_rounds_lobby_options.sql. Bestaande rooms behouden maximaal 8 spelers.
begin;
alter table netto_live.rooms add column if not exists max_players integer not null default 8 check (max_players between 2 and 8);

create or replace function public.live_rounds(p_action text, p_code text default null, p_options jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, netto_live as $$
declare
  uid uuid := auth.uid(); r netto_live.rooms%rowtype; member netto_live.members%rowtype;
  t timestamptz; room_code text; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  player_name text; seconds integer; rounds integer; capacity integer; a numeric[]; actual numeric[];
  f numeric; op text; idx integer; players jsonb; shown_puzzle jsonb; mine jsonb;
begin
  if uid is null then raise exception 'LOGIN_REQUIRED'; end if;
  if p_action='available' then
    return jsonb_build_object('available', (select count(*)>=2 from netto_live.puzzles), 'lobbyOptions', true, 'maxPlayers', true);
  end if;
  if p_action='create' then
    if (select count(*) from netto_live.puzzles)<2 then raise exception 'PUZZLES_MISSING'; end if;
    if (p_options ? 'requireEquation' and jsonb_typeof(p_options->'requireEquation') <> 'boolean')
      or (p_options ? 'showAnswers' and jsonb_typeof(p_options->'showAnswers') <> 'boolean')
      then raise exception 'INVALID_SETTINGS'; end if;
    if p_options ? 'maxPlayers' and (jsonb_typeof(p_options->'maxPlayers') <> 'number' or (p_options->>'maxPlayers') !~ '^[2-8]$') then raise exception 'INVALID_CAPACITY'; end if;
    capacity:=coalesce((p_options->>'maxPlayers')::integer,8);
    seconds := (p_options->>'seconds')::integer; rounds := (p_options->>'rounds')::integer;
    if seconds is null or seconds not between 5 and 3600 or rounds is null or rounds not between 1 and 1000
      then raise exception 'INVALID_SETTINGS'; end if;
    -- Eén verse wachtkamer per host, zonder een lopende wedstrijd te verwijderen.
    delete from netto_live.rooms where host=uid and phase='lobby';
    if (select count(*) from netto_live.rooms where host=uid and phase in ('playing','reveal') and expires_at>clock_timestamp())>=3
      then raise exception 'TOO_MANY_ROOMS'; end if;
    loop
      room_code := '';
      for idx in 1..6 loop room_code:=room_code||substr(alphabet,1+floor(random()*length(alphabet))::integer,1); end loop;
      insert into netto_live.rooms(code,host,visibility,seconds,rounds,require_equation,show_answers,max_players)
        values(room_code,uid,case when p_options->>'visibility'='open' then 'open' else 'closed' end,seconds,rounds,
          coalesce((p_options->>'requireEquation')::boolean,true),coalesce((p_options->>'showAnswers')::boolean,false),capacity)
        on conflict do nothing;
      exit when found;
    end loop;
    p_code:=room_code;
  end if;
  p_code:=upper(trim(p_code));
  select * into r from netto_live.rooms where code=p_code and expires_at>clock_timestamp() for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  t:=clock_timestamp();
  select * into member from netto_live.members where code=p_code and user_id=uid;
  if p_action in ('create','join') then
    if member.user_id is null then
      if r.phase<>'lobby' then raise exception 'MATCH_STARTED'; end if;
      delete from netto_live.members where code=p_code and seen_at<t-interval '12 seconds';
      if (select count(*) from netto_live.members where code=p_code)>=r.max_players then raise exception 'ROOM_FULL'; end if;
      player_name:=left(coalesce(nullif(trim(auth.jwt()->'user_metadata'->>'username'),''),'Player'),40);
      insert into netto_live.members(code,user_id,name) values(p_code,uid,player_name);
    end if;
  elsif member.user_id is null then raise exception 'NOT_A_MEMBER';
  end if;
  -- Eerst verlopen leases vastleggen, pas daarna de teruggekeerde speler verversen.
  if r.phase='playing' then
    update netto_live.members set disqualified_round=r.round_no where code=p_code and seen_at<t-interval '12 seconds';
  end if;
  update netto_live.members set seen_at=t where code=p_code and user_id=uid;
  if p_action='leave' then
    if r.phase='lobby' then
      delete from netto_live.members where code=p_code and user_id=uid;
      if r.host=uid then
        update netto_live.rooms set host=(select user_id from netto_live.members where code=p_code order by joined_at limit 1)
          where code=p_code and exists(select 1 from netto_live.members where code=p_code);
        delete from netto_live.rooms where code=p_code and not exists(select 1 from netto_live.members where code=p_code);
      end if;
    else
      update netto_live.members set seen_at=t-interval '1 day',disqualified_round=r.round_no where code=p_code and user_id=uid;
    end if;
    return jsonb_build_object('left',true);
  end if;
  if r.phase='lobby' then
    delete from netto_live.members where code=p_code and seen_at<t-interval '12 seconds';
    if not exists(select 1 from netto_live.members where code=p_code and user_id=r.host) then
      update netto_live.rooms set host=(select user_id from netto_live.members where code=p_code order by joined_at limit 1) where code=p_code;
      select * into r from netto_live.rooms where code=p_code;
    end if;
  end if;
  if p_action='settings' then
    if r.host<>uid then raise exception 'HOST_ONLY'; end if;
    if r.phase<>'lobby' then raise exception 'MATCH_STARTED'; end if;
    if jsonb_typeof(p_options->'requireEquation') is distinct from 'boolean'
      or jsonb_typeof(p_options->'showAnswers') is distinct from 'boolean'
      then raise exception 'INVALID_SETTINGS'; end if;
    if p_options ? 'maxPlayers' and (jsonb_typeof(p_options->'maxPlayers') <> 'number' or (p_options->>'maxPlayers') !~ '^[2-8]$') then raise exception 'INVALID_CAPACITY'; end if;
    if p_options ? 'maxPlayers' and (p_options->>'maxPlayers')::integer<>r.max_players then raise exception 'CAPACITY_LOCKED'; end if;
    update netto_live.rooms set require_equation=(p_options->>'requireEquation')::boolean,
      show_answers=(p_options->>'showAnswers')::boolean where code=p_code;
  elsif p_action='start' then
    if r.host<>uid then raise exception 'HOST_ONLY'; end if;
    if r.phase='lobby' then
      if (select count(*) from netto_live.members where code=p_code)<2 then raise exception 'NEED_PLAYERS'; end if;
      update netto_live.rooms set phase='playing',round_no=1,
        puzzle=(select puzzle from netto_live.puzzles order by random() limit 1),
        starts_at=t+interval '3 seconds',deadline=t+make_interval(secs=>r.seconds+3),
        expires_at=t+make_interval(secs=>(r.seconds+16)*r.rounds+3600)
        where code=p_code;
    end if;
  elsif p_action='submit' then
    -- Vertraagde pakketten mogen nooit per ongeluk in de volgende ronde landen.
    if r.phase<>'playing' or (p_options->>'round')::integer is distinct from r.round_no or t>=r.deadline or t<r.starts_at
      then raise exception 'ROUND_CLOSED'; end if;
    if exists(select 1 from netto_live.members where code=p_code and user_id=uid and disqualified_round=r.round_no)
      then raise exception 'DISCONNECTED_ROUND'; end if;
    if not exists(select 1 from netto_live.submissions where code=p_code and round_no=r.round_no and user_id=uid) then
      if jsonb_typeof(p_options->'answers') is distinct from 'array' then raise exception 'INVALID_ANSWERS'; end if;
      if jsonb_array_length(p_options->'answers')<>3 then raise exception 'INVALID_ANSWERS'; end if;
      select array_agg(value::numeric order by ord) into a from jsonb_array_elements_text(p_options->'answers') with ordinality e(value,ord);
      for idx in 1..3 loop
        if a[idx] is null or a[idx]<1 or a[idx]>9007199254740991 or a[idx]<>trunc(a[idx]) then raise exception 'INVALID_ANSWERS'; end if;
      end loop;
      op:=r.puzzle->>'operator';
      if r.require_equation and not(case op when '+' then a[1]+a[2]=a[3] when '−' then a[1]-a[2]=a[3]
        when '×' then a[1]*a[2]=a[3] when '÷' then a[1]=a[2]*a[3] else false end)
        then raise exception 'EQUATION_REQUIRED'; end if;
      actual:=array[(r.puzzle->>'q1_answer')::numeric,(r.puzzle->>'q2_answer')::numeric,(r.puzzle->>'q3_answer')::numeric];
      f:=0;
      for idx in 1..3 loop f:=f+greatest(a[idx]/actual[idx],actual[idx]/a[idx]); end loop;
      insert into netto_live.submissions(code,round_no,user_id,answers,factor,submitted_at) values(p_code,r.round_no,uid,a,f/3,t);
    end if;
  elsif p_action not in ('create','join','state') then raise exception 'INVALID_ACTION'; end if;
  perform netto_live.advance(p_code,t);
  select * into r from netto_live.rooms where code=p_code;
  -- Alleen de eigen inzending is tijdens de ronde leesbaar. Antwoorden, factor en tijd
  -- van tegenstanders verlaten de database pas tijdens de onthulling.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.user_id,'name',m.name,'points',m.points,'connected',m.seen_at>=t-interval '12 seconds',
    'submitted',s.user_id is not null and m.disqualified_round<>r.round_no,
    'disqualified',m.disqualified_round=r.round_no and r.round_no>0,
    'answers',case when (r.phase='finished' or (r.phase='reveal' and r.show_answers)) then to_jsonb(s.answers) else null end,
    'factor',case when (r.phase='finished' or (r.phase='reveal' and r.show_answers)) and m.disqualified_round<>r.round_no then to_jsonb(s.factor) else null end
  ) order by m.points desc,m.joined_at),'[]'::jsonb) into players
    from netto_live.members m left join netto_live.submissions s
      on s.code=m.code and s.user_id=m.user_id and s.round_no=r.round_no where m.code=p_code;
  select to_jsonb(s.answers) into mine from netto_live.submissions s where s.code=p_code and s.round_no=r.round_no and s.user_id=uid;
  shown_puzzle:=r.puzzle;
  if r.phase<>'finished' and not (r.phase='reveal' and r.show_answers) then
    shown_puzzle:=shown_puzzle-'q1_answer'-'q2_answer'-'q3_answer'-'calculation';
    -- De vragen reizen alvast mee tijdens de gezamenlijke aftelling; invoer blijft vergrendeld.
  end if;
  return jsonb_build_object('code',r.code,'host',r.host,'visibility',r.visibility,'seconds',r.seconds,'rounds',r.rounds,
    'maxPlayers',r.max_players,'requireEquation',r.require_equation,'showAnswers',r.show_answers,
    'phase',r.phase,'round',r.round_no,'puzzle',shown_puzzle,'startsAt',r.starts_at,'deadline',r.deadline,
    'winner',r.winner,'players',players,'mine',mine,'serverTime',t,'createdAt',r.created_at);
end $$;
revoke all on function public.live_rounds(text,text,jsonb) from public,anon;
grant execute on function public.live_rounds(text,text,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
