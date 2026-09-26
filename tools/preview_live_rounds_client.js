// Browseradapter voor de losse localhost-testruntime. Geen echte accounts of cloudverkeer.
(() => {
  const player=Number(new URLSearchParams(location.search).get('player')||sessionStorage.getItem('test_player')||1);
  sessionStorage.setItem('test_player',String(player));
  const uid=`00000000-0000-4000-8000-${String(player).padStart(12,'0')}`;
  const user={id:uid,email:`tester${player}@example.test`,user_metadata:{username:`Tester ${player}`}};
  const empty={data:[],error:null};
  const query=new Proxy({}, {get:(_,key)=>key==='then'?(resolve=>Promise.resolve(empty).then(resolve)):(()=>query)});
  function channel(name){
    const bc=new BroadcastChannel('netto-test:'+name),handlers=[],members={},key=crypto.randomUUID();
    let meta=null;
    const emit=(kind,event,payload={})=>handlers.filter(h=>h.kind===kind&&h.event===event).forEach(h=>h.callback(payload));
    bc.onmessage=({data})=>{
      if(data.type==='hello'&&meta)bc.postMessage({type:'presence',key,meta});
      if(data.type==='presence'){members[data.key]=[data.meta];emit('presence','sync');}
      if(data.type==='leave'){delete members[data.key];emit('presence','sync');}
      if(data.type==='broadcast')emit('broadcast',data.event,{payload:data.payload});
    };
    return {
      on(kind,filter,callback){handlers.push({kind,event:filter.event,callback});return this;},
      subscribe(callback){queueMicrotask(()=>{callback('SUBSCRIBED');bc.postMessage({type:'hello'});emit('presence','sync');});return this;},
      async track(value){meta=value;members[key]=[meta];bc.postMessage({type:'presence',key,meta});},
      async untrack(){meta=null;delete members[key];bc.postMessage({type:'leave',key});},
      presenceState(){return members;},
      async send(value){bc.postMessage(value);},
      close(){bc.postMessage({type:'leave',key});bc.close();}
    };
  }
  const client={
    auth:{onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};},async getSession(){return {data:{session:{user}}};}},
    from(){return query;},
    async rpc(name,params){
      if(name!=='live_rounds')return empty;
      return (await fetch('/__test/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({player,params})})).json();
    },channel,async removeChannel(value){value.close();}
  };
  window.supabase={createClient:()=>client};
})();
