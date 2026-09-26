// Regressiecontrole van de gedeelde lobby zonder netwerk of spelersdata.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const tracked=[],channels=[],untracked=[];
const channel={track:async entry=>{tracked.push(entry);return 'ok';},untrack:async()=>{untracked.push(true);},presenceState:()=>({})};
const context=vm.createContext({console,Math,Date,Map,Set,Promise,localStorage:{getItem:()=>null},
  document:{getElementById:()=>null},currentUser:{user_metadata:{username:'Tester'}},
  supabaseClient:{channel:(name,config)=>{channels.push({name,config});return channel;}},
  liveEntry:null});
context.window=context;context.NettoLive={lobbyEntry:()=>context.liveEntry,renderOpenGames:()=>{}};
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../js/race.js'),'utf8'),context);
const run=code=>vm.runInContext(code,context);
assert.equal(run("raceChannelName('abc234')"),'netto-race:ABC234');
assert.equal(run("raceChannelName('abc234','live')"),'netto-race:live:ABC234');
run("nettoRoomChannel('ABC234');nettoRoomChannel('ABC234','live');");
assert.equal(channels.length,2);assert.equal(channels[0].config.config.broadcast.self,false);
run("raceLobbyReady=true;raceLobbyChannel=nettoRoomChannel('ABC234');raceDuelSession={role:'host',code:'ABC234',visibility:'open',durationKey:'snel',toleranceKey:'netjes',createdAt:123};publishOpenRaceEntry();publishOpenRaceEntry();");
assert.equal(tracked.length,1);assert.equal(tracked[0].kind,'open-race');assert.equal(tracked[0].toleranceKey,'netjes');
context.liveEntry={kind:'open-live',roomCode:'NEW234',status:'waiting',players:2};
run('publishOpenRaceEntry();publishOpenRaceEntry();');
assert.equal(tracked.length,2);assert.equal(tracked[1].kind,'open-live');
run('unpublishOpenRaceEntry();');assert.equal(untracked.length,1);
context.liveEntry=null;
run('publishOpenRaceEntry();');assert.equal(tracked.length,3);assert.equal(tracked[2].kind,'open-race');
channel.presenceState=()=>({race:[{kind:'open-race',status:'waiting',roomCode:'ABC234',client_id:'other',createdAt:Date.now()}],live:[{kind:'open-live',status:'waiting',roomCode:'NEW234',client_id:'other',createdAt:Date.now()}]});
assert.equal(run('openRaceEntries().length'),1);assert.equal(run('openRaceEntries()[0].roomCode'),'ABC234');
console.log('PASS: bestaande racekanalen, instellingen, deduplicatie en gescheiden lobbylijsten.');
