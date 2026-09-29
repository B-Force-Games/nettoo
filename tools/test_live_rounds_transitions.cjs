// Controleer schermovergangen met een vaste klok, zonder netwerk of echte accounts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const nodes = new Map();
const inputs = [0, 1, 2].map(() => ({disabled: false, value: ''}));
function element(id) {
  if (!nodes.has(id)) nodes.set(id, {
    hidden: false, disabled: false, textContent: '', innerHTML: '', children: [],
    classList: {toggle() {}}, querySelectorAll: () => inputs,
    focus() {}, setAttribute() {}, dataset: {}
  });
  return nodes.get(id);
}
let time = 100000, puzzleRenders = 0;
const context = vm.createContext({
  document: {getElementById: element, addEventListener() {}},
  window: {}, currentUser: {id: 'me'}, statsCopy: (nl, en) => en,
  escapeHtml: String, nettoNumberLocale: () => 'en-GB',
  Date: class extends Date { static now() { return time; } },
  clearInterval() {}, sessionStorage: {getItem() { return ''; }}
});
const source = fs.readFileSync(path.join(__dirname, '../js/live-rounds.js'), 'utf8');
vm.runInContext(source.replace('  window.NettoLive=', `
  renderPlayers=()=>{};
  renderPuzzle=()=>{ puzzleRendered(); document.getElementById('liveQuestionList').children=[{}]; };
  renderRoundReview=()=>{};
  renderOutcome=()=>{ document.getElementById('liveRoundOutcome').hidden=false; };
  window.testLive={
    set(value){state=value;lastSuccess=Date.now();render();},
    tick,
  };
  window.NettoLive=`), Object.assign(context, {puzzleRendered: () => { puzzleRenders++; }}));
const api = context.window.testLive;
const base = {code:'TEST23',host:'me',visibility:'closed',seconds:60,rounds:3,
  round:1,phase:'lobby',players:[{id:'me',points:0}],puzzle:null,
  startsAt:new Date(time+1000).toISOString(),deadline:new Date(time+61000).toISOString()};
api.set(base);
assert.equal(element('liveRoom').hidden,false);
api.set({...base,phase:'playing',puzzle:{}});
assert.equal(element('liveRoom').hidden,false, 'Lobby blijft tijdens startvoorbereiding staan');
assert.equal(puzzleRenders,0);
time+=1000; api.tick();
assert.equal(element('livePlay').hidden,false);
assert.equal(element('liveRoom').hidden,true);
assert.equal(puzzleRenders,1);
assert.ok(inputs.every(input=>!input.disabled), 'Invoer wordt op starttijd vrijgegeven');
for (const showAnswers of [false,true]) {
  api.set({...base,phase:'reveal',puzzle:{},showAnswers});
  const visible = showAnswers?'liveReveal':'livePlay';
  assert.equal(element(visible).hidden,false);
  const next = {...base,phase:'playing',round:2,puzzle:{},showAnswers,
    startsAt:new Date(time+1000).toISOString(),deadline:new Date(time+61000).toISOString()};
  const before=puzzleRenders;
  api.set(next);
  assert.equal(element(visible).hidden,false,'Vorige ronde blijft zichtbaar');
  assert.equal(puzzleRenders,before,'Geen nieuwe vragen vóór de gezamenlijke start');
  assert.ok(inputs.every(input=>input.disabled));
  time+=1000; api.tick();
  assert.equal(element('liveReveal').hidden,true);
  assert.equal(element('liveRoundOutcome').hidden,true);
  assert.equal(puzzleRenders,before+1);
  assert.ok(inputs.every(input=>!input.disabled));
  inputs[0].value='123';
  api.set(next);
  assert.equal(puzzleRenders,before+1,'Heartbeat bouwt invoervelden niet opnieuw');
  assert.equal(inputs[0].value,'123');
}
console.log('PASS: lobby, beide rondeovergangen, invoer vrijgeven en antwoorden behouden');
