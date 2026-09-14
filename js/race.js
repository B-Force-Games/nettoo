// Netto frontend module.
// Loaded as a classic script so the existing shared global scope stays intact.

// ===== PUZZEL RACE — zoveel mogelijk puzzels exact oplossen =====
  const RACE_TOTAL_SECONDS = 300;
  const RACE_DURATIONS = {
    bullet: 180,
    snel: 300,
    blitz: 600
  };
  const RACE_DURATION_META = {
    bullet: { label: '3 minuten', name: 'Bullet', emoji: '⚡' },
    snel: { label: '5 minuten', name: 'Snel', emoji: '⏱️' },
    blitz: { label: '10 minuten', name: 'Blitz', emoji: '🚀' }
  };

  // Hoe dicht je bij het antwoord moet zitten om een punt te pakken. De factor
  // is het aantal keren dat je ernaast zat: 1,00 betekent precies goed, 1,25 dat
  // je binnen een kwart van de waarde bleef. De race telt de drie vragen samen
  // en middelt hun factor, dus een misser op een vraag kun je met twee goede
  // deels goedmaken.
  const RACE_TOLERANTIES = {
    perfect: 1.00, netjes: 1.25, ruim: 1.50, grof: 2.00, breed: 3.00
  };
  const RACE_TOLERANTIE_META = {
    perfect: { label: '1,00×', name: 'Perfect', uitleg: 'Exact goed, niets ernaast' },
    netjes: { label: '1,25×', name: 'Netjes', uitleg: 'Een kwart ernaast mag' },
    ruim: { label: '1,50×', name: 'Ruim', uitleg: 'Anderhalf keer ernaast mag' },
    grof: { label: '2,00×', name: 'Grof', uitleg: 'Factor twee, orde van grootte' },
    breed: { label: '3,00×', name: 'Breed', uitleg: 'Gemiddelde afwijking tot factor drie' }
  };
  const RACE_TOLERANTIE_VOLGORDE = ['perfect', 'netjes', 'ruim', 'grof', 'breed'];
  const RACE_TOLERANTIE_STANDAARD = 'perfect';
  const RACE_LEVEL_ORDER = { 'easy': 0, 'intermediate': 1, 'hard': 2, 'extremely-hard': 3 };
  const RACE_LEVEL_LABEL = { 'easy': 'Easy', 'intermediate': 'Intermediate', 'hard': 'Hard', 'extremely-hard': 'Extremely Hard' };
  const RACE_MODE_CONFIG_KEY = 'netto_race_mode_config';
  let raceQueue = [];
  let raceState = null;
  let raceMode = 'solo';
  let raceOnlineVisibility = 'open'; // aan/uit-schakelaar in de online-tab
  let raceLobbyChannel = null;
  let raceLobbyReady = false;
  // Of de laatste poging tot verbinden mislukte. Zonder dit is een kapotte
  // lobby niet te onderscheiden van een lobby waar niemand in zit.
  let raceLobbyFout = false;
  let raceAutoStartTimer = null;
  let raceAutoStartInterval = null;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'\"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '\"': '&quot;' }[character]));
  }

  function raceDurationText(seconds) {
    const total = Math.max(0, Number(seconds) || RACE_TOTAL_SECONDS);
    const minutes = Math.floor(total / 60);
    return `${minutes}:00`;
  }

  function buildRaceQueue(seed) {
    // Elke run gebruikt een willekeurige, gededupliceerde volgorde. In een
    // duel komt de seed van de host, zodat beide spelers gelijk lopen.
    let source;
    if (window.NETTO_RACE_POOL && window.NETTO_RACE_POOL.length > 0) {
      source = window.NETTO_RACE_POOL;
    } else {
      source = REBUILT_DATA.race || [];
    }
    const list = source.map(normalizeLibraryPuzzle);
    const rng = mulberry32(seed ?? (Date.now() ^ (Math.random() * 0xffffffff)));
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    const seen = new Set();
    return list.filter(p => {
      const key = p.calculation || `${p.q1_answer}${p.operator}${p.q2_answer}=${p.q3_answer}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Kleine deterministische PRNG (Mulberry32) voor gedeelde duel-queues.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function getRaceModeConfig(mode) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(RACE_MODE_CONFIG_KEY) || '{}'); } catch (_) {}
    const config = saved[mode] || {};
    return {
      durationKey: RACE_DURATIONS[config.durationKey] ? config.durationKey : 'snel',
      toleranceKey: RACE_TOLERANTIES[config.toleranceKey]
        ? config.toleranceKey : RACE_TOLERANTIE_STANDAARD
    };
  }

  function saveRaceModeConfig(mode, patch) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(RACE_MODE_CONFIG_KEY) || '{}'); } catch (_) {}
    saved[mode] = { ...getRaceModeConfig(mode), ...patch };
    localStorage.setItem(RACE_MODE_CONFIG_KEY, JSON.stringify(saved));
  }

  function raceTolerantieMeta(key) {
    return RACE_TOLERANTIE_META[key] || RACE_TOLERANTIE_META[RACE_TOLERANTIE_STANDAARD];
  }

  function raceDurationMeta(key) {
    return RACE_DURATION_META[key] || RACE_DURATION_META.snel;
  }

  function ensureRaceLobby() {
    if (!supabaseClient) return;
    if (raceLobbyChannel) {
      // Kanaal bestaat al: zorg dat het daadwerkelijk gesubscribed is (de
      // lobby-listing vertrouwt op raceLobbyReady) en publish opnieuw — de
      // sessie kan inmiddels een open host zijn geworden.
      if (!raceLobbyReady) {
        try { supabaseClient.removeChannel(raceLobbyChannel); } catch (_) {}
        raceLobbyChannel = null;
      } else {
        publishOpenRaceEntry();
        return;
      }
    }
    raceLobbyChannel = supabaseClient.channel('netto-race-lobby-v1', {
      config: { presence: { key: RACE_CLIENT_ID } }
    });
    raceLobbyChannel
      .on('presence', { event: 'sync' }, () => { raceLobbyReady = true; publishOpenRaceEntry(); renderOpenGames(); })
      .on('presence', { event: 'join' }, renderOpenGames)
      .on('presence', { event: 'leave' }, renderOpenGames)
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          raceLobbyReady = true;
          raceLobbyFout = false;
          publishOpenRaceEntry();
          renderOpenGames();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Kanaal kapot: volledig resetten zodat de volgende ensure het opnieuw probeert.
          raceLobbyReady = false;
          raceLobbyChannel = null;
          // En het opnieuw tekenen, anders blijft er "Nog geen open games"
          // staan terwijl er in werkelijkheid geen verbinding is.
          raceLobbyFout = true;
          renderOpenGames();
        }
      });
  }
  function openRaceEntries() {
    if (!raceLobbyChannel) return [];
    const entries = [];
    Object.values(raceLobbyChannel.presenceState() || {}).forEach(metas => {
      metas.forEach(meta => {
        if (meta && meta.kind === 'open-race' && meta.status === 'waiting' && meta.roomCode && meta.client_id !== RACE_CLIENT_ID) {
          entries.push(meta);
        }
      });
    });
    const seen = new Set();
    return entries
      .filter(entry => {
        if (Date.now() - Number(entry.createdAt || 0) > 10 * 60 * 1000 || seen.has(entry.roomCode)) return false;
        seen.add(entry.roomCode);
        return true;
      })
      .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  }

  function renderOpenGames() {
    const list = document.getElementById('raceOpenGamesList');
    if (!list) return;
    const games = openRaceEntries();
    if (!games.length) {
      // Leeg en kapot zagen er hetzelfde uit: "Nog geen open games" stond er
      // ook als de verbinding was weggevallen of er helemaal geen server was.
      // Je bleef dan wachten op spelers die je nooit te zien zou krijgen.
      const melding = !supabaseClient
        ? 'Geen verbinding met de server, dus open games zijn nu niet te zien. Solo spelen kan wel.'
        : raceLobbyFout
          ? 'De verbinding met de lobby is weggevallen. Ververs om het opnieuw te proberen.'
          : 'Nog geen open games. Maak de eerste.';
      list.innerHTML = '';
      const div = document.createElement('div');
      div.className = 'race-open-games-empty';
      div.textContent = melding;
      list.appendChild(div);
      return;
    }
    list.innerHTML = games.map(game => {
      const duration = raceDurationMeta(game.durationKey);
      return `<button class="race-open-game" type="button" onclick="joinOpenRaceGame('${escapeHtml(game.roomCode)}','${escapeHtml(game.durationKey)}')"><span class="race-open-game-player">${escapeHtml(game.name || 'Speler')}</span><span class="race-open-game-details"><b>${duration.emoji} ${escapeHtml(duration.label)}</b></span><span class="race-open-game-join">Join →</span></button>`;
    }).join('');
  }

  function publishOpenRaceEntry(status = 'waiting') {
    const session = raceDuelSession;
    if (!raceLobbyReady || !raceLobbyChannel || !session || session.visibility !== 'open' || session.role !== 'host') return;
    try {
      raceLobbyChannel.track({
        kind: 'open-race',
        status,
        roomCode: session.code,
        name: raceDisplayName(),
        durationKey: session.durationKey || getRaceModeConfig('online').durationKey,
        toleranceKey: session.toleranceKey || getRaceModeConfig('online').toleranceKey,
        createdAt: session.createdAt || Date.now(),
        client_id: RACE_CLIENT_ID
      });
    } catch (_) {}
    renderOpenGames();
  }

  function unpublishOpenRaceEntry() {
    if (!raceLobbyChannel || !raceLobbyReady) return;
    try { raceLobbyChannel.untrack(); } catch (_) {}
    renderOpenGames();
  }

  function clearOpenRaceAutoStart() {
    if (raceAutoStartTimer) clearTimeout(raceAutoStartTimer);
    if (raceAutoStartInterval) clearInterval(raceAutoStartInterval);
    raceAutoStartTimer = null;
    raceAutoStartInterval = null;
    if (raceDuelSession) raceDuelSession.autoStartDeadline = null;
  }

  function scheduleOpenRaceAutoStart() {
    const session = raceDuelSession;
    if (!session || session.role !== 'host' || session.visibility !== 'open' || !session.opponentName || raceState || raceAutoStartTimer) return;
    session.autoStartDeadline = Date.now() + 20000;
    const tick = () => {
      if (!raceDuelSession || raceDuelSession !== session || raceState || !session.opponentName) {
        clearOpenRaceAutoStart();
        return;
      }
      const seconds = Math.max(0, Math.ceil((session.autoStartDeadline - Date.now()) / 1000));
      setRaceDuelStatus(`${session.opponentName} is er · automatische start over ${seconds}s`);
      if (seconds <= 0) {
        clearOpenRaceAutoStart();
        startDuelRace();
      }
    };
    tick();
    raceAutoStartInterval = setInterval(tick, 1000);
    raceAutoStartTimer = setTimeout(() => { clearOpenRaceAutoStart(); startDuelRace(); }, 20000);
  }

  function renderRaceRoomSettings() {
    const el = document.getElementById('raceRoomSettings');
    if (!el || !raceDuelSession) return;
    const duration = raceDurationMeta(raceDuelSession.durationKey);
    const tol = raceTolerantieMeta(raceDuelSession.toleranceKey);
    el.textContent = `${duration.emoji} ${duration.label} · 🎯 ${tol.label} ${tol.name}`;
  }

  function openSettings() {
    closeMenu();
    updateConfettiToggle();
    updateAutoCalcToggle();
    if (typeof werkLeaderboardToggleBij === 'function') werkLeaderboardToggleBij();
    applyTheme();
    showScreen('settings');
    document.getElementById('settingsScreen').classList.add('active');
  }

  function closeSettings() {
    document.getElementById('settingsScreen').classList.remove('active');
    showScreen('home');
  }



  function renderRaceDurationOptions(mode) {
    const container = document.getElementById(`race${mode[0].toUpperCase() + mode.slice(1)}Durations`);
    if (!container) return;
    const config = getRaceModeConfig(mode);
    container.querySelectorAll('[data-duration]').forEach(button => {
      button.classList.toggle('active', button.dataset.duration === config.durationKey);
      button.setAttribute('aria-pressed', button.dataset.duration === config.durationKey ? 'true' : 'false');
    });
  }

  function renderRaceTolerantieOptions(mode) {
    const container = document.getElementById(
      `race${mode[0].toUpperCase() + mode.slice(1)}Tolerances`);
    if (!container) return;
    const config = getRaceModeConfig(mode);
    const schuif = container.querySelector('input[type="range"]');
    const index = RACE_TOLERANTIE_VOLGORDE.indexOf(config.toleranceKey);
    const meta = raceTolerantieMeta(config.toleranceKey);
    if (schuif) {
      schuif.value = String(index);
      schuif.setAttribute('aria-valuetext', window.NettoI18n?.t(meta.label + ' ' + meta.name) || meta.label + ' ' + meta.name);
      schuif.style.setProperty('--speling-voortgang', (index * 25) + '%');
    }
    container.querySelectorAll('[data-tolerance]').forEach(label => {
      label.classList.toggle('active', label.dataset.tolerance === config.toleranceKey);
    });
    const uitleg = document.getElementById(
      `race${mode[0].toUpperCase() + mode.slice(1)}ToleranceNote`);
    if (uitleg) {
      const factor = RACE_TOLERANTIES[config.toleranceKey].toLocaleString(nettoNumberLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      uitleg.textContent = statsCopy(`Een puzzel telt bij een gemiddelde factor van maximaal ${factor}×.`, `A puzzle counts with an average factor of ${factor}× or lower.`);
    }
  }

  function selectRaceTolerantie(mode, key) {
    if (!RACE_TOLERANTIES[key]) return;
    saveRaceModeConfig(mode, { toleranceKey: key });
    renderRaceTolerantieOptions(mode);
  }

  function renderRaceModeControls() {
    ['solo', 'online'].forEach(mode => {
      renderRaceDurationOptions(mode);
      renderRaceTolerantieOptions(mode);
    });
  }

  function switchRaceMode(mode) {
    if (!['solo', 'online'].includes(mode)) mode = 'solo';
    raceMode = mode;
    document.querySelectorAll('.race-mode-tab').forEach(button => {
      const active = button.id === `raceMode${mode[0].toUpperCase() + mode.slice(1)}Tab`;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.getElementById('raceSoloSetup').style.display = mode === 'solo' ? 'block' : 'none';
    document.getElementById('raceOnlineSetup').style.display = mode === 'online' ? 'block' : 'none';
    renderRaceModeControls();
    if (mode === 'online') {
      ensureRaceLobby();
      refreshOpenGames();
    }
  }

  function selectRaceDuration(mode, durationKey) {
    if (!RACE_DURATIONS[durationKey]) return;
    saveRaceModeConfig(mode, { durationKey });
    renderRaceDurationOptions(mode);
  }

  function selectOnlineVisibility(visibility) {
    const open = visibility === 'open';
    const checkbox = document.getElementById('raceVisibilityCheckbox');
    if (checkbox) checkbox.checked = open;
    toggleOnlineVisibility(open);
  }

  // Aan/uit-schakelaar in de online-tab: AAN = open game (zichtbaar in de lijst
  // rechts), UIT = closed game (persoonlijke code, start nooit automatisch).
  function toggleOnlineVisibility(open) {
    const isOpen = open !== false && open !== 'closed';
    raceOnlineVisibility = isOpen ? 'open' : 'closed';
    const checkbox = document.getElementById('raceVisibilityCheckbox');
    if (checkbox) checkbox.checked = isOpen;
    const title = document.getElementById('raceVisibilityTitle');
    const sub = document.getElementById('raceVisibilitySub');
    if (title) title.textContent = isOpen ? 'Open game' : 'Closed game';
    if (sub) sub.textContent = isOpen
      ? 'Iedereen ziet jouw game in de lijst rechts en kan direct joinen. Start automatisch na 20 seconden.'
      : 'Alleen spelers met jouw persoonlijke code kunnen meedoen. Er start niets automatisch.';
    const openControls = document.getElementById('raceOpenControls');
    const closedControls = document.getElementById('raceClosedControls');
    if (openControls) openControls.style.display = isOpen ? 'block' : 'none';
    if (closedControls) closedControls.style.display = isOpen ? 'none' : 'block';
  }

  function refreshOpenGames() {
    ensureRaceLobby();
    renderOpenGames();
  }
  function createOpenRaceGame() {
    const config = getRaceModeConfig('online');
    createRaceRoom('open', config);
  }

  function openPuzzleRace() {
    closeMenu();
    leaveRaceRoom();
    raceQueue = buildRaceQueue();
    stopRaceTimer();
    raceState = null;
    showScreen('race');
    document.getElementById('raceScreen').classList.add('active');
    document.getElementById('raceStart').style.display = 'block';
    document.getElementById('racePlay').style.display = 'none';
    document.getElementById('raceResults').style.display = 'none';
    resetRaceDuelUi();
    renderRaceModeControls();
    switchRaceMode('solo');
    toggleOnlineVisibility(raceOnlineVisibility === 'open');
    const best = Number(localStorage.getItem('netto_race_best') || 0);
    const bestEl = document.getElementById('raceBest');
    if (bestEl) bestEl.textContent = best > 0 ? `Jouw record: ${best} exact goed` : 'Nog geen record gezet — word de eerste.';
  }

  function closePuzzleRace() {
    stopRaceTimer();
    raceState = null;
    leaveRaceRoom();
    document.getElementById('raceScreen').classList.remove('active');
    showScreen('home');
  }

  function startPuzzleRace() {
    const config = getRaceModeConfig('solo');
    leaveRaceRoom();
    startRaceCore(false, config);
  }

  function startDuelRace() {
    if (!raceDuelSession || raceDuelSession.role !== 'host') return;
    clearOpenRaceAutoStart();
    startRaceCore(true);
  }

  function startRaceCore(isDuel, options = {}) {
    stopRaceTimer();
    const session = raceDuelSession;
    const durationKey = options.durationKey || (session && session.durationKey) || 'snel';
    const toleranceKey = options.toleranceKey || (session && session.toleranceKey)
      || getRaceModeConfig(isDuel ? 'online' : 'solo').toleranceKey;
    const totalSeconds = RACE_DURATIONS[durationKey] || RACE_TOTAL_SECONDS;
    if (isDuel && session && session.role === 'host') {
      session.seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
      session.durationKey = durationKey;
      session.toleranceKey = toleranceKey;
      unpublishOpenRaceEntry();
      broadcastRaceEvent(session.code, 'start', { startedAt: Date.now(), seed: session.seed, durationKey, toleranceKey });
    }
    raceQueue = buildRaceQueue(isDuel && session ? session.seed : undefined);
    if (!raceQueue.length) { showNoticeToast('Er zijn nog geen race-puzzels geladen.'); return; }
    raceState = { index: 0, results: [], correct: 0, streak: 0, longestStreak: 0, remaining: totalSeconds, totalSeconds, durationKey, toleranceKey,
      tolerantie: RACE_TOLERANTIES[toleranceKey] || 1.0, timerId: null, progress: 0, endsAt: null };
    const inDuel = Boolean(isDuel && raceDuelSession);
    if (inDuel) raceDuelSession.opponent = { correct: 0, finished: false };
    const oppEl = document.getElementById('raceOpponentHistory');
    if (oppEl) { oppEl.innerHTML = ''; oppEl.style.display = inDuel ? 'flex' : 'none'; }
    const oppLabel = document.getElementById('raceOpponentLabel');
    if (oppLabel) oppLabel.style.display = inDuel ? 'block' : 'none';
    if (inDuel) updateOpponentScoreline();
    document.getElementById('raceStart').style.display = 'none';
    document.getElementById('raceResults').style.display = 'none';
    document.getElementById('racePlay').style.display = 'block';
    document.getElementById('raceHistory').innerHTML = '';
    document.getElementById('raceDuelVerdict').style.display = 'none';
    renderRacePuzzle();
    startRaceTimer();
  }

  function stopRaceTimer() {
    if (raceState && raceState.timerId) { cancelAnimationFrame(raceState.timerId); raceState.timerId = null; }
  }

  function startRaceTimer() {
    stopRaceTimer();
    const el = document.getElementById('raceTimer');
    const clock = document.getElementById('raceClock');
    if (!el || !clock) return;
    const fill = document.getElementById('raceProgressFill');
    const durationMs = raceState.totalSeconds * 1000;
    raceState.endsAt = Date.now() + (raceState.remaining * 1000);
    let displayedSecond = -1;

    const render = () => {
      const remainingMs = Math.max(0, raceState.endsAt - Date.now());
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      raceState.remaining = remainingSeconds;
      raceState.progress = Math.min(1, Math.max(0, 1 - (remainingMs / durationMs)));

      if (fill) fill.style.transform = `scaleX(${raceState.progress})`;
      if (remainingSeconds !== displayedSecond) {
        displayedSecond = remainingSeconds;
        const m = Math.floor(remainingSeconds / 60), s = remainingSeconds % 60;
        el.textContent = `${m}:${String(s).padStart(2, '0')}`;
        clock.classList.toggle('warn', remainingSeconds <= 60 && remainingSeconds > 10);
        clock.classList.toggle('crit', remainingSeconds <= 10);
      }

      if (remainingMs <= 0) {
        raceState.timerId = null;
        finishRace(true);
        return;
      }
      raceState.timerId = requestAnimationFrame(render);
    };
    render();
  }

  function renderRacePuzzle() {
    const p = raceQueue[raceState.index];
    if (!p) { finishRace(false); return; }
    document.getElementById('raceLevelLabel').textContent = RACE_LEVEL_LABEL[p.difficulty] || 'Puzzel';
    // Race heeft geen vast eindpunt meer (random pool): de balk loopt over de
    // tijd i.p.v. over een puzzelnummer.
    document.getElementById('raceProgressLabel').textContent = `Puzzel ${raceState.index + 1}`;
    document.getElementById('raceCorrectCount').textContent = raceState.correct;
    document.getElementById('raceStreakCount').textContent = raceState.streak;
    document.getElementById('raceProgressFill').style.transform = `scaleX(${raceState.progress || 0})`;
    document.getElementById('raceFeedback').textContent = '';
    document.getElementById('raceFeedback').className = 'race-feedback';
    const listEl = document.getElementById('raceQuestionList');
    const autoCalcNote = localStorage.getItem('netto_auto_calc_note_seen') === 'true' ? '' : `<div class="auto-calc-note" role="status" aria-live="polite">↳ Antwoorden worden automatisch berekend als de berekening klopt.</div>`;
    if (autoCalcNote) localStorage.setItem('netto_auto_calc_note_seen', 'true');
    listEl.innerHTML = [[p.q1_label, p.q1_answer], [p.q2_label, p.q2_answer], [p.q3_label, p.q3_answer]].map((q, i) =>
      `<div class="q-block"><div class="q-label">${q[0] || 'Vraag niet beschikbaar'}</div><div class="input-wrapper"><input type="text" class="daily-style-input" id="raceAnswer${i}" name="netto-race-${i}" inputmode="numeric" placeholder="Jouw schatting" autocomplete="off" autocorrect="off" spellcheck="false" data-lpignore="true"></div></div>${i < 2 ? `<div class="connector"><div class="connector-line"></div><div class="connector-badge ${i === 1 ? 'eq' : ''}">${i === 0 ? (p.operator || '×') : '='}</div><div class="connector-line"></div></div>` : ''}`).join('') + autoCalcNote;
    // De race gebruikt dezelfde eenheden en toegankelijke vraaglabels als vrij spelen.
    werkVraagDetailsBij(p, [...listEl.querySelectorAll(':scope > .q-block')], false);
    renderPuzzelfoto(listEl, p);
    bindRaceInputs(p.operator || '×');
    const first = document.getElementById('raceAnswer0');
    if (first) first.focus();
  }

  function bindRaceInputs(operator) {
    const ids = ['raceAnswer0', 'raceAnswer1', 'raceAnswer2'];
    ids.forEach((id, index) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (index < ids.length - 1) document.getElementById(ids[index + 1]).focus();
          else submitPuzzleRace();
          return;
        }
        const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'];
        if (allowed.includes(e.key) || e.ctrlKey || e.metaKey) return;
        if (!/[\d,]/.test(e.key)) { e.preventDefault(); input.classList.add('shake'); setTimeout(() => input.classList.remove('shake'), 400); showSarcasticToast(); }
      });
    });
    bindDerivedInputs('race', operator);
  }

  function submitPuzzleRace() {
    if (!raceState) return;
    if (raceState.endsAt !== null && Date.now() >= raceState.endsAt) { finishRace(true); return; }
    const p = raceQueue[raceState.index];
    if (!p) { finishRace(false); return; }
    const answers = [p.q1_answer, p.q2_answer, p.q3_answer];
    // Ook in de race moet een inzending een geldige gehele som zijn.
    const guesses = [0, 1, 2].map(i => {
      const v = parseFormattedNumber(document.getElementById(`raceAnswer${i}`).value);
      return v;
    });
    if (!validWholeEquation(guesses, p.operator || '×')) { showEquationNotice(); return; }
    const factor = answers.reduce((sum, a, i) => sum + scoreVraag(guesses[i], a), 0) / 3;
    const exact = guesses[0] === answers[0] && guesses[1] === answers[1] && guesses[2] === answers[2];
    // Een punt valt binnen de gekozen speling. Bij 1,00 komt dat neer op exact
    // goed; de kleine marge vangt alleen afrondingsruis van het delen door drie.
    const grens = raceState.tolerantie;
    const raak = factor <= grens + 0.0001;
    if (exact) { launchConfetti(); showExactRaceNotice(); }
    raceState.results.push({ puzzle: p, guesses, factor, exact, raak });
    raceState.correct += raak ? 1 : 0;
    raceState.streak = raak ? raceState.streak + 1 : 0;
    raceState.longestStreak = Math.max(raceState.longestStreak, raceState.streak);
    pushRaceChip(raak);
    if (raceDuelSession) broadcastRaceEvent(raceDuelSession.code, 'result', { exact: raak, factor });
    const fb = document.getElementById('raceFeedback');
    fb.textContent = raak
      ? (exact ? '✓ Exact — door!' : `✓ Binnen ${grens.toFixed(2)}× (${factor.toFixed(2)}×) — door!`)
      : `✗ ${factor.toFixed(2)}× ernaast — door!`;
    fb.classList.add(raak ? 'is-good' : 'is-bad');
    raceState.index += 1;
    if (raceState.index >= raceQueue.length) { finishRace(false); return; }
    renderRacePuzzle();
  }

  function pushRaceChip(exact) {
    const el = document.getElementById('raceHistory');
    if (!el) return;
    const chip = document.createElement('span');
    chip.className = `race-chip ${exact ? 'good' : 'bad'}`;
    chip.textContent = exact ? '✓' : '✕';
    el.appendChild(chip);
    el.scrollLeft = el.scrollWidth;
  }

  function finishRace(byTime) {
    if (!raceState) return;
    stopRaceTimer();
    const attempted = raceState.results.length;
    if (!raceState.statsSaved) {
      const saved = readStatsStorage('netto_race_stats', []);
      const history = Array.isArray(saved) ? saved : [];
      history.push(...raceState.results.map(result => ({ factor: result.factor, exact: result.exact, completedAt: new Date().toISOString() })));
      localStorage.setItem('netto_race_stats', JSON.stringify(history));
      raceState.statsSaved = true;
    }
    const correct = raceState.correct;
    const longest = raceState.longestStreak;
    const best = Number(localStorage.getItem('netto_race_best') || 0);
    const isRecord = correct > best;
    if (isRecord) localStorage.setItem('netto_race_best', String(correct));
    const review = raceState.results.map((r, i) => `
      <div class="race-review-item ${r.raak ? 'good' : 'bad'}">
        <div class="race-review-head"><b>#${i + 1}</b><span class="race-review-op">${r.puzzle.operator}</span><span class="race-review-verdict">${r.exact ? '✓ exact' : `${r.raak ? '✓' : '✗'} ${r.factor.toFixed(2)}×`}</span></div>
        <div class="race-review-calc">${r.puzzle.calculation || ''}</div>
        <div class="race-review-answers">${[[r.puzzle.q1_label, r.puzzle.q1_answer, r.guesses[0]], [r.puzzle.q2_label, r.puzzle.q2_answer, r.guesses[1]], [r.puzzle.q3_label, r.puzzle.q3_answer, r.guesses[2]]].map(row => `<div class="race-review-row"><span>${row[0]}</span><b class="${Number(row[2]) === Number(row[1]) ? 'ok' : 'no'}">jij: ${fmt(row[2])} · echt: ${fmt(row[1])}</b></div>`).join('')}</div>
      </div>`).join('') || '<div class="race-review-empty">Geen puzzels ingediend — zet meteen een nieuwe race in!</div>';
    document.getElementById('raceFinalScore').textContent = correct;
    document.getElementById('raceFinalScoreLabel').textContent = raceState.tolerantie === 1
      ? statsCopy('puzzels exact goed', 'puzzles exactly right')
      : statsCopy('puzzels binnen de marge', 'puzzles within tolerance');
    const durationLabel = raceDurationMeta(raceState.durationKey).label;
    const stat = (value, label) => `<span class="race-summary-stat"><strong>${value}</strong><span>${label}</span></span>`;
    let meta = stat(attempted, statsCopy('Gespeeld', 'Played'))
      + stat(durationLabel, statsCopy('Speelduur', 'Duration'))
      + stat(longest, statsCopy('Langste reeks', 'Longest streak'))
      + `<span class="race-summary-note">${statsCopy('Marge', 'Tolerance')}: ${raceState.tolerantie.toFixed(2)}×</span>`
      + (isRecord ? `<span class="race-summary-record">${statsCopy('Nieuw persoonlijk record', 'New personal best')}</span>` : '');
    document.getElementById('raceResultsMeta').innerHTML = meta;
    document.getElementById('raceReviewList').innerHTML = review;
    document.getElementById('racePlay').style.display = 'none';
    document.getElementById('raceResults').style.display = 'block';
    if (raceDuelSession) {
      raceDuelSession.myCorrect = correct;
      if (!raceDuelSession.opponent || !raceDuelSession.opponent.finished) meta += `<span class="race-summary-note">${statsCopy('Wachten op je tegenstander…', 'Waiting for your opponent…')}</span>`;
      broadcastRaceEvent(raceDuelSession.code, 'finish', { correct, attempted });
      tryShowDuelVerdict();
    } else {
      document.getElementById('raceDuelVerdict').style.display = 'none';
    }
    document.getElementById('raceResultsMeta').innerHTML = meta;
    raceState = null;
  }

  // ===== PUZZEL RACE DUEL — live 1v1 via Supabase Realtime =====
  // Presence ontdekt de tegenstander (betrouwbaar, ook als de ene eerder join't);
  // broadcast-events versturen start, per-puzzel resultaat en de finish.
  let raceDuelSession = null;
  const RACE_CLIENT_ID = 'c_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  function raceDisplayName() {
    if (!currentUser) return 'Speler';
    return (currentUser.user_metadata && currentUser.user_metadata.username) || (currentUser.email ? currentUser.email.split('@')[0] : 'Speler');
  }

  function requireRaceLogin() {
    if (currentUser) return true;
    showSarcasticToast('Log eerst in om een duel te spelen.');
    openAuthModal();
    return false;
  }

  function generateRaceRoomCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    return code;
  }

  function raceChannelName(code) { return `netto-race:${String(code).toUpperCase()}`; }

  function createRaceRoom(visibility = 'closed', config = null) {
    if (!requireRaceLogin()) return;
    const selected = config || getRaceModeConfig('online');
    leaveRaceRoom();
    connectRaceRoom(generateRaceRoomCode(), 'host', {
      visibility,
      durationKey: selected.durationKey,
      toleranceKey: selected.toleranceKey
    });
  }

  function createClosedRaceGame() {
    createRaceRoom('closed', getRaceModeConfig('online'));
  }

  function joinRaceRoom(inputId = 'raceOnlineJoinCode') {
    if (!requireRaceLogin()) return;
    const raw = (document.getElementById(inputId)?.value || '').trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(raw)) { showSarcasticToast('Vul een geldige room-code in (6 tekens).'); return; }
    leaveRaceRoom();
    connectRaceRoom(raw, 'guest', { visibility: 'closed' });
  }

  function joinOpenRaceGame(code, durationKey) {
    if (!requireRaceLogin()) return;
    leaveRaceRoom();
    connectRaceRoom(String(code).toUpperCase(), 'guest', {
      visibility: 'open',
      durationKey
    });
  }

  function connectRaceRoom(code, role, config = {}) {
    if (!supabaseClient) { showSarcasticToast('Geen verbinding met Supabase.'); return; }
    const durationKey = RACE_DURATIONS[config.durationKey] ? config.durationKey : null;
    const toleranceKey = RACE_TOLERANTIES[config.toleranceKey] ? config.toleranceKey : null;
    raceDuelSession = {
      code: String(code).toUpperCase(),
      role,
      visibility: config.visibility === 'open' ? 'open' : 'closed',
      durationKey,
      toleranceKey,
      createdAt: Number(config.createdAt) || Date.now(),
      channel: null,
      opponentName: null,
      opponent: null,
      myCorrect: null,
      started: false
    };
    if (raceDuelSession.visibility === 'open') ensureRaceLobby();
    showRaceDuelRoom(raceDuelSession.code);
    setRaceDuelStatus('Verbinden…');
    renderDuelPlayers();
    renderRaceRoomSettings();
    const channel = supabaseClient.channel(raceChannelName(raceDuelSession.code), { config: { broadcast: { self: false } } });
    channel
      .on('presence', { event: 'sync' }, () => handleRacePresence(channel))
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (raceDuelSession && key !== RACE_CLIENT_ID) {
          clearOpenRaceAutoStart();
          setRaceDuelStatus(`${raceDuelSession.opponentName || 'Je tegenstander'} is weggegaan…`);
        }
      })
      .on('broadcast', { event: 'start' }, ({ payload }) => handleRaceEvent('start', payload))
      .on('broadcast', { event: 'result' }, ({ payload }) => handleRaceEvent('result', payload))
      .on('broadcast', { event: 'finish' }, ({ payload }) => handleRaceEvent('finish', payload))
      .subscribe(status => {
        if (!raceDuelSession || raceDuelSession.code !== String(code).toUpperCase()) return;
        if (status === 'SUBSCRIBED') {
          raceDuelSession.channel = channel;
          channel.track({
            client_id: RACE_CLIENT_ID,
            name: raceDisplayName(),
            role,
            visibility: raceDuelSession.visibility,
            durationKey: raceDuelSession.durationKey,
            toleranceKey: raceDuelSession.toleranceKey,
            createdAt: raceDuelSession.createdAt
          });
          setRaceDuelStatus(raceDuelSession.role === 'host'
            ? (raceDuelSession.visibility === 'open' ? 'Open game actief — wachten op speler…' : 'Wachten op tegenstander…')
            : 'Verbonden — wachten tot de host start…');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRaceDuelStatus('Verbinding mislukt — probeer opnieuw.');
        }
      });
    raceDuelSession.channel = channel;
  }

  function handleRacePresence(channel) {
    if (!raceDuelSession) return;
    const state = channel.presenceState();
    let opponentMeta = null;
    Object.values(state).forEach(metas => metas.forEach(meta => { if (meta.client_id && meta.client_id !== RACE_CLIENT_ID) opponentMeta = meta; }));
    if (opponentMeta) {
      const isNew = raceDuelSession.opponentName !== opponentMeta.name;
      raceDuelSession.opponentName = opponentMeta.name || 'Tegenstander';
      // Gast neemt de instellingen van de host over — iedereen speelt dezelfde set en tijd.
      if (raceDuelSession.role === 'guest') {
        if (RACE_DURATIONS[opponentMeta.durationKey]) raceDuelSession.durationKey = opponentMeta.durationKey;
        if (RACE_TOLERANTIES[opponentMeta.toleranceKey]) raceDuelSession.toleranceKey = opponentMeta.toleranceKey;
        renderRaceRoomSettings();
      }
      if (!raceDuelSession.opponent) raceDuelSession.opponent = { correct: 0, finished: false };
      renderDuelPlayers();
      setRaceDuelStatus(raceDuelSession.role === 'host'
        ? `Tegenstander gevonden: ${raceDuelSession.opponentName}`
        : `Verbonden met ${raceDuelSession.opponentName} — wachten tot de host start…`);
      const startBtn = document.getElementById('raceDuelStartBtn');
      if (startBtn) startBtn.style.display = raceDuelSession.role === 'host' ? 'block' : 'none';
      if (isNew) showSarcasticToast(`${raceDuelSession.opponentName} is in de room!`);
      // Open games starten automatisch 20 seconden nadat er een tegenstander is.
      if (raceDuelSession.role === 'host' && raceDuelSession.visibility === 'open') scheduleOpenRaceAutoStart();
    }
  }

  function handleRaceEvent(event, payload) {
    if (!raceDuelSession) return;
    if (event === 'start') {
      if (raceDuelSession && Number.isFinite(Number(payload.seed))) raceDuelSession.seed = Number(payload.seed) >>> 0;
      // Neem de tijd van de host over uit het start-signaal. Een oudere client
      // stuurt hier mogelijk nog een setKey mee; die wordt genegeerd.
      if (raceDuelSession && RACE_DURATIONS[payload.durationKey]) raceDuelSession.durationKey = payload.durationKey;
      if (raceDuelSession && RACE_TOLERANTIES[payload.toleranceKey]) raceDuelSession.toleranceKey = payload.toleranceKey;
      if (!raceState) startRaceCore(true);
    } else if (event === 'result') {
      if (!raceDuelSession.opponent) raceDuelSession.opponent = { correct: 0, finished: false };
      pushOpponentChip(Boolean(payload.exact));
      if (payload.exact) raceDuelSession.opponent.correct += 1;
      updateOpponentScoreline();
    } else if (event === 'finish') {
      if (!raceDuelSession.opponent) raceDuelSession.opponent = { correct: 0 };
      raceDuelSession.opponent.correct = Number(payload.correct) || 0;
      raceDuelSession.opponent.finished = true;
      updateOpponentScoreline();
      tryShowDuelVerdict();
    }
  }

  function broadcastRaceEvent(code, event, payload) {
    const session = raceDuelSession;
    if (!session || session.code !== code || !session.channel) return;
    try { session.channel.send({ type: 'broadcast', event, payload }); } catch (_) {}
  }

  function pushOpponentChip(exact) {
    const el = document.getElementById('raceOpponentHistory');
    if (!el) return;
    el.style.display = 'flex';
    const chip = document.createElement('span');
    chip.className = `race-chip ${exact ? 'good' : 'bad'}`;
    chip.textContent = exact ? '✓' : '✕';
    el.appendChild(chip);
    el.scrollLeft = el.scrollWidth;
  }

  function updateOpponentScoreline() {
    const label = document.getElementById('raceOpponentLabel');
    if (!label || !raceDuelSession) return;
    label.style.display = 'block';
    const correct = raceDuelSession.opponent ? raceDuelSession.opponent.correct : 0;
    const suffix = raceDuelSession.opponent && raceDuelSession.opponent.finished ? ' · KLAAR' : '';
    label.textContent = `${raceDuelSession.opponentName || 'Tegenstander'} · ${correct} goed${suffix}`;
  }

  function tryShowDuelVerdict() {
    if (!raceDuelSession || raceDuelSession.myCorrect == null) return;
    if (!raceDuelSession.opponent || !raceDuelSession.opponent.finished) return;
    if (document.getElementById('raceResults').style.display !== 'block') return;
    const v = document.getElementById('raceDuelVerdict');
    const me = raceDuelSession.myCorrect;
    const opp = raceDuelSession.opponent.correct;
    v.style.display = 'block';
    if (me > opp) { v.className = 'race-duel-verdict win'; v.innerHTML = `🏆 <b>Jij wint!</b> ${me} – ${opp} tegen ${raceDuelSession.opponentName || 'tegenstander'}`; }
    else if (me < opp) { v.className = 'race-duel-verdict lose'; v.innerHTML = `💪 <b>${raceDuelSession.opponentName || 'Tegenstander'} wint</b> ${opp} – ${me} — revanche?`; }
    else { v.className = 'race-duel-verdict tie'; v.innerHTML = `🤝 <b>Gelijkspel</b> — ${me} tegen ${raceDuelSession.opponentName || 'tegenstander'}`; }
  }

  function showRaceDuelRoom(code) {
    const setup = document.getElementById('raceDuelSetup');
    const room = document.getElementById('raceDuelRoom');
    if (setup) setup.style.display = 'none';
    // Verberg de mode-panels zodra er een room actief is.
    ['raceSoloSetup', 'raceOnlineSetup'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    if (room) room.style.display = 'block';
    // Open game: de code is irrelevant — toon in plaats daarvan de lobby-note.
    const isRoomOpen = raceDuelSession && raceDuelSession.visibility === 'open';
    const codeRow = document.getElementById('raceDuelCodeRow');
    const copyBtn = room ? room.querySelector('.race-copy-btn') : null;
    const note = document.getElementById('raceOpenRoomNote');
    if (codeRow) codeRow.style.display = isRoomOpen ? 'none' : 'flex';
    if (copyBtn) copyBtn.style.display = isRoomOpen ? 'none' : 'inline-flex';
    if (note) note.style.display = isRoomOpen ? 'block' : 'none';
    const codeEl = document.getElementById('raceRoomCode');
    if (codeEl) codeEl.textContent = code;
    const startBtn = document.getElementById('raceDuelStartBtn');
    if (startBtn) startBtn.style.display = 'none';
  }

  function resetRaceDuelUi() {
    const setup = document.getElementById('raceDuelSetup');
    const room = document.getElementById('raceDuelRoom');
    if (setup) setup.style.display = 'block';
    if (room) room.style.display = 'none';
    const joinInput = document.getElementById('raceOnlineJoinCode');
    if (joinInput) joinInput.value = '';
    const verdict = document.getElementById('raceDuelVerdict');
    if (verdict) verdict.style.display = 'none';
    const oppEl = document.getElementById('raceOpponentHistory');
    if (oppEl) { oppEl.style.display = 'none'; oppEl.innerHTML = ''; }
    const oppLabel = document.getElementById('raceOpponentLabel');
    if (oppLabel) oppLabel.style.display = 'none';
  }

  function setRaceDuelStatus(text) {
    const el = document.getElementById('raceDuelStatus');
    if (el) el.textContent = text;
  }

  function renderDuelPlayers() {
    const el = document.getElementById('raceDuelPlayers');
    if (!el || !raceDuelSession) return;
    const opp = raceDuelSession.opponentName ? raceDuelSession.opponentName : '<i>wachten…</i>';
    el.innerHTML = `<div class="race-duel-player"><span>jij</span><b>${raceDisplayName()}</b></div><div class="race-duel-player"><span>tegen</span><b>${opp}</b></div>`;
  }

  function copyRaceRoomCode() {
    if (!raceDuelSession) return;
    const code = raceDuelSession.code;
    const done = () => showSarcasticToast(`Room-code ${code} gekopieerd!`, true);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done).catch(() => {});
  }

  function leaveRaceRoom() {
    if (raceDuelSession && raceDuelSession.channel && supabaseClient) {
      try { broadcastRaceEvent(raceDuelSession.code, 'leave', {}); } catch (_) {}
      try { supabaseClient.removeChannel(raceDuelSession.channel); } catch (_) {}
    }
    raceDuelSession = null;
    const room = document.getElementById('raceDuelRoom');
    if (room) room.style.display = 'none';
    // Toon weer het mode-paneel dat actief was (tabs + instellingen).
    const startEl = document.getElementById('raceStart');
    if (startEl && startEl.style.display !== 'none') switchRaceMode(raceMode);
  }
