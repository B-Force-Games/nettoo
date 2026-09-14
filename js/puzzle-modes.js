// Netto frontend module.
// Loaded as a classic script so the existing shared global scope stays intact.

// ===== Puzzle countdown timer (Puzzels-tab én Library) =====
  // Per-difficulty time budget (seconds). Harder puzzles get more thinking time.
  const LIBRARY_TIMER_SECONDS = {
    'easy': 60,
    'intermediate': 90,
    'hard': 120,
    'extremely-hard': 180,
  };
  const puzzleTimerIntervals = {};

  function stopPuzzleTimer(prefix) {
    if (puzzleTimerIntervals[prefix]) { clearInterval(puzzleTimerIntervals[prefix]); delete puzzleTimerIntervals[prefix]; }
  }
  function stopLibraryTimer() { stopPuzzleTimer('library'); }

  function startPuzzleTimer(prefix, difficulty) {
    stopPuzzleTimer(prefix);
    const el = document.getElementById(prefix + 'Timer');
    if (!el) return;
    const total = LIBRARY_TIMER_SECONDS[difficulty] ?? 120;
    const endsAt = Date.now() + total * 1000;
    let remaining = total;
    const render = () => {
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      el.textContent = `⏱ ${m}:${s.toString().padStart(2, '0')}`;
      el.classList.toggle('warn', remaining <= 30 && remaining > 10);
      el.classList.toggle('crit', remaining <= 10);
    };
    render();
    puzzleTimerIntervals[prefix] = setInterval(() => {
      remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      if (remaining <= 0) {
        stopPuzzleTimer(prefix);
        el.textContent = '⏱ 0:00';
        el.classList.add('crit');
        submitPuzzleView(prefix, true);
        return;
      }
      render();
    }, 1000);
  }
  // ===== Generieke puzzle-view (werkt voor 'library' én 'catalogus' prefix) =====
  function werkPuzzelNavigatieBij(prefix, ingeleverd) {
    const navigatie = document.querySelector('#' + prefix + 'PuzzleView .library-actions');
    if (!navigatie) return;
    const bibliotheek = prefix === 'library';
    const reeks = bibliotheek ? libraryPuzzles.filter(p => p.difficulty === selectedDifficulty) : catalogusPuzzleList;
    const index = bibliotheek ? libraryIndex : catalogusPuzzleIndex;
    const verplaats = stap => bibliotheek ? libraryMove(stap) : catalogusPuzzleMove(stap);
    const vorige = document.createElement('button');
    vorige.type = 'button';
    vorige.textContent = statsCopy('← Vorige', '← Previous');
    vorige.disabled = index <= 0;
    vorige.onclick = () => verplaats(-1);
    const volgende = document.createElement('button');
    volgende.type = 'button';
    volgende.className = ingeleverd ? 'puzzel-verder' : '';
    const laatste = index >= reeks.length - 1;
    volgende.textContent = laatste
      ? statsCopy('Alle puzzels →', 'All puzzles →')
      : ingeleverd ? statsCopy('Volgende puzzel →', 'Next puzzle →') : statsCopy('Overslaan →', 'Skip puzzle →');
    // Overslaan navigeert alleen: het levert geen antwoord of score in.
    volgende.onclick = laatste ? () => bibliotheek ? openPuzzles() : openCatalogusLibrary() : () => verplaats(1);
    navigatie.replaceChildren(vorige, volgende);
  }

  function renderPuzzleView(prefix, p, progressLabel, moveAction) {
    const listEl = document.getElementById(prefix + 'QuestionList');
    if (!listEl || !p) return;
    document.getElementById(prefix + 'Progress').textContent = progressLabel;
    document.getElementById(prefix + 'Equation').style.display = 'none';
    const autoCalcNote = localStorage.getItem('netto_auto_calc_note_seen') === 'true' ? '' : `<div class="auto-calc-note" role="status" aria-live="polite">↳ Antwoorden worden automatisch berekend als de berekening klopt.</div>`;
    listEl.innerHTML = [[p.q1_label,p.q1_answer],[p.q2_label,p.q2_answer],[p.q3_label,p.q3_answer]].map((q,i) => `<div class="q-block"><div class="q-label">${q[0] || 'Vraag niet beschikbaar'}</div><div class="input-wrapper"><input type="text" class="library-answer-input daily-style-input" id="${prefix}Answer${i}" name="netto-schatting-${i}" inputmode="numeric" placeholder="Jouw schatting" autocomplete="off" autocorrect="off" spellcheck="false" data-lpignore="true"></div></div>${i < 2 ? `<div class="connector"><div class="connector-line"></div><div class="connector-badge ${i === 1 ? 'eq' : ''}">${i === 0 ? (p.operator || '×') : '='}</div><div class="connector-line"></div></div>` : ''}`).join('') + autoCalcNote + `<button class="btn-check" onclick="submit${prefix === 'library' ? 'Library' : 'Catalogus'}Puzzle()">Check mijn score</button>`;
    if (autoCalcNote) localStorage.setItem('netto_auto_calc_note_seen', 'true');
    if (prefix === 'library') libraryActivePuzzle = p; else catalogusActivePuzzle = p;
    renderPuzzelfoto(listEl, p);
    bindDerivedInputs(prefix, p.operator || '×');
    startPuzzleTimer(prefix, p.difficulty);
    werkPuzzelNavigatieBij(prefix, false);
  }

  function submitPuzzleView(prefix, auto = false) {
    const active = prefix === 'library' ? libraryActivePuzzle : catalogusActivePuzzle;
    if (!active) return;
    const inputs = [0,1,2].map(i => document.getElementById(`${prefix}Answer${i}`));
    if (inputs.some(input => !input)) return;
    const guesses = inputs.map(input => parseFormattedNumber(input.value));
    if (guesses.some(v => !Number.isFinite(v) || v <= 0)) {
      showEquationNotice();
      return;
    }
    if (!validWholeEquation(guesses, active.operator || '×')) { showEquationNotice(); return; }
    stopPuzzleTimer(prefix);
    const answers = [active.q1_answer,active.q2_answer,active.q3_answer];
    const factor = answers.reduce((sum,a,i) => sum + scoreVraag(guesses[i],a),0) / 3;
    if (guesses.every((guess, i) => isSpotOnAnswer(guess, answers[i]))) launchConfetti();
    const plays = JSON.parse(localStorage.getItem('netto_library_plays') || '{}'); plays[active.id] = { factor, guesses, completedAt:new Date().toISOString() }; localStorage.setItem('netto_library_plays',JSON.stringify(plays));
    updateContinuePuzzleButton();
    document.getElementById(prefix + 'QuestionList').innerHTML = answers.map((a,i) => `<div class="library-question"><b>Vraag ${i+1}</b>${[active.q1_label,active.q2_label,active.q3_label][i]}<br><strong>Echt antwoord: ${fmt(a)} · ${scoreVraag(guesses[i],a).toFixed(2)}×</strong></div>`).join('') + `<div class="score-badge-container"><div class="score-badge-title">Jouw gemiddelde afwijking</div><div class="score-badge-val" style="color:${scoreColor(factor)}">${factor.toFixed(2)}×</div></div>`;
    werkPuzzelNavigatieBij(prefix, true);
    syncLibraryPlay(active, guesses[0], guesses[1], guesses[2], factor);
    if (prefix === 'library') renderLibraryCards(); else renderCatalogusPuzzles();
  }

  function openDailyPuzzles() {
    closeMenu(); openLibraryScreen('daily');
  }

  function openPuzzles() {
    closeMenu(); openLibraryScreen('library');
  }

  // SLAPEND, MET OPZET.
  // openLibrary() wordt nergens aangeroepen: er staat geen knop voor in het
  // menu en ook niet op de startpagina. Dat is niet per ongeluk zo gegroeid en
  // ook niet iets dat kapot is — het is een keuze van de eigenaar (10 sept):
  // de catalogus voegt voor dit spel te weinig toe om er een ingang voor te
  // maken, maar de code blijft staan.
  //
  // Het scherm werkt gewoon: 279 puzzels en 837 vragen, doorzoekbaar op
  // operator, categorie en niveau, en de puzzels zijn speelbaar met score.
  // Wil je hem terug, dan is dat één regel in index.html:
  //   <button class="sidebar-item" onclick="openLibrary()">…</button>
  //
  // Let op bij opruimen: hieraan hangt het hele catalogus-blok (dit bestand,
  // #catalogusScreen in index.html, en de .catalogus-* regels in de css).
  function openLibrary() {
    closeMenu(); openCatalogusLibrary();
  }

  // ===== LIBRARY (eigen pagina: doorzoekbare catalogus) =====
  let catalogusView = 'puzzles';            // 'puzzels' | 'vragen'
  let allCatalogusPuzzles = [];             // library + daily puzzles met bron-label
  let catalogusPuzzleList = [];             // actuele gefilterde lijst
  let catalogusPuzzleIndex = 0;
  let catalogusActivePuzzle = null;
  let allCatalogusVragen = [];              // alle losse vragen

  function openCatalogusLibrary() {
    closeMenu();
    buildCatalogusData(); // altijd opnieuw: libraryPuzzles kan door Supabase-merge zijn bijgewerkt
    document.getElementById('catalogusPuzzleView').style.display = 'none';
    renderCatalogusStats();
    populateCatalogusFilters();
    setCatalogusView(catalogusView, null);
    showScreen('catalogus');
    document.getElementById('catalogusScreen').classList.add('active');
  }

  function closeCatalogusScreen() {
    document.getElementById('catalogusScreen').classList.remove('active');
    stopPuzzleTimer('catalogus');
    showScreen('home');
  }

  function buildCatalogusData() {
    // Alle puzzels: 100 library + alle daily's, elk met bron-label en stabiele id.
    allCatalogusPuzzles = [
      ...libraryPuzzles.map(p => ({ ...p, source: 'Puzzels' })),
      ...DAILY_PUZZLES.map((p, i) => ({ ...p, source: 'Daily Archive', id: p.id || `daily-${p.date || p.number || i + 1}` })),
    ];
    // Alle losse vragen (3 per puzzel).
    allCatalogusVragen = [];
    allCatalogusPuzzles.forEach((p, pi) => {
      [p.q1_label, p.q2_label, p.q3_label].forEach((label, qi) => {
        allCatalogusVragen.push({
          id: `${p.id}-q${qi + 1}`,
          label: label || 'Vraag niet beschikbaar',
          answer: [p.q1_answer, p.q2_answer, p.q3_answer][qi],
          category: (p.categories && p.categories[0]) || 'Algemeen',
          operator: p.operator || '×',
          source: p.source || 'Puzzels',
          puzzleName: p.name || `Puzzel ${pi + 1}`,
        });
      });
    });
  }

  function renderCatalogusStats() {
    const plays = JSON.parse(localStorage.getItem('netto_library_plays') || '{}');
    const played = allCatalogusPuzzles.filter(p => plays[p.id]).length;
    document.getElementById('catalogusStats').innerHTML = `<div class="library-stat"><b>${allCatalogusPuzzles.length}</b><span>Puzzels</span></div><div class="library-stat"><b>${allCatalogusVragen.length}</b><span>Vragen</span></div><div class="library-stat"><b>${played}</b><span>Gespeeld door jou</span></div>`;
  }

  function populateCatalogusFilters() {
    const catSelect = document.getElementById('catalogusCategory');
    const vragenSelect = document.getElementById('vragenCategory');
    if (!catSelect || !vragenSelect) return;
    const categories = [...new Set(allCatalogusPuzzles.flatMap(p => p.categories || []))].sort((a,b) => a.localeCompare(b));
    const options = '<option value="">Alle categorieën</option>' + categories.map(c => `<option value="${c.replace(/"/g, '&quot;')}">${c}</option>`).join('');
    catSelect.innerHTML = options;
    vragenSelect.innerHTML = options;
  }

  function setCatalogusView(view, button) {
    catalogusView = view;
    document.querySelectorAll('#catalogusViewToggle button').forEach((b, i) => b.classList.toggle('active', (['puzzles','vragen'][i]) === view));
    document.getElementById('catalogusPuzzlesView').style.display = view === 'puzzles' ? 'block' : 'none';
    document.getElementById('catalogusVragenView').style.display = view === 'vragen' ? 'block' : 'none';
    document.getElementById('catalogusPuzzleView').style.display = 'none';
    if (view === 'puzzles') renderCatalogusPuzzles(); else renderCatalogusVragen();
  }

  function renderCatalogusPuzzles() {
    const search = (document.getElementById('catalogusSearch')?.value || '').trim().toLowerCase();
    const operator = document.getElementById('catalogusOperator')?.value || '';
    const difficulty = document.getElementById('catalogusDifficulty')?.value || '';
    const category = document.getElementById('catalogusCategory')?.value || '';
    catalogusPuzzleList = allCatalogusPuzzles.filter(p => (!operator || p.operator === operator) && (!difficulty || p.difficulty === difficulty) && (!category || (p.categories || []).includes(category)) && (!search || [p.name,p.q1_label,p.q2_label,p.q3_label].join(' ').toLowerCase().includes(search)));
    document.getElementById('catalogusPuzzleCount').textContent = `${catalogusPuzzleList.length} puzzel${catalogusPuzzleList.length === 1 ? '' : 's'} gevonden`;
    const plays = JSON.parse(localStorage.getItem('netto_library_plays') || '{}');
    document.getElementById('catalogusPuzzleGrid').innerHTML = catalogusPuzzleList.map((p, i) => {
      const play = plays[p.id];
      const color = play ? scoreColor(play.factor) : '';
      const label = play ? `Score ${play.factor.toFixed(2)}×` : 'Open puzzle →';
      return `<article class="library-flip-card" role="button" tabindex="0" onclick="playCatalogusPuzzle('${p.id}')" onkeydown="if(event.key==='Enter'||event.key===' ') { event.preventDefault(); playCatalogusPuzzle('${p.id}'); }"><div class="library-flip-card-inner"><div class="library-flip-front ${play ? 'played' : ''}" style="${play ? `background:${color};` : ''}"><strong>#${i + 1}</strong><span>${label}</span><span class="catalogus-source-badge">${p.source || 'Puzzels'}</span></div></div></article>`;
    }).join('') || '<div class="catalogus-lock">Geen puzzels gevonden.</div>';
  }

  function renderCatalogusVragen() {
    const search = (document.getElementById('vragenSearch')?.value || '').trim().toLowerCase();
    const category = document.getElementById('vragenCategory')?.value || '';
    const vragen = allCatalogusVragen.filter(v => (!category || v.category === category) && (!search || (v.label + ' ' + v.puzzleName).toLowerCase().includes(search)));
    document.getElementById('vragenCount').textContent = `${vragen.length} vraag${vragen.length === 1 ? '' : 'en'} gevonden · klik op een kaart voor het antwoord`;
    document.getElementById('vragenGrid').innerHTML = vragen.map((v, i) => `<article class="library-flip-card" role="button" tabindex="0" data-vraag="${i}" onclick="toggleVraagCard(this)" onkeydown="if(event.key==='Enter'||event.key===' ') { event.preventDefault(); toggleVraagCard(this); }"><div class="library-flip-card-inner"><div class="vraag-flip-front"><div class="vraag-tekst">${v.label}</div><div class="vraag-meta"><span class="vraag-categorie">${v.category}</span><span>${v.operator}</span></div></div><div class="vraag-flip-back"><div><div class="vraag-bron">${v.puzzleName} · ${v.source}</div><div class="vraag-tekst" style="color:#fff;">${v.label}</div></div><div class="vraag-antwoord">${fmt(v.answer)}</div></div></div></article>`).join('');
  }

  function toggleVraagCard(cardEl) { cardEl.classList.toggle('revealed'); }

  function playCatalogusPuzzle(id) {
    const index = catalogusPuzzleList.findIndex(p => p.id === id);
    if (index < 0) return;
    catalogusPuzzleIndex = index;
    document.getElementById('catalogusPuzzlesView').style.display = 'none';
    document.getElementById('catalogusVragenView').style.display = 'none';
    document.getElementById('catalogusPuzzleView').style.display = 'block';
    renderCatalogusPuzzleView();
  }

  function catalogusPuzzleMove(direction) {
    const next = Math.max(0, Math.min(catalogusPuzzleList.length - 1, catalogusPuzzleIndex + direction));
    catalogusPuzzleIndex = next;
    renderCatalogusPuzzleView();
  }

  function openLibraryScreen(mode) {
    stopLibraryTimer();
    libraryMode = mode;
    document.getElementById('libraryStats').style.display = 'grid';
    document.getElementById('dailyDateControls').style.display = mode === 'daily' ? 'flex' : 'none';
    document.getElementById('aboutPanel').style.display = 'none';
    document.getElementById('howPanel').style.display = 'none';
    showScreen('library');
    document.getElementById('libraryScreen').classList.add('active');
    const isLibrary = mode === 'library';
    document.getElementById('libraryDifficulties').style.display = isLibrary ? 'grid' : 'none';
    document.getElementById('libraryCardGrid').style.display = isLibrary ? 'grid' : 'none';
    document.getElementById('libraryDifficulties').querySelectorAll('button').forEach((button, index) => { const level = ['easy','intermediate','hard','extremely-hard'][index]; const count = libraryPuzzles.filter(p => p.difficulty === level).length; button.innerHTML = `${level === 'extremely-hard' ? 'Extremely Hard' : level[0].toUpperCase() + level.slice(1)}<span>${count}</span>`; button.disabled = false; button.classList.toggle('active', level === selectedDifficulty); });
    document.getElementById('libraryPuzzleView').style.display = 'none';
    document.getElementById('dailyPuzzleList').style.display = isLibrary ? 'none' : 'block';
    document.getElementById('libraryPageKicker').textContent = isLibrary ? 'NETTO · PUZZELS' : 'NETTO · DAILY ARCHIVE';
    document.getElementById('libraryTitle').textContent = isLibrary ? 'Puzzels' : 'Daily Archive';
    document.getElementById('librarySubtitle').textContent = isLibrary ? 'Kies een moeilijkheid en speel alle puzzels.' : 'Elke dagpuzzel sinds dag één. Speel ze opnieuw.';
    renderLibraryStats();
    if (mode === 'daily') renderDailyArchive();
    else { renderLibraryCards(); loadLibraryFromSupabase(); }
  }
  function openAbout() { closeMenu(); showScreen('library'); document.getElementById('libraryScreen').classList.add('active'); document.getElementById('libraryPageKicker').textContent='NETTO · OVER'; document.getElementById('libraryTitle').textContent='Over Netto'; document.getElementById('librarySubtitle').textContent='Het idee achter het spel.'; document.getElementById('libraryDifficulties').style.display='none'; document.getElementById('dailyPuzzleList').style.display='none'; document.getElementById('libraryPuzzleView').style.display='none'; document.getElementById('libraryStats').style.display='none'; document.getElementById('dailyDateControls').style.display='none'; document.getElementById('howPanel').style.display='none'; document.getElementById('aboutPanel').style.display='block'; }
  function openHowItWorks() { closeMenu(); showScreen('library'); document.getElementById('libraryScreen').classList.add('active'); document.getElementById('libraryPageKicker').textContent='NETTO · UITLEG'; document.getElementById('libraryTitle').textContent='Hoe werkt het?'; document.getElementById('librarySubtitle').textContent='Drie schattingen. Eén formule. De laagste factor wint.'; document.getElementById('libraryDifficulties').style.display='none'; document.getElementById('dailyPuzzleList').style.display='none'; document.getElementById('libraryPuzzleView').style.display='none'; document.getElementById('libraryStats').style.display='none'; document.getElementById('dailyDateControls').style.display='none'; document.getElementById('aboutPanel').style.display='none'; document.getElementById('howPanel').style.display='block'; }
  function closeLibraryScreen() { document.getElementById('libraryScreen').classList.remove('active'); stopLibraryTimer(); showScreen('home'); }
  function closeLibrary() { closeLibraryScreen(); }

  // ===== BREINKRAKERS — 4 vragen in één formule: A op1 B op2 C = D, van links naar rechts =====
  const BK_DATA = window.NETTO_BREINKRAKERS || [];
  const BK_PROGRESS_KEY = 'netto_breinkrakers_progress';
  let bkState = null;
  let bkActivePuzzle = null;
  let bkSubmitted = false;

  // De formule wordt van links naar rechts gelezen: (a op1 b) op2 c = d. Bij
  // "2 + 3 × 4" hoort dus 20 en niet 14. Daarom mag elke bewerking op elke
  // plek staan en rekenen we nergens met de gewone voorrangsregels.
  function bkPas(x, op, y) {
    if (op === '×' || op === '*') return x * y;
    if (op === '÷' || op === '/') return y === 0 ? NaN : x / y;
    if (op === '+') return x + y;
    return x - y;
  }

  // Los x op uit "x op y = uit".
  function bkLinks(op, y, uit) {
    if (op === '×' || op === '*') return y === 0 ? NaN : uit / y;
    if (op === '÷' || op === '/') return uit * y;
    if (op === '+') return uit - y;
    return uit + y;
  }

  // Los y op uit "x op y = uit".
  function bkRechts(op, x, uit) {
    if (op === '×' || op === '*') return x === 0 ? NaN : uit / x;
    if (op === '÷' || op === '/') return uit === 0 ? NaN : x / uit;
    if (op === '+') return uit - x;
    return x - uit;
  }

  function bkLoadProgress() {
    try { return JSON.parse(localStorage.getItem(BK_PROGRESS_KEY) || 'null'); } catch (e) { return null; }
  }
  function bkSaveProgress(progress) { localStorage.setItem(BK_PROGRESS_KEY, JSON.stringify(progress)); }

  function bkNormaliseProgress(progress) {
    const clean = progress && typeof progress === 'object' ? progress : {};
    const uniqueResults = new Map();
    (Array.isArray(clean.results) ? clean.results : []).forEach(result => {
      if (result && result.id) uniqueResults.set(result.id, result);
    });
    return {
      index: Math.max(0, Math.min(Number.isInteger(clean.index) ? clean.index : 0, BK_DATA.length)),
      results: Array.from(uniqueResults.values())
    };
  }

  function bkResultMap(progress) {
    return new Map(progress.results.map(result => [result.id, result]));
  }

  function bkFindNextIncompleteIndex(progress, afterIndex = -1) {
    const completed = new Set(progress.results.map(result => result.id));
    for (let offset = 1; offset <= BK_DATA.length; offset += 1) {
      const index = (afterIndex + offset) % BK_DATA.length;
      if (!completed.has(BK_DATA[index].id)) return index;
    }
    return -1;
  }

  function openBreinkrakers() {
    closeMenu();
    showScreen('breinkrakers');
    document.getElementById('breinkrakersScreen').classList.add('active');
    renderBreinkrakersStart();
  }

  function closeBreinkrakers() {
    document.getElementById('breinkrakersScreen').classList.remove('active');
    showScreen('home');
  }

  function renderBreinkrakersStart() {
    const screen = document.getElementById('breinkrakersScreen');
    screen.classList.remove('is-playing');
    screen.scrollTop = 0;
    document.getElementById('bkStart').style.display = 'block';
    document.getElementById('bkPlay').style.display = 'none';
    document.getElementById('bkDone').style.display = 'none';
    const progress = bkNormaliseProgress(bkLoadProgress());
    const resultMap = bkResultMap(progress);
    const played = BK_DATA.filter(puzzle => resultMap.has(puzzle.id)).length;
    const results = BK_DATA.map(puzzle => resultMap.get(puzzle.id)).filter(Boolean);
    const exactCount = results.filter(result => result.exact).length;
    const avg = results.length ? results.reduce((sum, result) => sum + result.factor, 0) / results.length : null;
    document.getElementById('bkPlayedCount').textContent = `${played}/${BK_DATA.length}`;
    document.getElementById('bkExactCount').textContent = exactCount;
    document.getElementById('bkAverageScore').textContent = avg === null ? '—' : `${avg.toFixed(2)}×`;
    document.getElementById('bkAverageScore').style.color = avg === null ? '' : scoreColor(avg);
    document.getElementById('bkProgress').textContent = BK_DATA.length
      ? `${BK_DATA.length} puzzels · kies waar je verdergaat`
      : 'Geen breinkrakers gevonden — draai maak_breinkrakers.py om ze te genereren.';
    document.getElementById('bkCardGrid').innerHTML = BK_DATA.map((puzzle, index) => {
      const result = resultMap.get(puzzle.id);
      const color = result ? scoreColor(result.factor) : '';
      const label = result ? `Score ${result.factor.toFixed(2)}×` : 'Open puzzel →';
      return `<article class="library-flip-card is-open" role="button" tabindex="0" aria-label="Open Breinkraker ${index + 1}" onclick="startBreinkrakers(${index})" onkeydown="if(event.key==='Enter'||event.key===' ') { event.preventDefault(); startBreinkrakers(${index}); }"><div class="library-flip-card-inner"><div class="library-flip-front ${result ? 'played' : ''}" style="${result ? `background:${color};` : ''}"><strong>#${index + 1}</strong><span>${label}</span></div></div></article>`;
    }).join('');
  }

  function startBreinkrakers(selectedIndex) {
    if (!BK_DATA.length) { showNoticeToast('Er zijn nog geen breinkrakers beschikbaar. Draai maak_breinkrakers.py.'); return; }
    const progress = bkNormaliseProgress(bkLoadProgress());
    const requestedIndex = Number.isInteger(selectedIndex) ? selectedIndex : bkFindNextIncompleteIndex(progress);
    progress.index = Math.max(0, Math.min(requestedIndex, BK_DATA.length - 1));
    bkState = progress;
    bkSubmitted = false;
    showBreinkrakersPuzzle(bkState.index);
  }

  function showBreinkrakersPuzzle(index) {
    const p = BK_DATA[index];
    if (!p) { renderBreinkrakersDone(); return; }
    bkActivePuzzle = p;
    bkSubmitted = false;
    const screen = document.getElementById('breinkrakersScreen');
    screen.scrollTop = 0;
    [0, 1, 2, 3].forEach(i => autoCalculatedInputs.delete(`bkAnswer${i}`));
    document.getElementById('breinkrakersScreen').classList.add('is-playing');
    document.getElementById('bkStart').style.display = 'none';
    document.getElementById('bkDone').style.display = 'none';
    document.getElementById('bkPlay').style.display = 'block';
    document.getElementById('bkPuzzleLabel').textContent = `Puzzel ${index + 1}`;
    document.getElementById('bkCounter').textContent = `${index + 1} / ${BK_DATA.length}`;
    const note = localStorage.getItem('netto_auto_calc_note_seen') === 'true' ? '' : `<div class="auto-calc-note" role="status" aria-live="polite">↳ Antwoorden worden automatisch berekend als de berekening klopt.</div>`;
    document.getElementById('bkQuestionList').innerHTML = [p.q1, p.q2, p.q3, p.q4].map((q, i) => `
      <div class="q-block"><div class="q-label">${q.label || 'Vraag niet beschikbaar'}</div><div class="input-wrapper"><input type="text" class="library-answer-input daily-style-input" id="bkAnswer${i}" name="netto-brein-${i}" inputmode="numeric" placeholder="Jouw schatting" autocomplete="off" autocorrect="off" spellcheck="false" data-lpignore="true"></div></div>
      ${i < 3 ? `<div class="connector"><div class="connector-line"></div><div class="connector-badge ${i === 2 ? 'eq' : ''}">${[p.op1, p.op2, '='][i]}</div><div class="connector-line"></div></div>` : ''}`).join('') + note;
    werkVraagDetailsBij({
      q1_label: p.q1.label,
      q2_label: p.q2.label,
      q3_label: p.q3.label,
      q4_label: p.q4.label,
    }, [...document.querySelectorAll('#bkQuestionList > .q-block')], false);
    if (note) localStorage.setItem('netto_auto_calc_note_seen', 'true');
    [0, 1, 2, 3].forEach(i => {
      const input = document.getElementById(`bkAnswer${i}`);
      bindWholeNumberInput(input, bkTryAutoFill);
      input.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        if (i < 3) document.getElementById(`bkAnswer${i + 1}`).focus();
        else submitBreinkrakers();
      });
    });
    document.getElementById('bkFeedback').textContent = '';
    const btn = document.getElementById('bkSubmitButton');
    btn.textContent = 'Check mijn score';
    btn.style.display = 'inline-flex';
    btn.disabled = false;
  }

  function bkTryAutoFill() {
    const p = bkActivePuzzle; if (!p || !isAutoCalcEnabled()) return;
    const raws = [0, 1, 2, 3].map(i => document.getElementById(`bkAnswer${i}`).value);
    const vals = raws.map(v => parseFormattedNumber(v));
    const known = vals.map((v, i) => Number.isFinite(v) && v >= 0 && !(autoCalculatedInputs.has(`bkAnswer${i}`)));
    // Verouderde auto-waarden wissen zodra een handmatige ingang verandert:
    // bereken altijd opnieuw vanuit de niet-automatische velden.
    ['bkAnswer0', 'bkAnswer1', 'bkAnswer2', 'bkAnswer3'].forEach(id => {
      if (autoCalculatedInputs.has(id) && document.activeElement?.id !== id) clearAutoInput(id);
    });
    const fresh = [0, 1, 2, 3].map(i => parseFormattedNumber(document.getElementById(`bkAnswer${i}`).value));
    const freshKnown = fresh.map(v => Number.isFinite(v) && v >= 0);
    const h = (freshKnown[0] && freshKnown[1]) ? bkPas(fresh[0], p.op1, fresh[1]) : NaN;
    // d uit a, b, c
    if (Number.isFinite(h) && freshKnown[2] && !freshKnown[3]) {
      const d = bkPas(h, p.op2, fresh[2]);
      if (Number.isFinite(d)) setAutoInput('bkAnswer3', d);
    }
    // c uit a, b, d
    if (Number.isFinite(h) && freshKnown[3] && !freshKnown[2]) {
      const c = bkRechts(p.op2, h, fresh[3]);
      if (Number.isFinite(c) && c >= 0) setAutoInput('bkAnswer2', c);
    }
    // a of b uit de rest (alleen bij exact geheel getal)
    if (freshKnown[1] && freshKnown[2] && freshKnown[3] && !freshKnown[0]) {
      const h2 = bkLinks(p.op2, fresh[2], fresh[3]);
      if (Number.isFinite(h2) && h2 > 0) {
        const a = bkLinks(p.op1, fresh[1], h2);
        if (Number.isFinite(a) && a > 0 && Math.abs(a - Math.round(a)) < 1e-9) setAutoInput('bkAnswer0', Math.round(a));
      }
    }
    if (freshKnown[0] && freshKnown[2] && freshKnown[3] && !freshKnown[1]) {
      const h2 = bkLinks(p.op2, fresh[2], fresh[3]);
      if (Number.isFinite(h2) && h2 > 0) {
        const b = bkRechts(p.op1, fresh[0], h2);
        if (Number.isFinite(b) && b > 0 && Math.abs(b - Math.round(b)) < 1e-9) setAutoInput('bkAnswer1', Math.round(b));
      }
    }
  }

  function submitBreinkrakers() {
    if (bkSubmitted) {
      bkSubmitted = false;
      if (bkState.index >= BK_DATA.length) renderBreinkrakersDone();
      else showBreinkrakersPuzzle(bkState.index);
      return;
    }
    const p = bkActivePuzzle; if (!p || !bkState) return;
    const guesses = [0, 1, 2, 3].map(i => parseFormattedNumber(document.getElementById(`bkAnswer${i}`).value));
    if (guesses.some(v => !Number.isFinite(v) || v < 0)) {
      showNoticeToast('Vul alle vier de vragen in met een getal 0 of hoger.');
      return;
    }
    const answers = [p.q1.answer, p.q2.answer, p.q3.answer, p.q4.answer];
    if (!guesses.every(v => Number.isSafeInteger(v)) || bkPas(bkPas(guesses[0], p.op1, guesses[1]), p.op2, guesses[2]) !== guesses[3]) { showEquationNotice(); return; }
    const exact = guesses.every((g, i) => g === answers[i]);
    if (exact) launchConfetti();
    const vraagFactor = (g, a) => (a === 0 ? (g === 0 ? 1 : 10) : scoreVraag(g, a));
    const factor = answers.reduce((s, a, i) => s + vraagFactor(guesses[i], a), 0) / 4;
    const currentIndex = bkState.index;
    const newResult = { id: p.id, factor, exact };
    const previousResultIndex = bkState.results.findIndex(result => result.id === p.id);
    if (previousResultIndex >= 0) bkState.results[previousResultIndex] = newResult;
    else bkState.results.push(newResult);
    const nextIndex = bkFindNextIncompleteIndex(bkState, currentIndex);
    bkState.index = nextIndex < 0 ? BK_DATA.length : nextIndex;
    bkSaveProgress(bkState);
    const rating = getFactorRating(factor);
    const labels = [p.q1.label, p.q2.label, p.q3.label, p.q4.label];
    document.getElementById('bkQuestionList').innerHTML = answers.map((a, i) => `
      <div class="library-question"><b>Vraag ${i + 1}</b>${labels[i]}<br><strong>${guesses[i] === a ? '✓' : '✗'} Echt: ${fmt(a)} · jouw: ${fmt(guesses[i])} · ${vraagFactor(guesses[i], a).toFixed(2)}×</strong></div>`).join('')
      + `<div class="score-badge-container"><div class="score-badge-title">Jouw gemiddelde afwijking</div><div class="score-badge-val" style="color:${scoreColor(factor)}">${factor.toFixed(2)}×</div><div class="bk-rating">${rating.emoji} ${rating.label}</div></div>`
      + `<div class="bk-formula-reveal">${p.formula}</div>`;
    document.getElementById('bkFeedback').textContent = '';
    const btn = document.getElementById('bkSubmitButton');
    btn.textContent = bkState.index >= BK_DATA.length ? 'Bekijk eindresultaat 🎉' : 'Volgende puzzel →';
    bkSubmitted = true;
  }

  function renderBreinkrakersDone() {
    document.getElementById('breinkrakersScreen').classList.remove('is-playing');
    document.getElementById('bkPlay').style.display = 'none';
    document.getElementById('bkStart').style.display = 'none';
    document.getElementById('bkDone').style.display = 'block';
    const results = bkState ? bkState.results : [];
    const avg = results.length ? results.reduce((s, r) => s + r.factor, 0) / results.length : 0;
    const exactCount = results.filter(r => r.exact).length;
    document.getElementById('bkDoneScore').textContent = results.length ? avg.toFixed(2) + '×' : '—';
    document.getElementById('bkDoneMeta').textContent = results.length
      ? `${results.length} puzzels gespeeld · ${exactCount}× volledig exact · gemiddelde afwijking ${avg.toFixed(2)}×`
      : 'Nog geen puzzels gespeeld.';
    bkActivePuzzle = null;
    bkSubmitted = false;
  }
