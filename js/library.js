// Netto frontend module.
// Loaded as a classic script so the existing shared global scope stays intact.

function renderLibraryStats() {
    const plays = getLocalPlays();
    if (libraryMode === 'daily') {
      const dailyDone = Object.keys(plays).length;
      document.getElementById('libraryStats').innerHTML = `<div class="library-stat"><b>${dailyDone}</b><span>Daily gespeeld</span></div><div class="library-stat"><b>${DAILY_PUZZLES.length}</b><span>Dagpuzzels</span></div>`;
      document.getElementById('libraryStats').style.gridTemplateColumns = 'repeat(2,1fr)';
    } else {
      const plays = getSavedLibraryPlays();
      const currentSet = getLibrarySet(selectedDifficulty);
      const done = currentSet.filter(p => plays[p.id] || plays[`library_${p.id}`]).length;
      document.getElementById('libraryStats').innerHTML = `<div class="library-stat"><b>${done}</b><span>${LIBRARY_DIFFICULTY_LABEL[selectedDifficulty]} gespeeld</span></div><div class="library-stat"><b>${libraryPuzzles.length}</b><span>Puzzels</span></div>`;
      document.getElementById('libraryStats').style.gridTemplateColumns = 'repeat(2,1fr)';
    }
  }

  function getLibrarySet(level) { return libraryPuzzles.filter(p => p.difficulty === level); }
  function selectLibraryDifficulty(level, button) {
    selectedDifficulty = level;
    document.querySelectorAll('#libraryDifficulties button').forEach(b => b.classList.remove('active'));
    if (button) button.classList.add('active');
    renderLibraryCards();
  }
  function libraryPlayFor(p) { try { return JSON.parse(localStorage.getItem('netto_library_plays') || '{}')[p.id]; } catch (_) { return null; } }
  function renderLibraryCards() {
    const grid = document.getElementById('libraryCardGrid');
    const source = getLibrarySet(selectedDifficulty);
    grid.innerHTML = source.map((p, i) => {
      const number = libraryPuzzleNumber(selectedDifficulty, i);
      const play = libraryPlayFor(p);
      const color = play ? scoreColor(play.factor) : '';
      const frontStyle = play ? `--score-accent:${color};` : '';
      const label = play ? `Score ${play.factor.toFixed(2)}×` : 'Open puzzle →';
      return `<article class="library-flip-card is-open" role="button" tabindex="0" aria-label="Open puzzel ${number}" onclick="playLibraryCard('${p.id}')" onkeydown="if(event.key==='Enter'||event.key===' ') { event.preventDefault(); playLibraryCard('${p.id}'); }"><div class="library-flip-card-inner"><div class="library-flip-front ${play ? 'played' : ''}" style="${frontStyle}"><strong>#${number}</strong><span>${label}</span></div></div></article>`;
    }).join('');
    renderLibraryStats();
  }
  function playLibraryCard(id) {
    const set = getLibrarySet(selectedDifficulty); const index = set.findIndex(p => p.id === id);
    if (index < 0) return; libraryIndex = index; document.getElementById('libraryCardGrid').style.display = 'none'; document.getElementById('libraryDifficulties').style.display = 'none'; document.getElementById('libraryPuzzleView').style.display = 'block'; renderLibraryPuzzle();
  }

  function showLibraryAnswers(index) {
    const p = libraryPuzzles[index]; if (!p) return;
    showNoticeToast(`${p.q1_label} — ${fmt(p.q1_answer)} · ${p.q2_label} — ${fmt(p.q2_answer)} · ${p.q3_label} — ${fmt(p.q3_answer)}`, '📝', statsCopy('Antwoorden', 'Answers'));
  }

  function renderDailyArchive() {
    const list = document.getElementById('dailyPuzzleList');
    const plays = getLocalPlays(); list.innerHTML = '';
    const selectedMonth = archiveMonth.month;
    const selectedYear = archiveMonth.year;
    const monthDays = new Date(selectedYear, selectedMonth, 0).getDate();
    const monthNav = document.getElementById('activeArchiveMonth');
    if (monthNav) monthNav.textContent = monthLabel(selectedMonth);
    const monthKey = `${selectedYear}-${String(selectedMonth).padStart(2,'0')}`;
    const bounds = getArchiveBounds();
    const nextButton = document.getElementById('nextMonthBtn');
    if (nextButton) nextButton.disabled = monthKey >= bounds.last;
    const previousButton = document.getElementById('previousMonthBtn');
    if (previousButton) previousButton.disabled = monthKey <= bounds.first;
    const monthPuzzles = DAILY_PUZZLES.filter(p => {
      const date = p.date || `${selectedYear}-${String(selectedMonth).padStart(2,'0')}-${String(DAILY_PUZZLES.indexOf(p) + 1).padStart(2,'0')}`;
      return date.startsWith(monthKey) && date <= TODAY_STR;
    }).sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')));
    monthPuzzles.forEach((p, idx) => {
      const puzzleDate = p.date ? new Date(`${p.date}T00:00:00`) : new Date(selectedYear, selectedMonth - 1, Math.min(idx + 1, monthDays));
      const play = plays[p.date || `puzzle_${p.number || idx + 1}`];
      const row = document.createElement('div'); row.className = 'daily-archive-row';
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      row.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); row.click(); } };
      const dateLabel = new Intl.DateTimeFormat(nettoNumberLocale(), { day:'numeric', month:'long' }).format(puzzleDate);
      row.innerHTML = `<span class="archive-number">${String(p.number || idx + 1).padStart(3,'0')}</span><div><div class="archive-name">${p.name || `Daily Puzzle #${p.number || idx + 1}`}</div><div class="archive-date">${dateLabel}</div></div><span class="archive-score" style="color:${play ? scoreColor(play.factor) : '#92959D'}">${play ? play.factor.toFixed(2)+'×' : '—'}</span><span class="archive-status ${play ? 'complete' : ''}">${play ? 'COMPLETE ✓' : 'PLAY →'}</span>`;
      row.onclick = () => { dailyArchivePuzzleView = true; activePuzzleIndex = DAILY_PUZZLES.indexOf(p); PUZZLE_DATA = p; loadActivePuzzle(); closeLibraryScreen(); showScreen('puzzle'); };
      list.appendChild(row);
    });
  }

  // Dynamische scorekleur: vloeiende gradient groen (1.00) -> geel (~1.5) -> rood (2.0+).
  function scoreColor(factor) {
    const f = Math.max(1, Number(factor) || 1);
    const H_GREEN = 145, H_YELLOW = 48, H_RED = 0;
    let h;
    if (f <= 1) h = H_GREEN;
    else if (f <= 1.5) h = H_GREEN + (H_YELLOW - H_GREEN) * ((f - 1) / 0.5);
    else if (f <= 2) h = H_YELLOW + (H_RED - H_YELLOW) * ((f - 1.5) / 0.5);
    else h = H_RED;
    return `hsl(${Math.round(h)}, 74%, 45%)`;
  }

  function getPuzzleDifficulty(p) {
    const max = Math.max(Number(p.a1), Number(p.a2), Number(p.a3));
    if (max <= 100 && ['+','−'].includes(p.operator)) return 'easy';
    if (max <= 1000 && ['+','−','×'].includes(p.operator)) return 'intermediate';
    if (max <= 100000) return 'hard';
    return 'extremely-hard';
  }

  function loadLibraryFromSupabase() {
    // De lokaal ingebedde, nieuw gegenereerde set is de volledige bron.
    // Geen merge met de oude Supabase-tabel: zo komen oude puzzels niet terug.
    const localPuzzles = [...(REBUILT_DATA.library || []), ...(REBUILT_DATA.reserve || [])].map((p, i) => ({ ...normalizeLibraryPuzzle(p), id: p.id || `local-${i + 1}`, difficulty: p.difficulty || getPuzzleDifficulty(p) }));
    const uniquePuzzles = new Map(localPuzzles.map(p => [p.id, p]));
    libraryPuzzles = [...uniquePuzzles.values()];
    renderLibraryCards();
    renderDifficultyCounts(Object.fromEntries(['easy','intermediate','hard','extremely-hard'].map(d => [d, libraryPuzzles.filter(p => p.difficulty === d).length])));
  }

  function renderDifficultyCounts(counts) {
    document.querySelectorAll('#libraryDifficulties button').forEach(button => { const match = button.getAttribute('onclick').match(/'([^']+)'/); if (match) button.querySelector('span').textContent = `${counts[match[1]] || 0} puzzels`; });
  }

  function selectDifficulty(level) {
    selectedDifficulty = level;
    libraryIndex = 0;
    const set = libraryPuzzles.filter(p => p.difficulty === level);
    if (!set.length) {
      showNoticeToast(statsCopy('Deze difficulty bevat nog geen geladen puzzels.', 'There are no loaded puzzles at this difficulty yet.'), '🧩', statsCopy('Geen puzzels', 'No puzzles'));
      return;
    }
    document.getElementById('libraryDifficulties').style.display = 'none'; document.getElementById('dailyPuzzleList').style.display = 'none'; document.getElementById('libraryCardGrid').style.display = 'none'; document.getElementById('libraryPuzzleView').style.display = 'block'; renderLibraryPuzzle();
  }

  // Wat te doen als er geen puzzel te tonen is.
  //
  // Hier stond alleen "if (!p) return;". De aanroeper had het scherm dan al op
  // zichtbaar gezet, dus je kreeg de vorige puzzel te zien alsof er niets was
  // gebeurd — of een leeg vlak. Beide liegen: de een toont een puzzel die je
  // niet hebt gekozen, de ander zegt niets.
  //
  // Dit gebeurt niet bij gewoon doorklikken (libraryMove klemt de index), maar
  // wel als de lijst leeg is of als een index blijft staan nadat de puzzelset
  // is vernieuwd vanuit de databank.
  function toonGeenPuzzel(prefix, melding) {
    const lijst = document.getElementById(prefix + 'QuestionList');
    const som = document.getElementById(prefix + 'Equation');
    const voortgang = document.getElementById(prefix + 'Progress');
    const klok = document.getElementById(prefix + 'Timer');
    if (som) som.textContent = '';
    if (voortgang) voortgang.innerHTML = '';
    if (klok) klok.textContent = '';
    if (!lijst) return;
    lijst.innerHTML = '';
    const blok = document.createElement('div');
    blok.className = 'geen-puzzel';
    blok.textContent = melding;
    lijst.appendChild(blok);
  }

  function renderLibraryPuzzle() {
    // Begin bij de vraag, ook als de speler ver door de catalogus was gescrold.
    requestAnimationFrame(() => document.getElementById('libraryPuzzleView').scrollIntoView({ block: 'start' }));
    const p = libraryPuzzles.filter(x => x.difficulty === selectedDifficulty)[libraryIndex];
    if (!p) {
      toonGeenPuzzel('library', statsCopy(
        'Deze puzzel is er niet meer. Ga terug naar het overzicht en kies een andere.',
        'This puzzle is no longer available. Go back to the overview and pick another.'));
      return;
    }
    renderPuzzleView('library', p, `Puzzel ${libraryPuzzleNumber(selectedDifficulty, libraryIndex)}`);
  }

  function renderCatalogusPuzzleView() {
    const p = catalogusPuzzleList[catalogusPuzzleIndex];
    if (!p) {
      toonGeenPuzzel('catalogus', statsCopy(
        'Deze puzzel is er niet meer. Ga terug naar het overzicht en kies een andere.',
        'This puzzle is no longer available. Go back to the overview and pick another.'));
      return;
    }
    catalogusActivePuzzle = p;
    renderPuzzleView('catalogus', p, `Library · ${p.source === 'Daily Archive' ? 'daily' : 'puzzel'} ${catalogusPuzzleIndex + 1}`);
  }

  function submitLibraryPuzzle(auto = false) { submitPuzzleView('library', auto); }
  function submitCatalogusPuzzle(auto = false) { submitPuzzleView('catalogus', auto); }

  function jumpToLibraryPuzzle(index) { libraryIndex = index; renderLibraryPuzzle(); }

  function renderLibraryProgressBlocks() {
    const set = libraryPuzzles.filter(p => p.difficulty === selectedDifficulty).slice(0,25);
    const plays = JSON.parse(localStorage.getItem('netto_library_plays') || '{}');
  }

  function libraryMove(direction) {    const set = libraryPuzzles.filter(p => p.difficulty === selectedDifficulty); const next = Math.max(0, Math.min(set.length - 1, libraryIndex + direction)); libraryIndex = next; renderLibraryPuzzle(); }

  function openArchiveModal() { openDailyPuzzles(); }
  function closeArchiveModal() { closeLibrary(); }

  function renderArchiveList() {
    const list = document.getElementById('archiveList');
    list.innerHTML = '';

    const plays = getLocalPlays();

    PUZZLE_ARCHIVE.forEach((p, idx) => {
      const pKey = `puzzle_${p.number || activePuzzleIndex + 1}`;
      const play = plays[pKey] || (idx === 0 ? plays[TODAY_STR] : null);
      
      const div = document.createElement('div');
      div.className = `lb-row ${idx === activePuzzleIndex ? 'me' : ''}`;
      div.style.cursor = 'pointer';
      div.onclick = () => selectPuzzle(idx);

      let statusBadge = `<span style="color:#6B7280; font-size:12px;">Nog niet gespeeld →</span>`;
      if (play) {
        statusBadge = `<span style="color:var(--green); font-weight:700; font-size:12px;">✅ Factor ${play.factor.toFixed(2)}×</span>`;
      }

      div.innerHTML = `
        <div class="lb-left">
          <span class="lb-rank">#${p.number.toString().padStart(2, '0')}</span>
          <div>
            <div class="lb-name">${p.name || `Puzzel #${p.number}`}</div>
            <div style="font-size:11px; color:#4C519C;">${p.operator === '×' ? 'Vermenigvuldiging (×)' : 'Optelling (+)'}</div>
          </div>
        </div>
        ${statusBadge}
      `;
      list.appendChild(div);
    });
  }

  function selectPuzzle(index) {
    dailyArchivePuzzleView = false;
    activePuzzleIndex = index;
    PUZZLE_DATA = DAILY_PUZZLES[index] || PUZZLE_ARCHIVE[index];
    closeArchiveModal();
    loadActivePuzzle();
    showScreen('puzzle');
  }

  function loadActivePuzzle() {
    document.getElementById('q1-label').textContent = PUZZLE_DATA.q1_label;
    document.getElementById('q2-label').textContent = PUZZLE_DATA.q2_label;
    document.getElementById('q3-label').textContent = PUZZLE_DATA.q3_label;
    document.getElementById('operatorBadge').textContent = PUZZLE_DATA.operator || '×';
    document.getElementById('puzzleEyebrow').textContent = `Netto · ${puzzleNr(PUZZLE_DATA.number)}`;

    // Reset velden en uitslag
    ['g1', 'g2', 'g3'].forEach(id => {
      const input = document.getElementById(id);
      input.value = '';
      input.placeholder = 'Jouw antwoord';
      input.dataset.autoCalculated = 'false';
      input.classList.remove('auto-calculated');
      input.disabled = false;
    });
    autoCalculatedInputs.clear();
    resetDailyReviewView();
    document.getElementById('alreadyPlayedBanner').classList.remove('show');
    document.getElementById('btnCheck').style.display = 'block';

    checkExistingPlay();
  }

  function goHome() {
    dailyArchivePuzzleView = false;
    resetDailyReviewView();
    showScreen('home');
    closeMenu();
  }

  // Het leaderboard is een eigen pagina geworden in plaats van een pop-up; het
  // hoort bij "Competitie" in de navigatie en heeft meer ruimte nodig dan een
  // modal biedt. De oude naam blijft bestaan omdat er vanaf meerdere plekken
  // naar verwezen wordt.
  function openLeaderboardModal() {
    closeMenu();
    // Kijken mag zonder account. Codex zette hier een inlogmuur (X-001) omdat
    // het scorebord accountgebonden is, maar dat gaat over MEEDOEN, niet over
    // KIJKEN. De knop op het resultatenscherm liep er ook op stuk: die opende
    // het inlogscherm in plaats van het bord.
    //
    // Meedoen vraagt nog steeds een account — daarvoor staat onderaan de lijst
    // een uitnodiging als je uitgelogd bent. Insturen en duelleren blijven wel
    // achter een login, want die schrijven iets weg onder jouw naam.
    resetLeaderboardDag();
    showScreen('leaderboard');
    renderLeaderboard();
  }

  function closeLeaderboardModal() {
    goHome();
  }

  function openAuthModal() {
    closeMenu();
    if (currentUser) {
      document.getElementById('authLoggedInView').style.display = 'block';
      document.getElementById('authFormView').style.display = 'none';
    } else {
      document.getElementById('authLoggedInView').style.display = 'none';
      document.getElementById('authForgotView').style.display = 'none';
      document.getElementById('authFormView').style.display = 'block';
    }
    clearAuthError();
    document.getElementById('modalAuth').classList.add('active');
  }

  function closeAuthModal() {
    document.getElementById('modalAuth').classList.remove('active');
  }

  function closeModalOnBg(e, modalId) {
    if (e.target.id !== modalId) return;
    if (modalId === 'modalStats') {
      closeStatsModal();
      return;
    }
    document.getElementById(modalId).classList.remove('active');
  }

  // Expliciet binden aan window zodat inline onclick ALTIJD werkt
  window.toggleMenu = toggleMenu;
  window.showForgotPassword = showForgotPassword;
  window.backToAuthForm = backToAuthForm;
  window.handleForgotPassword = handleForgotPassword;
  window.closeMenu = closeMenu;
  window.showScreen = showScreen;
  window.goHome = goHome;
  window.openArchiveModal = openArchiveModal;
  window.closeArchiveModal = closeArchiveModal;
  window.selectPuzzle = selectPuzzle;
  window.openLeaderboardModal = openLeaderboardModal;
  window.closeLeaderboardModal = closeLeaderboardModal;
  window.openAuthModal = openAuthModal;
  window.closeAuthModal = closeAuthModal;
  window.closeModalOnBg = closeModalOnBg;
  window.openStatsModal = openStatsModal;
  window.closeStatsModal = closeStatsModal;
  window.openStatsStreakCalendar = openStatsStreakCalendar;
  window.shareStats = shareStats;
  window.checkAnswers = checkAnswers;
  window.shareScore = shareScore;
  window.toggleAuthMode = toggleAuthMode;
  window.handleAuthSubmit = handleAuthSubmit;
  window.handleLogout = handleLogout;
  window.switchLbTab = switchLbTab;
  window.veranderLeaderboardDag = veranderLeaderboardDag;
  window.changeArchiveMonth = changeArchiveMonth;
  window.showDailyResults = showDailyResults;
  window.showDailyQuestions = showDailyQuestions;
  window.startNextPuzzle = startNextPuzzle;
  window.openDailyPuzzles = openDailyPuzzles;
  window.openPuzzles = openPuzzles;
  window.openCatalogusLibrary = openCatalogusLibrary;
  window.closeCatalogusScreen = closeCatalogusScreen;
  window.setCatalogusView = setCatalogusView;
  window.renderCatalogusPuzzles = renderCatalogusPuzzles;
  window.renderCatalogusVragen = renderCatalogusVragen;
  window.playCatalogusPuzzle = playCatalogusPuzzle;
  window.catalogusPuzzleMove = catalogusPuzzleMove;
  window.submitCatalogusPuzzle = submitCatalogusPuzzle;
  window.toggleVraagCard = toggleVraagCard;
  window.selectDifficulty = selectDifficulty;
  window.selectLibraryDifficulty = selectLibraryDifficulty;
  window.playLibraryCard = playLibraryCard;
  window.jumpToLibraryPuzzle = jumpToLibraryPuzzle;
  window.libraryMove = libraryMove;
  window.submitLibraryPuzzle = submitLibraryPuzzle;
  window.showLibraryAnswers = showLibraryAnswers;
  window.changeArchiveMonth = changeArchiveMonth;
  window.openPuzzleRace = openPuzzleRace;
  window.closePuzzleRace = closePuzzleRace;
  window.startPuzzleRace = startPuzzleRace;
  window.submitPuzzleRace = submitPuzzleRace;
  window.createRaceRoom = createRaceRoom;
  window.joinRaceRoom = joinRaceRoom;
  window.leaveRaceRoom = leaveRaceRoom;
  window.copyRaceRoomCode = copyRaceRoomCode;
  window.startDuelRace = startDuelRace;
  window.openBreinkrakers = openBreinkrakers;
  window.closeBreinkrakers = closeBreinkrakers;
  window.startBreinkrakers = startBreinkrakers;
  window.submitBreinkrakers = submitBreinkrakers;
  window.openConnection = openConnection;
  window.openSettings = openSettings;
  window.openHowItWorks = openHowItWorks;
  window.closeSettings = closeSettings;
  window.switchRaceMode = switchRaceMode;
  window.selectRaceDuration = selectRaceDuration;
  window.selectOnlineVisibility = selectOnlineVisibility;
  window.toggleOnlineVisibility = toggleOnlineVisibility;
  window.createOpenRaceGame = createOpenRaceGame;
  window.createClosedRaceGame = createClosedRaceGame;
  window.refreshOpenGames = refreshOpenGames;
  window.joinOpenRaceGame = joinOpenRaceGame;
  window.selectRaceTolerantie = selectRaceTolerantie;
  window.toggleAutoCalc = toggleAutoCalc;
  window.toggleEquationRequirement = toggleEquationRequirement;
  window.toggleLeaderboardZichtbaar = toggleLeaderboardZichtbaar;
  window.toggleTheme = toggleTheme;
  window.applyTheme = applyTheme;
