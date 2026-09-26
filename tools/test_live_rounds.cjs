// Losse PostgreSQL-tests. PGlite is uitsluitend een externe testruntime, nooit een website-afhankelijkheid.
// node tools/test_live_rounds.cjs <pad-naar-@electric-sql/pglite>
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const root = path.resolve(__dirname,'..');
const user = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const puzzle = {id:'test',operator:'+',q1_label:'A?',q1_answer:10,q2_label:'B?',q2_answer:20,q3_label:'C?',q3_answer:30,categories:['A','B','C']};
let db, passed=0;
async function rpc(n,action,code=null,options={}) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[n?user(n):'',JSON.stringify({user_metadata:{username:'Player '+n}})]);
  await db.exec('set role authenticated');
  try { return (await db.query('select public.live_rounds($1,$2,$3::jsonb) as state',[action,code,JSON.stringify(options)])).rows[0].state; }
  finally { await db.exec('reset role'); }
}
async function fails(fn,code) { await assert.rejects(fn,error=>String(error.message).includes(code)); }
async function test(name,fn) { await fn(); passed++; console.log('PASS '+name); }
async function start(rounds=2,players=2) {
  const room=await rpc(1,'create',null,{seconds:60,rounds,visibility:'closed'});
  for(let n=2;n<=players;n++) await rpc(n,'join',room.code);
  await rpc(1,'start',room.code);
  await db.query("update netto_live.rooms set starts_at=clock_timestamp()-interval '1 second',puzzle=$2::jsonb where code=$1",[room.code,JSON.stringify(puzzle)]);
  return room.code;
}
async function finish(code) { await db.query("update netto_live.rooms set deadline=clock_timestamp()-interval '1 second' where code=$1",[code]); return rpc(1,'state',code); }
async function main() {
  db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select current_setting('request.jwt.claims',true)::jsonb$$;
    grant usage on schema auth to authenticated;`);
  const migration=fs.readFileSync(path.join(root,'supabase/live_rounds.sql'),'utf8');
  await test('Migration can run twice',async()=>{await db.exec(migration);await db.exec(migration);});
  await test('Canonical race puzzles imported unchanged',async()=>{
    await db.exec(fs.readFileSync(path.join(root,'supabase/live_rounds_puzzles.sql'),'utf8'));
    assert.equal((await db.query('select count(*)::int as count from netto_live.puzzles')).rows[0].count,274);
  });
  await test('Authentication and setting bounds enforced',async()=>{
    await fails(()=>rpc(null,'create',null,{seconds:60,rounds:5}),'LOGIN_REQUIRED');
    await fails(()=>rpc(1,'create',null,{seconds:4,rounds:5}),'INVALID_SETTINGS');
    await fails(()=>rpc(1,'create',null,{seconds:60,rounds:0}),'INVALID_SETTINGS');
  });
  await test('Lobby needs 2 players; rejects ninth; host alone starts; running room refuses late join',async()=>{
    const room=await rpc(1,'create',null,{seconds:17,rounds:3,visibility:'open'});
    await fails(()=>rpc(1,'start',room.code),'NEED_PLAYERS');
    for(let n=2;n<=8;n++) await rpc(n,'join',room.code);
    await fails(()=>rpc(9,'join',room.code),'ROOM_FULL');
    await fails(()=>rpc(2,'start',room.code),'HOST_ONLY');
    const active=await rpc(1,'start',room.code);
    assert.equal(active.players.length,8);assert.equal(active.seconds,17);
    await fails(()=>rpc(9,'join',room.code),'MATCH_STARTED');
    await fails(()=>rpc(2,'submit',room.code,{round:1,answers:[10,20,30]}),'ROUND_CLOSED');
    await db.query('delete from netto_live.rooms where code=$1',[room.code]);
  });
  await test('Shared puzzle/deadline, privacy, immutable submission and earliest exact tie',async()=>{
    const code=await start(1);
    const host=await rpc(1,'state',code),guest=await rpc(2,'state',code);
    assert.deepEqual(host.puzzle,guest.puzzle);assert.equal(host.deadline,guest.deadline);
    assert.equal('q1_answer' in host.puzzle,false);assert.equal('calculation' in host.puzzle,false);
    const submitted=await rpc(1,'submit',code,{round:1,answers:[10,20,30]});
    assert.deepEqual(submitted.mine,[10,20,30]);
    const hidden=await rpc(2,'state',code);
    assert.equal(hidden.players.find(p=>p.id===user(1)).submitted,true);
    for(const p of hidden.players){assert.equal(p.answers,null);assert.equal(p.factor,null);}
    await rpc(1,'submit',code,{round:1,answers:[1,2,3]});
    const reveal=await rpc(2,'submit',code,{round:1,answers:[10,20,30]});
    assert.equal(reveal.phase,'reveal');assert.equal(reveal.winner,user(1));
    assert.deepEqual(reveal.players[0].answers,[10,20,30]);assert.equal(reveal.players[0].factor,1);
    assert.equal(reveal.players[0].points,1);assert.equal(reveal.puzzle.q1_answer,10);
    await rpc(1,'state',code);await rpc(2,'state',code);
    assert.equal((await rpc(1,'state',code)).players[0].points,1);
    const final=await finish(code);assert.equal(final.phase,'finished');
  });
  await test('Equation, integer input and round identity validated on server',async()=>{
    const code=await start();
    await fails(()=>rpc(2,'submit',code,{round:1,answers:[1,2,4]}),'EQUATION_REQUIRED');
    for(const answers of [[0,20,20],[1.5,2,3.5],[10,20],[10,null,30],[9007199254740992,1,9007199254740993]])
      await fails(()=>rpc(2,'submit',code,{round:1,answers}),'INVALID_ANSWERS');
    await fails(()=>rpc(2,'submit',code,{round:2,answers:[10,20,30]}),'ROUND_CLOSED');
    await fails(()=>rpc(3,'state',code),'NOT_A_MEMBER');
    await db.query('delete from netto_live.rooms where code=$1',[code]);
  });
  await test('Factor penalises both over- and underestimates, winner need not be exact',async()=>{
    const code=await start();
    await rpc(1,'submit',code,{round:1,answers:[20,40,60]});
    const reveal=await rpc(2,'submit',code,{round:1,answers:[5,10,15]});
    assert.equal(reveal.players[0].factor,2);assert.equal(reveal.players[1].factor,2);assert.equal(reveal.winner,user(1));
    await db.query('delete from netto_live.rooms where code=$1',[code]);
  });
  await test('Expired deadline rejects late submission; empty round gives nobody points',async()=>{
    const code=await start();
    await db.query("update netto_live.rooms set deadline=clock_timestamp()-interval '1 second' where code=$1",[code]);
    await fails(()=>rpc(2,'submit',code,{round:1,answers:[10,20,30]}),'ROUND_CLOSED');
    const result=await rpc(1,'state',code);
    assert.equal(result.phase,'reveal');assert.equal(result.winner,null);
    assert.ok(result.players.every(p=>p.points===0));
    const next=await finish(code);assert.equal(next.round,2);assert.equal(next.phase,'playing');
    await db.query('delete from netto_live.rooms where code=$1',[code]);
  });
  await test('Disconnect invalidates submission and reconnect cannot submit in same round',async()=>{
    const code=await start();
    await rpc(1,'submit',code,{round:1,answers:[10,20,30]});
    await db.query("update netto_live.members set seen_at=clock_timestamp()-interval '13 seconds' where code=$1 and user_id=$2",[code,user(1)]);
    const state=await rpc(2,'state',code);
    assert.equal(state.players.find(p=>p.id===user(1)).submitted,false);
    await fails(()=>rpc(1,'submit',code,{round:1,answers:[10,20,30]}),'DISCONNECTED_ROUND');
    const reveal=await rpc(2,'submit',code,{round:1,answers:[20,40,60]});
    assert.equal(reveal.winner,user(2));
    await db.query('delete from netto_live.rooms where code=$1',[code]);
  });
  await test('Host departure does not stop rounds; lobby host can transfer',async()=>{
    const code=await start();
    await rpc(1,'leave',code);
    await db.query("update netto_live.rooms set deadline=clock_timestamp()-interval '1 second' where code=$1",[code]);
    assert.equal((await rpc(2,'state',code)).phase,'reveal');
    await db.query("update netto_live.rooms set deadline=clock_timestamp()-interval '1 second' where code=$1",[code]);
    assert.equal((await rpc(2,'state',code)).round,2);
    const room=await rpc(3,'create',null,{seconds:60,rounds:1});
    await rpc(4,'join',room.code);await rpc(3,'leave',room.code);
    assert.equal((await rpc(4,'state',room.code)).host,user(4));
    await db.query('delete from netto_live.rooms where code=$1',[code]);
  });
  await test('Raw tables and internal advance are inaccessible to players',async()=>{
    await db.exec('set role authenticated');
    try {
      await assert.rejects(()=>db.query('select * from netto_live.submissions'),/permission denied/);
      await assert.rejects(()=>db.query("select netto_live.advance('ABC234',clock_timestamp())"),/permission denied/);
    } finally { await db.exec('reset role'); }
  });
  console.log(`\n${passed} Live Rondes-databasetests geslaagd.`);
  await db.close();
}
main().catch(error=>{console.error(error);process.exitCode=1;db?.close();});
