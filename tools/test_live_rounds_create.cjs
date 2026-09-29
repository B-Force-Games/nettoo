// Oude servers blijven speelbaar; niet-ondersteunde regels worden nooit stil genegeerd.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../js/live-rounds.js'),'utf8');
async function test(supported,requireEquation,showAnswers) {
  const nodes={liveSeconds:{value:'60'},liveRounds:{value:'5'},liveMaxPlayers:{value:'8'},liveVisibility:{value:'open'},
    liveRequireEquation:{checked:requireEquation},liveShowRoundAnswers:{checked:showAnswers},liveMessage:{}};
  const calls=[];
  const button={disabled:false};
  const context=vm.createContext({window:{},document:{addEventListener(){},getElementById:id=>nodes[id]},
    statsCopy:(nl,en)=>en,escapeHtml:String,
    supabaseClient:{rpc:async()=>({data:supported?{lobbyOptions:true}:{available:true},error:null})},
    capture:options=>calls.push(options)});
  vm.runInContext(source.replace('  window.NettoLive=',`
    requireLogin=()=>true;
    request=async(action,options)=>capture(options);
    window.testCreate=create;
    window.NettoLive=`),context);
  const event={preventDefault(){},currentTarget:{reportValidity:()=>true,querySelector:()=>button}};
  await context.window.testCreate(event);
  assert.equal(button.disabled,false);
  if(supported) {
    assert.equal(calls.length,1);
    assert.equal(calls[0].requireEquation,requireEquation);
    assert.equal(calls[0].showAnswers,showAnswers);
  } else if(requireEquation&&!showAnswers) {
    assert.equal(calls.length,1);
    assert.ok(!('requireEquation' in calls[0])&&!('showAnswers' in calls[0]));
  } else {
    assert.equal(calls.length,0,'Geen room met stilzwijgend andere regels');
    assert.match(nodes.liveMessage.textContent,/standard rules/);
    assert.equal(nodes.liveRequireEquation.checked,true);
    assert.equal(nodes.liveShowRoundAnswers.checked,false);
    await context.window.testCreate(event);
    assert.equal(calls.length,1,'Standaardroom werkt na expliciete herbevestiging');
  }
}
(async()=>{
  for(const supported of [false,true]) for(const equation of [false,true]) for(const reveal of [false,true])
    await test(supported,equation,reveal);
  console.log('PASS: 8 combinaties van serverversie en spelregels');
})().catch(error=>{console.error(error);process.exitCode=1;});
