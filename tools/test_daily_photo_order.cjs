// Alleen de weergave mag wisselen; bronvragen en opgeslagen antwoordposities blijven gelijk.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const data = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'data/netto_frontend_puzzles.js'), 'utf8'), data);
const source = fs.readFileSync(path.join(root, 'js/core.js'), 'utf8');
const functions = source.slice(source.indexOf('  function dailyQuestionOrder()'), source.indexOf('  // Alleen een herkenbare gevraagde eenheid'));
const cards = [0, 1, 2].map(index => ({ index, classList: { remove() {}, add() {} }, prepend(photo) { photo.card = this; } }));
const nodes = new Map();
const get = id => {
  if (!nodes.has(id)) nodes.set(id, { getAttribute() { return ''; }, setAttribute(name, value) { this[name] = value; } });
  return nodes.get(id);
};
cards.forEach((card, i) => get('g' + (i + 1)).closest = () => card);
const connector = { before(card) { this.first = card; }, after(card) { this.second = card; } };
get('operatorBadge').closest = () => connector;
const env = { document: { getElementById: get }, DAILY_PHOTO_DIR: '', renderDailyPhotoCredit() {}, statsCopy: (nl, en) => en };
env.gekoppeldeFoto = () => env.PUZZLE_DATA.photo ? { ...env.PUZZLE_DATA.photo, src: env.PUZZLE_DATA.photo.url } : null;
vm.createContext(env);
vm.runInContext(functions, env);
for (const puzzle of data.window.NETTO_REBUILT_PUZZLES.daily) {
  env.PUZZLE_DATA = puzzle;
  const before = JSON.stringify(puzzle);
  for (let pass = 0; pass < 2; pass++) {
    vm.runInContext('renderDailyPhoto()', env);
    const swap = ['+', '×'].includes(puzzle.operator) && puzzle.photo?.vraag === 1;
    assert.equal(connector.first.index, swap ? 1 : 0);
    assert.equal(connector.second.index, swap ? 0 : 1);
    if (puzzle.photo) {
      assert.equal(get('dailyPhotoButton').card.index, puzzle.photo.vraag - 1);
      assert.equal(get('dailyPhotoCaption').textContent, `With question ${swap ? 2 : puzzle.photo.vraag} ↗`);
    } else assert.equal(get('dailyPhotoButton').hidden, true);
    assert.equal(JSON.stringify(puzzle), before);
  }
}
console.log('PASS: alle Dailies, herhaald renderen, wisselen tussen puzzels, fotobijschriften en ongewijzigde brondata.');
