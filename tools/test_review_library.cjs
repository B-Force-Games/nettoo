// Controleert de gepubliceerde selectie en metadata zonder echte scores te schrijven.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const context = {window: {}};
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
vm.runInNewContext(read('data/netto_frontend_puzzles.js'), context);
vm.runInNewContext(read('js/question-context.js'), context);
const data = context.window.NETTO_REBUILT_PUZZLES;
const selection = JSON.parse(read('puzzels/library_selectie_20260927.json'));
const daily = JSON.parse(read('puzzels/daily_selectie_20260927.json'));
const used = new Set(), texts = new Set();
assert.equal(data.library.length, 49);
assert.equal(data.reserve.length, 0);
assert.ok(data.connection.length > 0);
assert.equal(data.library_edition, selection.edition);
for (const level of ['easy', 'intermediate', 'hard', 'extremely-hard']) {
  assert.equal(data.library.filter(p => p.difficulty === level).length, {easy:10, intermediate:10, hard:17, 'extremely-hard':12}[level]);
}
for (const [index, p] of data.library.entries()) {
  const selected = selection.puzzles[index];
  assert.equal(p.number, index + 1);
  assert.equal(p.id, selected.id);
  assert.equal(new Set(p.categories).size, 3);
  assert.equal(new Set(selected.questions.map(q => q.unit)).size, 3);
  const numbers = [p.q1_answer, p.q2_answer, p.q3_answer];
  assert.ok(numbers.every(n => Number.isSafeInteger(n) && n > 0));
  const [a,b,c] = numbers.map(BigInt);
  assert.ok(({'+':a+b===c, '−':a-b===c, '×':a*b===c, '÷':a===b*c})[p.operator]);
  for (let i = 1; i <= 3; i++) {
    const q = selected.questions[i-1], meta = data.library_review[q.question];
    assert.ok(q.status.startsWith('APPROVED'));
    assert.ok(!used.has(q.id) && !texts.has(q.question));
    assert.ok(!daily.reserved[q.id]);
    used.add(q.id); texts.add(q.question);
    assert.equal(p['q'+i+'_label'], q.question);
    assert.equal(p['q'+i+'_answer'], q.answer);
    assert.equal(meta.unit, q.unit);
    assert.equal(meta.subtitle, q.subtitle || '');
    assert.equal(meta.bron, q.source);
    assert.equal(meta.uitleg, q.evidence);
    const subtitle = context.window.NettoVraagContext(q.question);
    assert.equal(subtitle?.en || '', q.subtitle || '');
    assert.ok(!/\b(Hoeveel|In welk|Wat is)\b/.test(q.question));
  }
  if (p.photo) {
    assert.ok([1,2,3].includes(p.photo.vraag));
    assert.ok(p.photo.maker && p.photo.licentie && p.photo.url && p.photo.pagina);
    assert.equal(new URL(p.photo.pagina).hostname, 'commons.wikimedia.org');
  }
}
assert.equal(used.size, 147);
assert.equal(Object.keys(data.library_review).length, 147);
assert.ok(!Object.keys(selection.reserved).some(id => daily.reserved[id]));
// Bestaande eenheids- en bronfuncties gebruiken ook de nieuwe reviewmetadata.
const core = read('js/core.js');
const start = core.indexOf('  function eenheidUit(vraag) {');
const end = core.indexOf('  function nederlandseEenheid(vraag)', start);
vm.runInNewContext(core.slice(start, end) + '; result = Object.keys(REBUILT_DATA.library_review).map(eenheidUit);',
  Object.assign(context, {REBUILT_DATA: data}));
assert.equal(context.result.length, 147);
assert.ok(context.result.every(Boolean));
vm.runInNewContext(read('data/netto_fotos.js'), context);
vm.runInNewContext(read('js/photo-credits.js'), Object.assign(context, {URL}));
vm.runInNewContext('photos = REBUILT_DATA.library.map(geldigePuzzelfoto);', context);
assert.equal(context.photos.filter(Boolean).length, data.library.filter(p => p.photo).length);
for (const file of ['js/core.js','js/i18n.js','js/photo-credits.js','js/question-context.js','js/find-connection.js','js/stats-page.js']) {
  new vm.Script(read(file), {filename: file});
}
console.log('PASS: 49 puzzels, 147 unieke approved vragen, exacte sommen, bronnen, onderteksten en eenheden; geen Daily-overlap.');
