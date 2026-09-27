// Nieuwe FTC-inhoud moet dezelfde spelregels volgen, zonder eerdere vragen of scores.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const context = {window:{}, URL};
vm.createContext(context);
vm.runInContext(read('data/netto_frontend_puzzles.js'), context);
context.REBUILT_DATA = context.window.NETTO_REBUILT_PUZZLES;
const data = context.REBUILT_DATA;
vm.runInContext(read('js/find-connection.js'), context);
vm.runInContext(read('js/question-context.js'), context);
vm.runInContext(read('js/photo-credits.js'), context);
const selection = JSON.parse(read('puzzels/connection_selectie_20260927.json'));
const used = new Set(), labels = new Set(), prior = new Set();
for (const mode of ['daily', 'library']) {
  const manifest = JSON.parse(read(`puzzels/${mode}_selectie_20260927.json`));
  Object.keys(manifest.reserved).forEach(id => prior.add(id));
}
assert.equal(data.connection.length, 20);
assert.equal(Object.keys(data.connection_review).length, 60);
assert.ok(!Object.keys(selection.reserved).some(id => prior.has(id)));
assert.ok(data.connection.every(context.cleanConnection));
for (const [index, p] of data.connection.entries()) {
  assert.equal(p.number, index+1);
  assert.equal(p.id, selection.puzzles[index].id);
  assert.equal(new Set(p.categories).size, 3);
  assert.ok(!('photo' in p));
  assert.equal(context.geldigePuzzelfoto(p), null);
  const units = [];
  for (let i=1; i<=3; i++) {
    const q = selection.puzzles[index].questions[i-1];
    const meta = data.connection_review[q.question];
    assert.ok(q.status.startsWith('APPROVED'));
    assert.ok(!used.has(q.id) && !prior.has(q.id) && !labels.has(q.question));
    used.add(q.id); labels.add(q.question); units.push(q.unit);
    assert.equal(p['q'+i+'_label'], q.question);
    assert.equal(p['q'+i+'_answer'], q.answer);
    assert.equal(meta.unit, q.unit);
    assert.equal(meta.bron, q.source);
    assert.equal(meta.uitleg, q.evidence);
    assert.equal(context.window.NettoVraagContext(q.question)?.en || '', q.subtitle || '');
    assert.ok(!/\b(Hoeveel|In welk|Wat is)\b/.test(q.question));
  }
  assert.equal(new Set(units).size, 3);
  const answers = context.connectionAnswers(p);
  assert.ok(context.connectionEquation(answers, p.operator));
  const solutions = context.validConnections(answers);
  assert.equal(new Set(solutions.map(s => ['+', '−'].includes(s.operator) ? 'sum' : 'product')).size, 1);
  for (const solution of solutions) {
    assert.ok(context.connectionEquation(solution.order.map(i => answers[i]), solution.operator));
  }
}
assert.equal(used.size, 60);
context.readStatsStorage = key => key === 'netto_connection_progress' ? {results:[{id:'oud',factor:1}]} : {};
assert.equal(vm.runInContext('connectionProgress().results.length', context), 0);
assert.equal(vm.runInContext('CONNECTION_PROGRESS_KEY', context), 'netto_connection_progress_' + data.connection_edition);
for (const file of ['js/core.js', 'js/i18n.js', 'js/stats-page.js']) new vm.Script(read(file));
console.log('PASS: 20 FTC-puzzels; 60 unieke approved vragen; geen overlap of foto’s; geldige oplossingen en aparte voortgang.');
