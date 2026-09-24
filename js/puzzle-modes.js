// Netto frontend module.
// Loaded as a classic script so the existing shared global scope stays intact.

  // ===== Generieke puzzle-view (werkt voor 'library' én 'catalogus' prefix) =====
  function werkPuzzelNavigatieBij(prefix, ingeleverd) {
    const navigatie = document.querySelector('#' + prefix + 'PuzzleView .library-actions');
    if (!navigatie) return;
    const bibliotheek = prefix === 'library';
    const reeks = bibliotheek ? libraryPuzzles.filter(p => p.difficulty === selectedDifficulty) : catalogusPuzzleList;
    const index = bibliotheek ? libraryIndex : catalogusPuzzleIndex;
    const verplaats = stap => bibliotheek ? libraryMove(stap) : catalogusPuzzleMove(stap);
    const laatste = index >= reeks.length - 1;
    const hoofdactie = document.createElement('button');
    hoofdactie.type = 'button';
    hoofdactie.className = 'puzzel-hoofdactie' + (ingeleverd ? ' puzzel-verder' : '');
    hoofdactie.textContent = ingeleverd
      ? laatste ? statsCopy('Afronden →', 'Finish →') : statsCopy('Volgende puzzel →', 'Next puzzle →')
      : statsCopy('Controleer mijn score', 'Check my score');
    hoofdactie.onclick = ingeleverd
      ? laatste ? () => bibliotheek ? openPuzzles() : openCatalogusLibrary() : () => verplaats(1)
      : () => submitPuzzleView(prefix);
    navigatie.replaceChildren(hoofdactie);
    if (!ingeleverd) {
      const overslaan = document.createElement('button');
      overslaan.type = 'button';
      overslaan.textContent = statsCopy('Overslaan →', 'Skip puzzle →');
      // Overslaan navigeert alleen: het levert geen antwoord of score in.
      overslaan.onclick = laatste ? () => bibliotheek ? openPuzzles() : openCatalogusLibrary() : () => verplaats(1);
      navigatie.append(overslaan);
    }
  }

  function renderPuzzleView(prefix, p, progressLabel, moveAction) {
    const listEl = document.getElementById(prefix + 'QuestionList');
    if (!listEl || !p) return;
    document.getElementById(prefix + 'Progress').textContent = progressLabel;
    document.getElementById(prefix + 'Equation').style.display = 'none';
    const autoCalcNote = localStorage.getItem('netto_auto_calc_note_seen') === 'true' ? '' : `<div class="auto-calc-note" role="status" aria-live="polite">↳ Antwoorden worden automatisch berekend als de berekening klopt.</div>`;
    listEl.innerHTML = [[p.q1_label,p.q1_answer],[p.q2_label,p.q2_answer],[p.q3_label,p.q3_answer]].map((q,i) => `<div class="q-block"><div class="q-label">${q[0] || 'Vraag niet beschikbaar'}</div><div class="input-wrapper"><input type="text" class="library-answer-input daily-style-input" id="${prefix}Answer${i}" name="netto-schatting-${i}" inputmode="numeric" placeholder="Jouw schatting" autocomplete="off" autocorrect="off" spellcheck="false" data-lpignore="true"></div></div>${i < 2 ? `<div class="connector"><div class="connector-line"></div><div class="connector-badge ${i === 1 ? 'eq' : ''}">${i === 0 ? (p.operator || '×') : '='}</div><div class="connector-line"></div></div>` : ''}`).join('') + autoCalcNote;
    if (autoCalcNote) localStorage.setItem('netto_auto_calc_note_seen', 'true');
    if (prefix === 'library') libraryActivePuzzle = p; else catalogusActivePuzzle = p;
    renderPuzzelfoto(listEl, p);
    bindDerivedInputs(prefix, p.operator || '×');
    werkPuzzelNavigatieBij(prefix, false);
  }

  function submitPuzzleView(prefix, auto = false) {
    const active = prefix === 'library' ? libraryActivePuzzle : catalogusActivePuzzle;
    if (!active) return;
    const inputs = [0,1,2].map(i => document.getElementById(`${prefix}Answer${i}`));
    if (inputs.some(input => !input)) return;
    const guesses = inputs.map(input => parseFormattedNumber(input.value));
    if (!validWholeAnswers(guesses)) {
      showNoticeToast(
        statsCopy('Vul alle drie de vragen in met een heel getal groter dan 0.', 'Enter a whole number greater than 0 for all three questions.'),
        '✏️', statsCopy('Antwoorden ontbreken', 'Complete your answers'));
      return;
    }
    if (isEquationRequired() && !validWholeEquation(guesses, active.operator || '×')) { showEquationNotice(); return; }
    const answers = [active.q1_answer,active.q2_answer,active.q3_answer];
    const factor = answers.reduce((sum,a,i) => sum + scoreVraag(guesses[i],a),0) / 3;
    if (guesses.every((guess, i) => isSpotOnAnswer(guess, answers[i]))) launchConfetti();
    const plays = JSON.parse(localStorage.getItem('netto_library_plays') || '{}'); plays[active.id] = { factor, guesses, completedAt:new Date().toISOString() }; localStorage.setItem('netto_library_plays',JSON.stringify(plays));
    updateContinuePuzzleButton();
    renderPuzzleReview(prefix, active, guesses, answers, factor);
    werkPuzzelNavigatieBij(prefix, true);
    syncLibraryPlay(active, guesses[0], guesses[1], guesses[2], factor);
    if (prefix === 'library') renderLibraryCards(); else renderCatalogusPuzzles();
  }

  function renderPuzzleReview(prefix, puzzle, guesses, answers, factor) {
    const list = document.getElementById(prefix + 'QuestionList');
    list.replaceChildren();
    const summary = document.createElement('section');
    summary.className = 'puzzle-review-summary';
    summary.setAttribute('aria-label', statsCopy('Puzzelresultaat', 'Puzzle result'));
    const label = document.createElement('span');
    label.textContent = statsCopy('Nauwkeurigheid', 'Accuracy');
    const score = document.createElement('strong');
    score.textContent = Math.round(100 / factor) + '%';
    const detail = document.createElement('span');
    detail.textContent = statsCopy('Gemiddelde afwijking: ', 'Average deviation: ') + factor.toFixed(2) + '×';
    summary.append(label, score, detail);
    list.appendChild(summary);
    answers.forEach((answer, index) => {
      const card = document.createElement('article');
      card.className = 'library-question puzzle-review-question';
      const header = document.createElement('div');
      header.className = 'puzzle-review-heading';
      const number = document.createElement('span');
      number.textContent = statsCopy('Vraag ', 'Question ') + (index + 1);
      const verdict = document.createElement('span');
      const exact = isSpotOnAnswer(guesses[index], answer);
      verdict.className = 'puzzle-review-verdict' + (exact ? ' is-exact' : '');
      verdict.textContent = exact ? statsCopy('✓ Exact goed', '✓ Exactly right')
        : scoreVraag(guesses[index], answer).toFixed(2) + '× ' + (guesses[index] < answer
          ? statsCopy('te laag', 'too low') : statsCopy('te hoog', 'too high'));
      header.append(number, verdict);
      const question = document.createElement('h3');
      const original = puzzle['q' + (index + 1) + '_label'];
      question.textContent = window.NettoI18n?.t(original) || original;
      const comparison = document.createElement('dl');
      comparison.className = 'puzzle-review-comparison';
      [
        [statsCopy('Jouw schatting', 'Your estimate'), guesses[index]],
        [statsCopy('Juiste antwoord', 'Actual answer'), answer]
      ].forEach(([caption, value]) => {
        const column = document.createElement('div');
        const term = document.createElement('dt');
        term.textContent = caption;
        const valueElement = document.createElement('dd');
        valueElement.textContent = fmt(value);
        column.append(term, valueElement);
        comparison.appendChild(column);
      });
      card.append(header, question, comparison);
      list.appendChild(card);
    });
    werkVraagDetailsBij(puzzle, [...list.querySelectorAll('.puzzle-review-question')], true);
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
  function closeLibraryScreen() { document.getElementById('libraryScreen').classList.remove('active'); showScreen('home'); }
  function closeLibrary() { closeLibraryScreen(); }

  // ===== BREINKRAKERS — 4 vragen in één formule: A op1 B op2 C = D, van links naar rechts =====
  // Find the Connection staat in find-connection.js; oude vier-vragenvoortgang blijft bewaard.
