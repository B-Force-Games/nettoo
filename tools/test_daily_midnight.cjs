// Controleer de echte datumfuncties zonder spelersdata of Supabase te gebruiken.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function extract(file, name) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const start = source.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
}
const source = extract('js/core.js', 'nettoDagSleutel')
  + extract('js/core.js', 'londonMidnightTarget')
  + extract('js/stats-page.js', 'dailyDate');
const dates = [
  ['2026-09-27T22:59:59.999Z', '2026-09-27', '2026-09-27T23:00:00.000Z'],
  ['2026-09-27T23:00:00.000Z', '2026-09-28', '2026-09-28T23:00:00.000Z'],
  ['2026-12-31T23:59:59.999Z', '2026-12-31', '2027-01-01T00:00:00.000Z'],
  ['2027-01-01T00:00:00.000Z', '2027-01-01', '2027-01-02T00:00:00.000Z'],
  ['2026-03-29T00:00:00.000Z', '2026-03-29', '2026-03-29T23:00:00.000Z'],
  ['2026-10-24T23:00:00.000Z', '2026-10-25', '2026-10-26T00:00:00.000Z'],
];
for (const zone of ['UTC', 'Europe/Amsterdam', 'America/Los_Angeles', 'Asia/Tokyo']) {
  process.env.TZ = zone;
  const context = vm.createContext({ Intl, Date });
  vm.runInContext(source, context);
  for (const [instant, day, next] of dates) {
    context.instant = new Date(instant);
    assert.equal(vm.runInContext('nettoDagSleutel(instant)', context), day);
    assert.equal(vm.runInContext('dailyDate(instant)', context), day);
    assert.equal(vm.runInContext('londonMidnightTarget(instant).toISOString()', context), next);
  }
}

// Een geopende tab wisselt op de grens; terugkeer uit slaapstand herstelt de datum.
let now = Date.parse('2026-09-27T22:59:59.500Z');
let scheduled, delay, focus, changes = 0;
class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const context = vm.createContext({ Intl, Date: ClockDate, Math,
  setTimeout(fn, ms) { scheduled=fn; delay=ms; return 1; }, clearTimeout() {}, setInterval() {},
  document: { hidden:false, addEventListener() {} },
  renderHomeDailyPreview() {}, supabaseClient:null,
  window: { addEventListener(event, fn) { if (event==='focus') focus=fn; }, NettoRoutes: { dayChanged() { changes++; }, dailyReady() {} } }
});
vm.runInContext(source + '\nlet TODAY_STR = nettoDagSleutel(), dailySyncGedaan=true, dailySyncAfgerond=true;'
  + extract('js/core.js', 'bewaakDagwissel') + '\nbewaakDagwissel();', context);
assert.equal(delay, 500);
now += 500;
scheduled();
assert.equal(vm.runInContext('TODAY_STR', context), '2026-09-28');
assert.equal(changes, 1);
now = Date.parse('2026-09-30T07:00:00Z');
focus();
assert.equal(vm.runInContext('TODAY_STR', context), '2026-09-30');
assert.equal(changes, 2);
console.log('Daily-middernachttests geslaagd: tijdzones, zomer-/wintertijd, jaarwisseling en open tab.');
