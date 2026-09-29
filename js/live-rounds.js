// Live Rondes deelt de racelobby en Realtime-kanalen. Alleen de server beslist over tijd en punten.
(function () {
  'use strict';
  const copy = (nl, en) => statsCopy(nl, en);
  const esc = value => escapeHtml(value);
  const el = id => document.getElementById(id);
  let state = null, channel = null, heartbeat = null, clock = null, generation = 0;
  let pending = 0, queue = Promise.resolve(), offset = 0, lastSuccess = 0, rendered = '';
  let sending = false, previousEntry = false, waitingForRound = false;
  const remembered = () => sessionStorage.getItem('netto_live_room') || '';
  const me = () => state?.players.find(player => player.id === currentUser?.id);
  const now = () => Date.now() + offset;
  const format = n => Number(n).toLocaleString(nettoNumberLocale());
  const factor = n => Number(n).toLocaleString(nettoNumberLocale(), {minimumFractionDigits:2,maximumFractionDigits:2}) + '×';
  const roundWord = count => count===1?copy('ronde','round'):copy('rondes','rounds');

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
      ROOM_FULL: ['Deze room is vol.','This room is full.'],
      INVALID_CAPACITY: ['Kies maximaal 2 tot 8 spelers.','Choose a player limit from 2 to 8.'],
      CAPACITY_LOCKED: ['Het maximum staat vast zodra de room is aangemaakt.','The player limit is fixed once the room is created.'],
      CAPACITY_UNAVAILABLE: ['Deze server heeft nog een vaste limiet van 8 spelers. Kies 8 of voer eerst de database-update uit.','This server still has a fixed limit of 8 players. Choose 8 or install the database update first.'],
      MATCH_STARTED: ['De wedstrijd is al begonnen.','This match has already started.'],
      NOT_A_MEMBER: ['Je zit niet meer in deze room.','You are no longer in this room.'],
      HOST_ONLY: ['Alleen de host kan de room beheren.','Only the host can manage this room.'],
      SETTINGS_UNAVAILABLE: ['Deze server gebruikt nog de standaardregels: een kloppende som, zonder antwoorden tussen rondes. Klik opnieuw op Room maken om daarmee te spelen. De extra opties hebben een database-update nodig.','This server still uses standard rules: a valid equation, without between-round answers. Click Create room again to play with those rules. Custom rules need a database update.'],
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
      rounds:state.rounds,maxPlayers:state.maxPlayers||8,requireEquation:state.requireEquation!==false,showAnswers:state.showAnswers===true,players:state.players.length,createdAt:Date.parse(state.createdAt),client_id:RACE_CLIENT_ID};
  }

  function renderOpenGames() {
    const list = el('liveOpenGames');
    if (!list) return;
    const entries = Object.values(raceLobbyChannel?.presenceState() || {}).flat();
    const games = [...new Map(entries.filter(entry => entry.kind==='open-live' && entry.status==='waiting'
      && /^[A-Z2-9]{6}$/.test(entry.roomCode) && entry.client_id!==RACE_CLIENT_ID && entry.players<(entry.maxPlayers||8))
      .map(entry => [entry.roomCode,entry])).values()];
list.innerHTML = games.length ? games.map(game => `<button type="button" class="race-open-game" data-code="${esc(game.roomCode)}"><span>${esc(game.name)}<small>${esc(game.seconds)}s · ${esc(game.rounds)} ${roundWord(game.rounds)} · ${esc(game.players)}/${esc(game.maxPlayers||8)}</small><small>${game.requireEquation!==false?copy('Som verplicht','Equation required'):copy('Vrije antwoorden','Free answers')} · ${game.showAnswers?copy('Met onthulling','With reveals'):copy('Snelle rondes','Quick rounds')}</small></span><b>${copy('Meedoen','Join')} →</b></button>`).join('')
      : `<div class="live-open-empty"><span class="live-open-empty-icon" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="15" cy="13" r="5"/><path d="M5 31v-3a10 10 0 0 1 20 0v3M27 9a5 5 0 0 1 0 10M30 23a9 9 0 0 1 5 8"/></svg></span><h3>${raceLobbyFout?copy('Even geen verbinding','Connection interrupted'):copy('De eerste room is aan jou','Start something fun')}</h3><p>${raceLobbyFout?copy('Vernieuw om opnieuw naar open rooms te zoeken.','Refresh to look for open rooms again.'):copy('Er zijn nu geen open rooms. Maak er een aan — andere spelers kunnen hier aansluiten.','No open rooms right now. Create one — other players can join you here.')}</p></div>`;
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
    const options = {seconds:Number(el('liveSeconds').value),rounds:Number(el('liveRounds').value),maxPlayers:Number(el('liveMaxPlayers').value),visibility:el('liveVisibility').value,
      requireEquation:el('liveRequireEquation').checked,showAnswers:el('liveShowRoundAnswers').checked};
    const button=form.querySelector('[type="submit"]');
    button.disabled=true;
    try {
      const {data,error}=await supabaseClient.rpc('live_rounds',{p_action:'available',p_code:null,p_options:{}});
      if(error) throw error;
      if(!data?.maxPlayers) {
        if(options.maxPlayers!==8) throw Error('CAPACITY_UNAVAILABLE');
        delete options.maxPlayers;
      }
      if(!data?.lobbyOptions) {
        // Oudere servers kunnen prima rooms maken, maar negeren deze nieuwe opties.
        // Alleen hun werkelijke standaardregels mogen daarom worden verstuurd.
        const customRules=!options.requireEquation||options.showAnswers;
        el('liveRequireEquation').checked=true;
        el('liveShowRoundAnswers').checked=false;
        el('liveRequireEquation').disabled=el('liveShowRoundAnswers').disabled=true;
        if(customRules) throw Error('SETTINGS_UNAVAILABLE');
        delete options.requireEquation;
        delete options.showAnswers;
      } else {
        el('liveRequireEquation').disabled=el('liveShowRoundAnswers').disabled=false;
      }
      await request('create', options, null);
    } catch(error) { showError(error); }
    finally { button.disabled=false; }
  }

  async function updateSettings() {
    if(!state || typeof state.requireEquation!=='boolean' || state.phase!=='lobby' || state.host!==currentUser?.id || pending) { if(state) render(); return; }
    const options={requireEquation:el('liveRoomRequireEquation').checked,showAnswers:el('liveRoomShowAnswers').checked};
    el('liveRoomRequireEquation').disabled=el('liveRoomShowAnswers').disabled=true;
    await request('settings',options);
    if(state) render();
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
      return `<li class="live-player ${player.submitted || state.phase==='lobby' ? 'is-submitted' : ''}"><span class="live-marker" aria-label="${esc(status)}">${state.phase==='lobby'?esc(player.name.charAt(0).toUpperCase()):player.submitted?'✓':'○'}</span><span>${esc(player.name)}${player.id===currentUser?.id ? ' · '+copy('jij','you') : ''}<small>${state.phase==='lobby' && player.id===host?'Host':status}</small></span>${state.phase==='lobby'?'':`<b>${player.points}</b>`}</li>`;
    }).join('');
    ['liveLobbyPlayers','liveRoundPlayers'].forEach(id => { if (el(id).innerHTML !== content) el(id).innerHTML=content; });
  }

  function renderPuzzle(focus = true) {
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
    if (focus) el('liveAnswer0')?.focus({preventScroll:true});
  }

  async function submit() {
    if (!state || state.phase!=='playing' || !state.puzzle || sending || me()?.submitted || me()?.disqualified) return;
    if (now()>=Date.parse(state.deadline) || now()<Date.parse(state.startsAt)) return;
    const answers=[0,1,2].map(i => parseFormattedNumber(el('liveAnswer'+i).value));
    if (!validWholeAnswers(answers) || (state.requireEquation!==false && !validWholeEquation(answers,state.puzzle.operator))) {
      showNoticeToast(errorText({message:validWholeAnswers(answers)?'EQUATION_REQUIRED':'INVALID_ANSWERS'}),'≠',copy('Controleer je antwoorden','Check your answers'));
      return;
    }
    sending=true; tick();
    try { await request('submit',{round:state.round,answers}); }
    finally { sending=false; tick(); }
  }

  function renderOutcome() {
    const overlay = el('liveRoundOutcome');
    const winner = state.players.find(player => player.id===state.winner);
    const won = state.winner===currentUser?.id;
    overlay.classList.toggle('is-win', won);
    overlay.classList.toggle('is-loss', Boolean(winner)&&!won);
    overlay.classList.toggle('is-draw', !winner);
    el('liveOutcomeIcon').textContent = won ? '✓' : winner ? '×' : '—';
    el('liveOutcomeTitle').textContent = won ? copy('Ronde gewonnen!', 'Round won!')
      : winner ? copy('Ronde verloren', 'Round lost') : copy('Geen winnaar', 'No winner');
    el('liveOutcomeDetail').textContent = winner && !won
      ? copy(`${winner.name} zat het dichtst bij.`, `${winner.name} was closest.`)
      : !winner ? copy('Geen geldige inzending deze ronde.', 'No valid submission this round.')
      : copy('Jij zat het dichtst bij.', 'You were closest.');
    overlay.hidden = false;
  }

  function renderAnswerArchive(rounds) {
    const archive = el('liveAnswerArchive');
    if (!rounds.length) {
      archive.innerHTML = `<p class="live-muted">${copy('Er zijn geen ronde-antwoorden beschikbaar.', 'No round answers are available.')}</p>`;
      return;
    }
    archive.innerHTML = rounds.map(round => {
      const puzzle = round.puzzle;
      const questions = [1,2,3].map(n => `<li><span>${esc(window.NettoI18n?.t(puzzle['q'+n+'_label']) || puzzle['q'+n+'_label'])}</span><b>${format(puzzle['q'+n+'_answer'])}</b></li>`).join('');
      const players = (round.players || []).map(player => `<tr class="${player.id===round.winner?'live-winner':''}"><th scope="row">${player.id===round.winner?'★ ':''}${esc(player.name)}${player.id===currentUser?.id?`<small>${copy('jij','you')}</small>`:''}</th>${[0,1,2].map(i=>`<td>${player.answers?.[i]!=null?format(player.answers[i]):'—'}</td>`).join('')}<td>${player.factor==null?'—':factor(player.factor)}</td></tr>`).join('');
      return `<article class="live-answer-round"><h2>${copy(`Ronde ${round.round}`, `Round ${round.round}`)}</h2><ul class="live-answer-questions">${questions}</ul><div class="live-table-wrap" role="region" tabindex="0" aria-label="${copy(`Antwoorden ronde ${round.round}`, `Answers for round ${round.round}`)}"><table class="live-table"><thead><tr><th scope="col">${copy('Speler','Player')}</th><th scope="col">${copy('Vraag 1','Question 1')}</th><th scope="col">${copy('Vraag 2','Question 2')}</th><th scope="col">${copy('Vraag 3','Question 3')}</th><th scope="col">${copy('Gem. factor','Avg. factor')}</th></tr></thead><tbody>${players}</tbody></table></div></article>`;
    }).join('');
  }

  function renderRoundReview() {
    const winner=state.players.find(player=>player.id===state.winner);
    const won=state.winner===currentUser?.id;
    el('liveRevealRound').textContent=copy(`Ronde ${state.round} van ${state.rounds}`,`Round ${state.round} of ${state.rounds}`);
    el('liveRevealTitle').textContent=copy('De antwoorden','The answers');
    const banner=el('liveRevealWinner');
    banner.classList.toggle('is-win',won);
    banner.textContent=won?copy('✓ Ronde gewonnen! Jij zat het dichtst bij.','✓ Round won! You were closest.')
      :winner?copy(`${winner.name} wint deze ronde.`,`${winner.name} wins this round.`):copy('Geen geldige inzendingen. Niemand krijgt een punt.','No valid submissions. No points awarded.');
    el('liveRevealNext').textContent=state.round>=state.rounds?copy('Tot de eindstand','Until final standings'):copy('Tot de volgende ronde','Until next round');
    const puzzle=state.puzzle;
    if(!puzzle) return;
    const questions=[1,2,3].map(n=>`<div class="live-reveal-answer"><span class="live-muted">${copy('Vraag','Question')} ${n}</span><p>${esc(window.NettoI18n?.t(puzzle['q'+n+'_label'])||puzzle['q'+n+'_label'])}</p><strong>${format(puzzle['q'+n+'_answer'])}</strong></div>`).join('');
    const players=state.players.map(player=>`<tr class="${player.id===state.winner?'live-winner':''}"><th scope="row">${player.id===state.winner?'★ ':''}${esc(player.name)}${player.id===currentUser?.id?`<small>${copy('jij','you')}</small>`:''}</th>${[0,1,2].map(i=>`<td>${player.answers?.[i]!=null&&!player.disqualified?format(player.answers[i]):'—'}</td>`).join('')}<td>${player.factor==null?'—':factor(player.factor)}</td></tr>`).join('');
    el('liveRevealContent').innerHTML=`<div class="live-reveal-answers">${questions}</div><div class="live-reveal-equation">${esc(puzzle.calculation||'')}</div><div class="live-table-wrap" role="region" tabindex="0" aria-label="${copy('Antwoorden en tussenstand','Answers and standings')}"><table class="live-table"><thead><tr><th scope="col">${copy('Speler','Player')}</th>${[1,2,3].map(n=>`<th scope="col">${copy('Vraag','Question')} ${n}</th>`).join('')}<th scope="col">${copy('Gem. factor','Avg. factor')}</th></tr></thead><tbody>${players}</tbody></table></div>`;
  }

  async function toggleAnswers() {
    if (!state || state.phase!=='finished') return;
    const archive = el('liveAnswerArchive');
    const button = el('liveShowAnswers');
    if (!archive.hidden) { archive.hidden=true; button.setAttribute('aria-expanded','false'); return; }
    archive.hidden=false;
    button.setAttribute('aria-expanded','true');
    if (archive.dataset.loaded===state.code) return;
    archive.innerHTML = `<p class="live-muted">${copy('Antwoorden laden…','Loading answers…')}</p>`;
    const code = state.code;
    let data, error;
    try { ({data,error} = await supabaseClient.rpc('live_rounds_results',{p_code:code})); }
    catch (requestError) { error=requestError; }
    if (!state || state.code!==code || state.phase!=='finished') return;
    if (error || !Array.isArray(data)) {
      archive.innerHTML = `<p class="live-notice">${copy('Antwoorden zijn nu niet beschikbaar. Probeer het opnieuw.', 'Answers are unavailable right now. Please try again.')}</p>`;
      return;
    }
    renderAnswerArchive(data);
    archive.dataset.loaded=code;
  }

  function renderFinish() {
    const best=Math.max(...state.players.map(player=>player.points));
    const winners=state.players.filter(player=>player.points===best);
    el('liveFinishTitle').textContent = best===0 ? copy('Geen rondes gewonnen','No rounds won') : winners.length>1
      ? copy('Gedeelde overwinning','Joint winners') : copy(`${winners[0].name} wint!`,`${winners[0].name} wins!`);
    const ranked=[...state.players].sort((a,b)=>b.points-a.points);
    el('liveFinalPlayers').innerHTML = ranked.map(player=>`<li class="live-player ${best>0&&player.points===best?'live-winner':''}"><span class="live-rank">${1+ranked.filter(other=>other.points>player.points).length}</span><span>${esc(player.name)}${player.id===currentUser?.id?`<small>${copy('jij','you')}</small>`:''}</span><b>${player.points} <small>${player.points===1?copy('punt','point'):copy('punten','points')}</small></b></li>`).join('');
    el('liveFinishMeta').textContent=copy(`${state.rounds} ${roundWord(state.rounds)} gespeeld met ${state.players.length} spelers.`,`${state.rounds} ${roundWord(state.rounds)} played with ${state.players.length} players.`);
    el('liveAnswerArchive').hidden=true;
    el('liveAnswerArchive').innerHTML='';
    delete el('liveAnswerArchive').dataset.loaded;
    el('liveShowAnswers').setAttribute('aria-expanded','false');
    clearInterval(heartbeat); clearInterval(clock);
    heartbeat=clock=null;
  }

  function render() {
    if (!state) return;
    // Laat de lobby of vorige ronde staan tot de gedeelde starttijd is bereikt.
    // De nieuwe vragen reizen al mee, maar krijgen geen apart laadscherm.
    waitingForRound = state.phase==='playing' && now()<Date.parse(state.startsAt);
    if (waitingForRound) {
      el('liveStart').disabled=true;
      tick();
      return;
    }
    el('liveSetup').hidden=true;
    el('liveRoom').hidden=state.phase!=='lobby';
    const answerReview=state.phase==='reveal'&&state.showAnswers===true;
    el('livePlay').hidden=!['playing','reveal'].includes(state.phase)||answerReview;
    el('liveReveal').hidden=!answerReview;
    el('liveFinished').hidden=state.phase!=='finished';
    el('liveRoundOutcome').hidden=state.phase!=='reveal'||answerReview;
    el('liveRoomCode').textContent=state.code;
    el('liveRoomSummary').innerHTML=`<span><b>${state.seconds}s</b> ${copy('per ronde','per round')}</span><span><b>${state.rounds}</b> ${roundWord(state.rounds)}</span><span>${state.visibility==='open'?copy('Open room','Open room'):copy('Privéroom','Private room')}</span>`;
    el('liveLobbyCount').textContent=`${state.players.length}/${state.maxPlayers||8}`;
    el('liveStartHint').textContent=state.players.length<2?copy('Nog één speler nodig om te beginnen.','One more player needed to start.'):copy('Iedereen speelt dezelfde puzzel.','Everyone plays the same puzzle.');
    el('liveRoomRequireEquation').checked=state.requireEquation!==false;
    el('liveRoomShowAnswers').checked=state.showAnswers===true;
    const customRulesSupported=typeof state.requireEquation==='boolean'&&typeof state.showAnswers==='boolean';
    el('liveRoomRequireEquation').disabled=el('liveRoomShowAnswers').disabled=!customRulesSupported||state.host!==currentUser?.id||state.phase!=='lobby';
    el('liveRoomRulesNote').textContent=customRulesSupported?copy('De host kiest de regels voor iedereen.','The host chooses the rules for everyone.')
      :copy('Standaardregels actief. Extra opties komen beschikbaar na de database-update.','Standard rules active. Custom rules become available after the database update.');
    el('liveStart').hidden=state.host!==currentUser?.id;
    el('liveStart').disabled=state.players.length<2;
    el('liveWaitingHost').hidden=state.host===currentUser?.id;
    el('liveRoundLabel').textContent=copy(`Ronde ${state.round} van ${state.rounds}`,`Round ${state.round} of ${state.rounds}`);
    el('liveQuestionList').hidden=!state.puzzle;
    renderPlayers();
    const key=`${state.code}:${state.phase}:${state.round}:${!!state.puzzle}:${answerReview}`;
    if (rendered!==key) {
      rendered=key;
      el('liveScreen').scrollTop=0;
      if (state.phase==='playing'&&state.puzzle) renderPuzzle();
      if (state.phase==='reveal') {
        if(answerReview) renderRoundReview();
        else { if (!el('liveQuestionList').children.length) renderPuzzle(false); renderOutcome(); }
      }
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
    const stale=Date.now()-lastSuccess>6000;
    el('liveConnection').hidden=!stale;
    if (waitingForRound) {
      if (!preparing) { waitingForRound=false; render(); return; }
      el('liveSubmit').disabled=true;
      el('liveQuestionList').querySelectorAll('input').forEach(input=>{ input.disabled=true; });
      return;
    }
    const target=preparing?state.startsAt:state.deadline;
    const seconds=Math.max(0,Math.ceil((Date.parse(target)-now())/1000));
    const timer=preparing ? copy(`Start over ${seconds}…`,`Starting in ${seconds}…`) : `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
    if (el('liveTimer').textContent!==timer) el('liveTimer').textContent=timer;
    if(state.phase==='reveal'&&state.showAnswers) el('liveRevealTimer').textContent=String(seconds);
    el('liveTimer').classList.toggle('is-urgent',!preparing&&seconds<=10);
    const locked=state.phase!=='playing'||preparing||seconds===0||sending||!!me()?.submitted||!!me()?.disqualified||stale;
    el('liveSubmit').disabled=locked;
    el('livePlay').classList.toggle('has-submitted',!!me()?.submitted);
    el('liveQuestionList').querySelectorAll('input').forEach(input=>{ input.disabled=locked; });
    el('liveSubmit').textContent=me()?.submitted ? copy('Ingezonden ✓','Submitted ✓') : sending?copy('Versturen…','Submitting…'):copy('Antwoorden inleveren','Submit answers');
    el('liveRoundHint').textContent=me()?.disqualified?copy('Je doet vanaf de volgende ronde weer mee.','You can play again next round.')
      : me()?.submitted?copy('Je antwoorden staan vast. Wachten op de anderen…','Your answers are locked in. Waiting for the others…')
      : state.requireEquation!==false?copy('De som moet kloppen. Je kunt één keer inleveren.','The equation must match. You can submit once.')
      : copy('De som is een aanwijzing. Je antwoorden hoeven er niet aan te voldoen.','The equation is a clue. Your answers do not have to match it.');
  }

  function leave(reset = true) {
    const code=state?.code;
    generation++;
    clearInterval(heartbeat); clearInterval(clock);
    heartbeat=clock=null;
    if (code && supabaseClient) supabaseClient.rpc('live_rounds',{p_action:'leave',p_code:code,p_options:{}}).then(()=>{},()=>{});
    if (channel) { signal(); supabaseClient?.removeChannel(channel); channel=null; }
    if (previousEntry) unpublishOpenRaceEntry();
    previousEntry=false; state=null; rendered=''; sending=false; waitingForRound=false;
    sessionStorage.removeItem('netto_live_room');
    if (reset) setup();
  }

  document.addEventListener('DOMContentLoaded',()=>{
    el('liveCreateForm').addEventListener('submit',create);
    ['liveRoomRequireEquation','liveRoomShowAnswers'].forEach(id=>el(id).addEventListener('change',updateSettings));
    el('liveJoinForm').addEventListener('submit',event=>{event.preventDefault();join(el('liveJoinCode').value);});
    el('liveStart').addEventListener('click',()=>{if(!pending) request('start');});
    el('liveResume').addEventListener('click',()=>join(remembered()));
    el('liveSubmit').addEventListener('click',submit);
    el('liveShowAnswers').addEventListener('click',toggleAnswers);
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
