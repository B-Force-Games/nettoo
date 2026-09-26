// Gebruik dezelfde racepuzzels op de server zodat een host geen antwoorden kan veranderen.
// Uitvoer is een SQL-import, geen nieuwe speldata of extra bouwstap voor de website.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'data/netto_race_pool.js'), 'utf8'), context);
const puzzles = context.window.NETTO_RACE_POOL;
const quote = s => "'" + String(s).replaceAll("'", "''") + "'";
const usable = puzzles.filter(p => {
  const a = [p.q1_answer,p.q2_answer,p.q3_answer];
  return a.every(n => Number.isSafeInteger(n) && n > 0) && ['+','−','×','÷'].includes(p.operator)
    && ({'+':a[0]+a[1], '−':a[0]-a[1], '×':a[0]*a[1], '÷':a[0]/a[1]})[p.operator] === a[2];
});
if (usable.length < 2 || new Set(usable.map(p => p.id)).size !== usable.length) throw Error('Ongeldige racepool');
const rows = usable.map(p => `(${quote(p.id)},${quote(JSON.stringify(p))}::jsonb)`).join(',\n');
const sql = `-- Gegenereerd uit de bestaande racepool. Voer eerst live_rounds.sql uit.\n-- ${usable.length} puzzels; lopende rondes bewaren hun eigen momentopname.\nbegin;\ndelete from netto_live.puzzles;\ninsert into netto_live.puzzles(id,puzzle) values\n${rows};\ncommit;\n`;
fs.writeFileSync(path.join(root,'supabase/live_rounds_puzzles.sql'), sql);
console.log(`${usable.length} puzzels klaargezet voor Live Rondes (${puzzles.length-usable.length} ongeldige overgeslagen).`);
