// Live Rondes deelt de racelobby en Realtime-kanalen. Alleen de server beslist over tijd en punten.
(function () {
  'use strict';
  const copy = (nl, en) => statsCopy(nl, en);
  const esc = value => escapeHtml(value);
  const el = id => document.getElementById(id);
  let state = null, channel = null, heartbeat = null, clock = null, generation = 0;
  let pending = 0, queue = Promise.resolve(), offset = 0, lastSuccess = 0, rendered = '';
  let sending = false, previousEntry = false;
  const remembered = () => sessionStorage.getItem('netto_live_room') || '';
  const me = () => state?.players.find(player => player.id === currentUser?.id);
  const now = () => Date.now() + offset;
  const format = n => Number(n).toLocaleString(nettoNumberLocale());
  const factor = n => Number(n).toLocaleString(nettoNumberLocale(), {minimumFractionDigits:2,maximumFractionDigits:2}) + '×';

  function requireLogin() {
    if (currentUser && supabaseClient) return true;
    showNoticeToast(copy('Log in om Live Rondes te spelen.', 'Sign in to play Live Rounds.'), '👤', copy('Inloggen vereist','Sign-in required'));
    openAuthModal();
    return false;
  }

  function errorText(error) {
    const message = String(error?.message || error || '');
    const messages = {
      LOGIN_REQUIRED: ['Log opnieuw in om te spelen.','Please sign in again to play.'],
      ROOM_NOT_FOUND: ['Deze room bestaat niet meer.','This room no longer exists.'],
      ROOM_FULL: ['Deze room heeft al acht spelers.','This room already has eight players.'],
      MATCH_STARTED: ['De wedstrijd is al begonnen.','This match has already started.'],
      NOT_A_MEMBER: ['Je zit niet meer in deze room.','You are no longer in this room.'],
      HOST_ONLY: ['Alleen de host kan starten.','Only the host can start the match.'],
      NEED_PLAYERS: ['Wacht op minstens één andere speler.','Wait for at least one other player.'],
      ROUND_CLOSED: ['Deze ronde is nog niet gestart of al afgelopen.','This round has not started or has already ended.'],
      DISCONNECTED_ROUND: ['Verbinding verbroken: je doet vanaf de volgende ronde weer mee.','Connection lost: you can play again next round.'],
      INVALID_ANSWERS: ['Vul drie positieve gehele getallen in.','Enter three positive whole numbers.'],
      EQUATION_REQUIRED: ['In Live Rondes moet de som voor iedereen kloppen.','In Live Rounds, everyone must submit a correct equation.'],
      INVALID_SETTINGS: ['Kies 5–3.600 seconden en 1–1.000 rondes.','Choose 5–3,600 seconds and 1–1,000 rounds.'],
      TOO_MANY_ROOMS: ['Rond eerst je lopende wedstrijden af.','Finish your active matches first.']
    };
    for (const [key, texts] of Object.entries(messages)) if (message.includes(key)) return copy(...texts);
    if (message.includes('PUZZLES_MISSING') || error?.code === 'PGRST202' || message.includes('Could not find the function'))
      return copy('Live Rondes staat klaar, maar de serverupdate is nog niet geïnstalleerd.', 'Live Rounds is ready, but the server update has not been installed yet.');
    return copy('Geen verbinding. We proberen het opnieuw; je antwoorden blijven staan.', 'Connection unavailable. Retrying; your answers stay in place.');
  }

  function showError(error) {
    el('liveMessage').textContent = errorText(error);
    el('liveMessage').hidden = false;
  }

  // Verzoeken blijven op volgorde. Een late reactie uit een verlaten room wordt genegeerd.
  function request(action, options = {}, code = state?.code, quiet = false) {
    const version = generation;
    pending++;
    const task = queue.catch(() => {}).then(async () => {
      if (version !== generation) return;
      const started = Date.now();
      let timeout;
      let response;
      try {
        response = await Promise.race([
          supabaseClient.rpc('live_rounds', {p_action:action,p_code:code || null,p_options:options}),
          new Promise((_, reject) => { timeout=setTimeout(()=>reject(Error('CONNECTION_TIMEOUT')),10000); })
        ]);
      } finally { clearTimeout(timeout); }
      const { data, error } = response;
      if (version !== generation) return;
      if (error) throw error;
      if (!data?.code || !Array.isArray(data.players)) throw Error('INVALID_STATE');
      offset = Date.parse(data.serverTime) - (started + Date.now()) / 2;
      lastSuccess = Date.now();
      const changed = state && (state.phase !== data.phase || state.round !== data.round);
      state = data;
      sessionStorage.setItem('netto_live_room', state.code);
      el('liveMessage').hidden = true;
      if (!channel) connect();
      render();
      if (action !== 'state' || changed) signal();
      return data;
    }).catch(error => {
      if (version === generation) {
        showError(error);
        if (!quiet) showNoticeToast(errorText(error), '⚠', copy('Live Rondes','Live Rounds'));
      }
    }).finally(() => { pending--; });
    queue = task;
    return task;
  }

  function signal() {
    // Nooit antwoorden, factoren of deadlines via een openbaar broadcastkanaal versturen.
    if (channel) Promise.resolve(channel.send({type:'broadcast',event:'changed',payload:{}})).catch(() => {});
  }

  function connect() {
    ensureRaceLobby();
    const version = generation;
    const roomChannel = nettoRoomChannel(state.code, 'live');
    channel = roomChannel;
    roomChannel.on('broadcast',{event:'changed'},() => {
      if (version === generation && !pending && state) request('state',{},state.code,true);
    }).on('presence',{event:'sync'},() => {
      if (version === generation && state) renderPlayers();
    }).subscribe(status => {
      if (version !== generation) return;
      if (status === 'SUBSCRIBED') roomChannel.track({client_id:RACE_CLIENT_ID,user_id:currentUser.id,name:raceDisplayName()});
      // Heartbeats/RPC blijven werken wanneer alleen Realtime tijdelijk uitvalt.
    });
    heartbeat = setInterval(() => { if (state && !pending) request('state',{},state.code,true); }, 2000);
    clock = setInterval(tick, 200);
  }

  function lobbyEntry() {
    if (!state || state.phase !== 'lobby' || state.visibility !== 'open' || state.host !== currentUser?.id) return null;
    return {kind:'open-live',status:'waiting',roomCode:state.code,name:raceDisplayName(),seconds:state.seconds,
      rounds:state.rounds,players:state.players.length,createdAt:Date.parse(state.createdAt),client_id:RACE_CLIENT_ID};
  }

  function renderOpenGames() {
    const list = el('liveOpenGames');
    if (!list) return;
    const entries = Object.values(raceLobbyChannel?.presenceState() || {}).flat();
    const games = [...new Map(entries.filter(entry => entry.kind==='open-live' && entry.status==='waiting'
      && /^[A-Z2-9]{6}$/.test(entry.roomCode) && entry.client_id!==RACE_CLIENT_ID && entry.players<8)
      .map(entry => [entry.roomCode,entry])).values()];
    list.innerHTML = games.length ? games.map(game => `<button type="button" class="race-open-game" data-code="${esc(game.roomCode)}"><span>${esc(game.name)}</span><span>${esc(game.seconds)}s · ${esc(game.rounds)} ${copy('rondes','rounds')} · ${esc(game.players)}/8</span><b>${copy('Meedoen','Join')} →</b></button>`).join('')
      : `<p class="live-muted">${raceLobbyFout ? copy('Lobbyverbinding verbroken. Probeer opnieuw.','Lobby connection lost. Please retry.') : copy('Nog geen open rooms. Maak de eerste.','No open rooms yet. Create the first one.')}</p>`;
    list.querySelectorAll('[data-code]').forEach(button => button.addEventListener('click',() => join(button.dataset.code)));
  }

  function setup() {
    el('liveSetup').hidden = false;
    el('liveRoom').hidden = true;
    el('livePlay').hidden = true;
    el('liveReveal').hidden = true;
    el('liveFinished').hidden = true;
    el('liveResume').hidden = !remembered();
    renderOpenGames();
  }

  function open() {
    closeMenu();
    if (typeof leaveRaceRoom === 'function') leaveRaceRoom();
    showScreen('live');
    if (state) render(); else setup();
    ensureRaceLobby();
  }

  async function create(event) {
    event.preventDefault();
    if (!requireLogin() || pending) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const options = {seconds:Number(el('liveSeconds').value),rounds:Number(el('liveRounds').value),visibility:el('liveVisibility').value};
    await request('create', options, null);
  }

  async function join(code) {
    if (!requireLogin() || pending) return;
    code = String(code || '').trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(code)) {
      showError({message:copy('Vul een code van zes letters/cijfers in.','Enter a six-character room code.')});
      el('liveMessage').textContent = copy('Vul een code van zes letters/cijfers in.','Enter a six-character room code.');
      return;
    }
    await request('join', {}, code);
  }

  function renderPlayers() {
    if (!state) return;
    const host = state.host;
    const content = state.players.map(player => {
      const status = !player.connected || player.disqualified ? copy('Niet verbonden','Disconnected')
        : player.submitted ? copy('Ingezonden','Submitted') : state.phase==='lobby' ? copy('Klaar','Ready') : copy('Bezig','Thinking');
      return `<li class="live-player ${player.submitted ? 'is-submitted' : ''}"><span class="live-marker" aria-label="${esc(status)}">${player.submitted ? '✓' : '○'}</span><span>${esc(player.name)}${player.id===currentUser?.id ? ' · '+copy('jij','you') : ''}${state.phase==='lobby' && player.id===host ? ' · host' : ''}<small>${status}</small></span><b>${player.points}</b></li>`;
    }).join('');
    ['liveLobbyPlayers','liveRoundPlayers'].forEach(id => { if (el(id).innerHTML !== content) el(id).innerHTML=content; });
  }

  function renderPuzzle() {
    const puzzle = state.puzzle;
    if (!puzzle) return;
    const list = el('liveQuestionList');
    list.innerHTML = [1,2,3].map((n,i) => `<div class="q-block"><div class="q-label">${esc(puzzle['q'+n+'_label'])}</div><div class="input-wrapper"><input id="liveAnswer${i}" type="text" inputmode="numeric" autocomplete="off" placeholder="${copy('Jouw antwoord','Your answer')}"></div></div>${i<2 ? `<div class="connector"><div class="connector-line"></div><div class="connector-badge ${i===1?'eq':''}">${esc(i===0?puzzle.operator:'=')}</div><div class="connector-line"></div></div>`:''}`).join('');
    werkVraagDetailsBij(puzzle,[...list.querySelectorAll(':scope > .q-block')],false);
    renderPuzzelfoto(list,puzzle);
    [0,1,2].forEach(i => autoCalculatedInputs.delete('liveAnswer'+i));
    bindDerivedInputs('live',puzzle.operator);
    list.querySelectorAll('input').forEach((input,i) => input.addEventListener('keydown', event => {
      if (event.key!=='Enter') return;
      event.preventDefault();
      if (i<2) el('liveAnswer'+(i+1)).focus(); else submit();
    }));
    window.NettoI18n?.translateTree(list);
    el('liveAnswer0')?.focus({preventScroll:true});
  }

  async function submit() {
    if (!state || state.phase!=='playing' || !state.puzzle || sending || me()?.submitted || me()?.disqualified) return;
    if (now()>=Date.parse(state.deadline) || now()<Date.parse(state.startsAt)) return;
    const answers=[0,1,2].map(i => parseFormattedNumber(el('liveAnswer'+i).value));
    if (!validWholeAnswers(answers) || !validWholeEquation(answers,state.puzzle.operator)) {
      showNoticeToast(errorText({message:validWholeAnswers(answers)?'EQUATION_REQUIRED':'INVALID_ANSWERS'}),'≠',copy('Controleer je antwoorden','Check your answers'));
      return;
    }
    sending=true; tick();
    try { await request('submit',{round:state.round,answers}); }
    finally { sending=false; tick(); }
  }

  function renderReveal() {
    const puzzle = state.puzzle;
    const winner = state.players.find(player => player.id===state.winner);
    el('liveRevealTitle').textContent = winner ? copy(`${winner.name} wint ronde ${state.round}`,`${winner.name} wins round ${state.round}`)
      : copy('Geen winnaar deze ronde','No winner this round');
    el('liveActual').textContent = `${format(puzzle.q1_answer)} ${puzzle.operator} ${format(puzzle.q2_answer)} = ${format(puzzle.q3_answer)}`;
    el('liveRevealQuestions').innerHTML = [1,2,3].map(n => `<p><b>${n}.</b> ${esc(window.NettoI18n?.t(puzzle['q'+n+'_label']) || puzzle['q'+n+'_label'])}</p>`).join('');
    const rows=[...state.players].sort((a,b) => (a.id===state.winner?-1:b.id===state.winner?1:(a.factor??Infinity)-(b.factor??Infinity)));
    el('liveRevealRows').innerHTML = rows.map(player => `<tr class="${player.id===state.winner?'live-winner':''}"><th scope="row">${player.id===state.winner?'★ ':''}${esc(player.name)}${player.disqualified?`<small>${copy('Niet verbonden','Disconnected')}</small>`:''}</th>${[0,1,2].map(i=>`<td>${player.answers?format(player.answers[i]):'—'}</td>`).join('')}<td>${player.factor==null?'—':factor(player.factor)}</td><td>${player.points}</td></tr>`).join('');
  }

  function renderFinish() {
    const best=Math.max(...state.players.map(player=>player.points));
    const winners=state.players.filter(player=>player.points===best);
    el('liveFinishTitle').textContent = best===0 ? copy('Geen rondes gewonnen','No rounds won') : winners.length>1
      ? copy('Gedeelde overwinning','Joint winners') : copy(`${winners[0].name} wint!`,`${winners[0].name} wins!`);
    el('liveFinalPlayers').innerHTML = state.players.map(player=>`<li class="live-player ${best>0&&player.points===best?'live-winner':''}"><span>${esc(player.name)}</span><b>${player.points} ${player.points===1?copy('punt','point'):copy('punten','points')}</b></li>`).join('');
    clearInterval(heartbeat); clearInterval(clock);
    heartbeat=clock=null;
  }

  function render() {
    if (!state) return;
    el('liveSetup').hidden=true;
    el('liveRoom').hidden=state.phase!=='lobby';
    el('livePlay').hidden=state.phase!=='playing';
    el('liveReveal').hidden=state.phase!=='reveal';
    el('liveFinished').hidden=state.phase!=='finished';
    el('liveRoomCode').textContent=state.code;
    el('liveRoomSummary').textContent=`${state.seconds}s · ${state.rounds} ${copy('rondes','rounds')} · ${state.players.length}/8 · ${state.visibility==='open'?copy('Open room','Open room'):copy('Privéroom','Private room')}`;
    el('liveStart').hidden=state.host!==currentUser?.id;
    el('liveStart').disabled=state.players.length<2;
    el('liveWaitingHost').hidden=state.host===currentUser?.id;
    el('liveRoundLabel').textContent=copy(`Ronde ${state.round} van ${state.rounds}`,`Round ${state.round} of ${state.rounds}`);
    el('livePreparing').hidden=Boolean(state.puzzle);
    el('liveQuestionList').hidden=!state.puzzle;
    renderPlayers();
    const key=`${state.code}:${state.phase}:${state.round}:${!!state.puzzle}`;
    if (rendered!==key) {
      rendered=key;
      el('liveScreen').scrollTop=0;
      if (state.phase==='playing'&&state.puzzle) renderPuzzle();
      if (state.phase==='reveal') { renderReveal(); el('liveRevealTitle').focus({preventScroll:true}); }
      if (state.phase==='finished') { renderFinish(); el('liveFinishTitle').focus({preventScroll:true}); }
    }
    if (state.phase==='playing'&&state.mine) state.mine.forEach((value,i)=>{ if(el('liveAnswer'+i)) el('liveAnswer'+i).value=format(value); });
    const entry=Boolean(lobbyEntry());
    if (entry) publishOpenRaceEntry(); else if (previousEntry) unpublishOpenRaceEntry();
    previousEntry=entry;
    tick();
  }

  function tick() {
    if (!state || state.phase==='finished') return;
    const preparing=state.phase==='playing'&&now()<Date.parse(state.startsAt);
    if (state.phase==='playing') {
      el('livePreparing').hidden=!preparing;
      el('liveQuestionList').hidden=preparing||!state.puzzle;
    }
    const target=preparing?state.startsAt:state.deadline;
    const seconds=Math.max(0,Math.ceil((Date.parse(target)-now())/1000));
    const stale=Date.now()-lastSuccess>6000;
    el('liveConnection').hidden=!stale;
    const timer=preparing ? copy(`Start over ${seconds}…`,`Starting in ${seconds}…`) : `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
    if (el('liveTimer').textContent!==timer) el('liveTimer').textContent=timer;
    el('liveTimer').classList.toggle('is-urgent',!preparing&&seconds<=10);
    if (state.phase==='reveal') el('liveNextRound').textContent=seconds>0
      ? (state.round===state.rounds ? copy(`Eindstand over ${seconds}s`,`Final standings in ${seconds}s`):copy(`Volgende ronde over ${seconds}s`,`Next round in ${seconds}s`))
      : copy('Even synchroniseren…','Synchronising…');
    const locked=preparing||seconds===0||sending||!!me()?.submitted||!!me()?.disqualified||stale;
    el('liveSubmit').disabled=locked;
    el('liveQuestionList').querySelectorAll('input').forEach(input=>{ input.disabled=locked; });
    el('liveSubmit').textContent=me()?.submitted ? copy('Ingezonden ✓','Submitted ✓') : sending?copy('Versturen…','Submitting…'):copy('Antwoorden inleveren','Submit answers');
    el('liveRoundHint').textContent=me()?.disqualified?copy('Je doet vanaf de volgende ronde weer mee.','You can play again next round.')
      : me()?.submitted?copy('Je antwoorden staan vast. Wachten op de anderen…','Your answers are locked in. Waiting for the others…')
      : copy('De som moet kloppen. Je kunt één keer inleveren.','The equation must match. You can submit once.');
  }

  function leave(reset = true) {
    const code=state?.code;
    generation++;
    clearInterval(heartbeat); clearInterval(clock);
    heartbeat=clock=null;
    if (code && supabaseClient) supabaseClient.rpc('live_rounds',{p_action:'leave',p_code:code,p_options:{}}).then(()=>{},()=>{});
    if (channel) { signal(); supabaseClient?.removeChannel(channel); channel=null; }
    if (previousEntry) unpublishOpenRaceEntry();
    previousEntry=false; state=null; rendered=''; sending=false;
    sessionStorage.removeItem('netto_live_room');
    if (reset) setup();
  }

  document.addEventListener('DOMContentLoaded',()=>{
    el('liveCreateForm').addEventListener('submit',create);
    el('liveJoinForm').addEventListener('submit',event=>{event.preventDefault();join(el('liveJoinCode').value);});
    el('liveStart').addEventListener('click',()=>{if(!pending) request('start');});
    el('liveResume').addEventListener('click',()=>join(remembered()));
    el('liveSubmit').addEventListener('click',submit);
    document.querySelectorAll('[data-live-leave]').forEach(button=>button.addEventListener('click',()=>leave()));
    el('liveRefresh').addEventListener('click',()=>{ensureRaceLobby();renderOpenGames();});
    el('liveCopy').addEventListener('click',async()=>{
      try { await navigator.clipboard.writeText(state.code); showNoticeToast(copy('Roomcode gekopieerd','Room code copied'),'✓',copy('Gekopieerd','Copied')); }
      catch (_) { showNoticeToast(state.code,'⌨',copy('Kopieer deze code','Copy this code')); }
    });
  });
  window.NettoLive={open,leave,lobbyEntry,renderOpenGames};
  window.openLiveRounds=open;
})();
