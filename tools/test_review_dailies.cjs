// Controleert de nieuwe reeks zonder netwerk of echte spelersdata te wijzigen.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const context = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'data/netto_frontend_puzzles.js'),'utf8'),context);
const data=context.window.NETTO_REBUILT_PUZZLES;
const selection=JSON.parse(fs.readFileSync(path.join(root,'puzzels/daily_selectie_20260927.json'),'utf8'));
assert.equal(data.daily.length,20);
const used=new Set();
for(const p of data.daily){
  const selected=selection.puzzles.find(s=>s.id===p.id);
  assert.ok(selected);
  assert.equal(new Set(p.categories).size,3);
  const [a,b,c]=[p.q1_answer,p.q2_answer,p.q3_answer];
  assert.ok([a,b,c].every(n=>Number.isSafeInteger(n)&&n>0));
  assert.equal(({'+':a+b,'−':a-b,'×':a*b,'÷':a/b})[p.operator],c);
  const units=[];
  for(let i=1;i<=3;i++){
    const q=selected.questions[i-1];
    assert.ok(!used.has(q.id)); used.add(q.id);
    assert.equal(p['q'+i+'_label'],q.question);
    assert.equal(p['q'+i+'_answer'],q.answer);
    assert.equal(data.daily_review[q.question].subtitle,q.subtitle||'');
    units.push(data.daily_review[q.question].unit);
  }
  assert.equal(new Set(units).size,3);
  if(p.photo) assert.ok(p.photo.url&&p.photo.pagina&&p.photo.maker&&p.photo.licentie);
}
assert.equal(used.size,60);
assert.equal(data.daily[0].date,'2026-09-21');
assert.equal(data.daily[19].date,'2026-10-10');
console.log('PASS: 20 exacte vergelijkingen; 60 unieke goedgekeurde vragen; categorieën, eenheden, teksten en fotoverantwoording.');

// Optionele echte PostgreSQL-test via een bestaande PGlite-installatie.
async function sqlTest(){
  if(!process.argv[2]) return;
  const {PGlite}=require(process.argv[2]);
  const db=new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create table puzzles(id uuid primary key, scheduled_date date unique, operator text,
      question_1 text,question_2 text,question_3 text,true_answer_1 bigint,true_answer_2 bigint,true_answer_3 bigint,status text);
    create table user_plays(id int primary key); create table archive_plays(id int primary key);
    create table library_plays(id int primary key);
    insert into user_plays values(1); insert into archive_plays values(1); insert into library_plays values(1);
    insert into puzzles values('00000000-0000-0000-0000-000000000001','2026-09-27','+','oud','oud','oud',1,1,2,'scheduled');`);
  const sql=fs.readFileSync(path.join(root,'supabase/vervang_dailies_20260927.sql'),'utf8');
  await db.exec(sql);
  const count=async table=>Number((await db.query(`select count(*) as n from ${table}`)).rows[0].n);
  assert.equal(await count('user_plays'),0); assert.equal(await count('archive_plays'),0);
  assert.equal(await count('library_plays'),1);
  assert.equal(await count('puzzles where scheduled_date is not null'),25);
  assert.equal(await count('puzzles where scheduled_date is null'),1);
  await db.exec('insert into user_plays values(2); insert into archive_plays values(2);');
  await db.exec(sql);
  assert.equal(await count('user_plays'),1); assert.equal(await count('archive_plays'),1);
  assert.equal(await count('daily_replacement_history'),1);
  // Een conflict mag geen halve reeks of gewiste scores achterlaten.
  await db.exec("update puzzles set question_1='conflict' where scheduled_date='2026-09-21';");
  await assert.rejects(db.exec(sql));
  await db.exec('rollback;');
  assert.equal(await count('user_plays'),1);
  await db.close();
  console.log('PASS: SQL reset alleen Daily-scores, bewaart andere modi, is herhaalbaar en rolt conflicten terug.');
}
sqlTest().catch(error=>{console.error(error);process.exitCode=1;});
