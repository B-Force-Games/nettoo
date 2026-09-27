// Inhoud, exclusiviteit en herstelbaarheid testen zonder echte spelersdata.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root,name),'utf8');
const json = name => JSON.parse(read(name));
const before = json('puzzels/voor_kwaliteitsreview_20260927.json');
const review = json('puzzels/kwaliteitsreview_20260927.json');
const source = new Map(Object.values(before).flatMap(s=>s.puzzles.flatMap(p=>p.questions.map(q=>[q.id,q]))));
const seen = new Set(), reserved = new Set(), texts = new Set();
assert.equal(review.audit.length,167);
assert.equal(new Set(review.audit.map(a=>a.mode+'/'+a.number)).size,167);
assert.ok(review.audit.every(a=>a.reason.length>20));
for (const mode of ['daily','library','connection']) {
  const s=json(`puzzels/${mode}_selectie_20260927.json`);
  assert.equal(s.puzzles.length,review.counts[mode]);
  for(const qid of Object.keys(s.reserved)) {
    assert.ok(!reserved.has(qid),'Dubbele reservering '+qid); reserved.add(qid);
  }
  for(const p of s.puzzles) {
    assert.equal(new Set(p.questions.map(q=>q.category)).size,3);
    assert.equal(new Set(p.questions.map(q=>q.unit)).size,3);
    for(const q of p.questions) {
      assert.equal(q.answer,source.get(q.id).answer,'Antwoord veranderd '+q.id);
      assert.equal(q.status,source.get(q.id).status,'Reviewstatus veranderd '+q.id);
      assert.ok(!seen.has(q.id) && !texts.has(q.question),'Dubbele vraag '+q.id);
      seen.add(q.id); texts.add(q.question);
      assert.ok(!review.held_for_source_check[q.id],'Bronprobleem toch gepubliceerd');
    }
    if(p.photo) {
      assert.equal(p.photo.pagina,p.questions[p.photo.vraag-1].photo.pagina);
      assert.ok(p.photo.maker && p.photo.licentie);
    }
  }
}
assert.equal(seen.size,267);
assert.equal(reserved.size,review.reserved_including_aliases);
assert.equal(read('index.html').match(/netto_frontend_puzzles.js\?v=(\d+)/)[1],
  read('stats.html').match(/netto_frontend_puzzles.js\?v=(\d+)/)[1]);
console.log('PASS: alle 167 oude puzzels verantwoord; 267 ongewijzigde antwoorden; unieke vragen/aliasreserveringen; bronproblemen niet actief.');

async function testSql() {
  if(!process.argv[2]) return;
  const {PGlite}=require(process.argv[2]);
  const db=new PGlite();
  const sql=read('supabase/verfijn_dailies_20260927.sql');
  assert.ok(!/SELECTIE_(?:EDITIE|AANTAL|WAARDEN)/.test(sql));
  await db.exec(`create role anon; create role authenticated;
    create table puzzles(id uuid primary key,scheduled_date date unique,operator text,
      question_1 text,question_2 text,question_3 text,true_answer_1 bigint,true_answer_2 bigint,true_answer_3 bigint,status text,daily_edition text);
    create table user_plays(id int primary key,puzzle_date date);
    create table archive_plays(id int primary key,puzzle_no int);
    create table library_plays(id int primary key);
    insert into puzzles values('00000000-0000-0000-0000-000000000001','2026-09-27','+','oud','oud','oud',1,1,2,'scheduled','reviewed-20260927');
    insert into user_plays values(1,'2026-09-27'),(2,'2025-01-01');
    insert into archive_plays values(1,1),(2,999);
    insert into library_plays values(1);`);
  const count=async t=>Number((await db.query('select count(*) as n from '+t)).rows[0].n);
  await db.exec(sql);
  assert.equal(await count('puzzles where scheduled_date is not null'),20);
  assert.equal(await count('puzzles where scheduled_date is null'),1);
  assert.equal(await count('user_plays'),1);
  assert.equal(await count('archive_plays'),1);
  assert.equal(await count('library_plays'),1);
  const history=(await db.query('select * from daily_quality_history')).rows[0];
  assert.equal(history.puzzles.length,1);
  assert.equal(history.user_plays.length,1);
  assert.equal(history.archive_plays.length,1);
  await db.exec("insert into user_plays values(3,'2026-09-27'); insert into archive_plays values(3,1);");
  await db.exec(sql);
  assert.equal(await count('user_plays'),2); assert.equal(await count('archive_plays'),2);
  assert.equal(await count('daily_quality_history'),1);
  await db.exec("update puzzles set question_1='conflict' where scheduled_date='2026-09-21';");
  await assert.rejects(db.exec(sql)); await db.exec('rollback');
  assert.equal(await count('user_plays'),2);
  await db.exec("update puzzles set daily_edition='onbekend' where scheduled_date='2026-09-21';");
  await assert.rejects(db.exec(sql)); await db.exec('rollback');
  assert.equal(await count('archive_plays'),2);
  await db.close();
  console.log('PASS: PostgreSQL-transactie archiveert betrokken gegevens, laat andere gegevens intact, is herhaalbaar en weigert conflicten.');
}
testSql().catch(err=>{console.error(err);process.exitCode=1;});
