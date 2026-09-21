// Dezelfde drie antwoorden mogen alle wiskundig equivalente verbanden opleveren.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../js/find-connection.js'), 'utf8'), context);
const valid = values => JSON.parse(JSON.stringify(context.validConnections(values)));
const equation = context.connectionEquation;
assert.equal(equation([75, 5, 15], '÷'), true);
assert.equal(equation([15, 5, 75], '×'), true);
assert.equal(equation([5, 15, 75], '×'), true);
assert.equal(equation([75, 15, 5], '÷'), true);
assert.equal(valid([75, 5, 15]).length, 4);
assert.equal(valid([3, 7, 10]).length, 4);
assert.equal(equation([5, 75, 15], '÷'), false);
assert.equal(equation([7, 3, 10], '−'), false);
assert.equal(equation([1, 3, 0.3333333333333333], '÷'), false);
assert.equal(equation([1, 0, 1], '÷'), false);
assert.equal(equation([9007199254740991, 9007199254740990, 1], '−'), true);
assert.equal(equation([9007199254740991, 2, 9007199254740991], '×'), false);
assert.equal(equation([3, 7, 10], '?'), false);
const puzzle = answers => Object.fromEntries(answers.flatMap((a, i) => [['q'+(i+1)+'_answer',a],['q'+(i+1)+'_label','Vraag '+i]]));
assert.equal(context.cleanConnection(puzzle([75, 5, 15])), true);
assert.equal(context.cleanConnection(puzzle([2, 2, 4])), false);
assert.equal(context.cleanConnection(puzzle([1, 2, 4])), false);
for (let n = 0; n < 100; n++) {
  const order = Array.from(context.shuffledConnectionOrder());
  assert.deepEqual([...order].sort(), [0,1,2]);
  assert.notDeepEqual(order, [0,1,2]);
}
const data = {window:{}};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../data/netto_frontend_puzzles.js'),'utf8'), data);
const pool = data.window.NETTO_REBUILT_PUZZLES.library;
const before = JSON.stringify(pool);
const eligible = pool.filter(context.cleanConnection);
assert.ok(eligible.length > 0);
for (const p of eligible) assert.ok(valid(context.connectionAnswers(p)).length >= 4);
assert.equal(JSON.stringify(pool), before);
console.log('Connection checks passed; '+eligible.length+' existing puzzles eligible.');
