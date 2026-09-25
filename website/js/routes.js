// Eén route per spelscherm; de gepubliceerde routepagina's laden dezelfde app.
(function () {
  const scriptUrl = document.currentScript?.src;
  const base = new URL('../', scriptUrl || location.href);
  let restoring = false;
  let pending = false;
  let pendingDailyDate = null;

  function shortDate(date) { return date.slice(2); }

  function fullDate(slug) {
    if (/^\d{2}-\d{2}-\d{2}$/.test(slug)) return '20' + slug;
    if (/^\d{4}-\d{2}-\d{2}$/.test(slug)) return slug;
    return null;
  }

  function validDate(date) {
    if (!date) return false;
    const parsed = new Date(date + 'T12:00:00Z');
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  }

  function pathname() {
    const prefix = base.pathname;
    const path = location.pathname.startsWith(prefix)
      ? location.pathname.slice(prefix.length) : '';
    return path.replace(/^\/+|\/+$/g, '').replace(/\/index\.html$/, '') || '';
  }

  function currentRoute() {
    const active = id => document.getElementById(id)?.classList.contains('active');
    const visible = id => document.getElementById(id)?.getClientRects().length > 0;
    if (active('fotoCreditsScreen')) return 'photo-credits';
    if (active('routeStatusScreen')) return document.getElementById('routeStatusScreen').dataset.route || '';
    if (active('screen-home')) return '';
    if (active('screen-puzzle')) return PUZZLE_DATA?.date
      ? 'daily/' + shortDate(PUZZLE_DATA.date) : 'daily';
    if (active('libraryScreen')) {
      if (visible('aboutPanel')) return 'about';
      if (visible('howPanel')) return 'how-to-play';
      if (libraryMode === 'daily') return 'daily-archive';
      if (visible('libraryPuzzleView') && libraryActivePuzzle?.number)
        return 'puzzles/' + libraryActivePuzzle.number;
      return 'puzzles';
    }
    if (active('breinkrakersScreen')) {
      if (visible('bkPlay') && connectionState?.puzzle?.number)
        return 'connections/' + connectionState.puzzle.number;
      return 'connections';
    }
    if (active('raceScreen')) return visible('raceStart') &&
      document.getElementById('raceModeOnlineTab')?.getAttribute('aria-selected') === 'true'
      ? 'race/online' : 'race';
    if (active('leaderboardScreen')) return 'leaderboard';
    if (active('settingsScreen')) return 'settings';
    if (active('submitScreen')) return 'submit-question';
    return '';
  }

  function schedule() {
    if (restoring || pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      if (restoring) return;
      const route = currentRoute();
      if (pendingDailyDate && route !== 'daily/' + shortDate(pendingDailyDate)) pendingDailyDate = null;
      if (route === pathname()) return;
      history.pushState(null, '', new URL(route ? route + '/' : '', base));
    });
  }

  function showDailyStatus(date, loading) {
    const future = date > TODAY_STR;
    const copy = statsCopy;
    const screen = document.getElementById('routeStatusScreen');
    screen.dataset.route = 'daily/' + shortDate(date);
    document.getElementById('routeStatusEyebrow').textContent = `Daily · ${shortDate(date)}`;
    document.getElementById('routeStatusTitle').textContent = loading
      ? copy('Dagpuzzel laden…', 'Loading the Daily…')
      : copy('Deze Daily is nog niet beschikbaar', 'This Daily is not available yet');
    document.getElementById('routeStatusMessage').textContent = loading
      ? copy('We controleren of de puzzel al is vrijgegeven.', 'Checking whether this puzzle has been released.')
      : future
        ? copy('Een nieuwe Daily verschijnt om 12:00 uur Londense tijd. Kom dan terug.', 'A new Daily appears at 12:00 London time. Come back then.')
        : copy('Voor deze datum staat nog geen puzzel klaar. Probeer het later opnieuw.', 'There is no puzzle ready for this date yet. Please try again later.');
    document.getElementById('routeStatusArchive').textContent = copy('Daily-archief', 'Daily Archive');
    document.getElementById('routeStatusHome').textContent = copy('Naar home', 'Go home');
    showScreen('route-status');
  }

  function showDaily(date = TODAY_STR, force = false) {
    if (!validDate(date)) return false;
    if (date > TODAY_STR) {
      pendingDailyDate = null;
      showDailyStatus(date, false);
      return true;
    }
    const puzzle = DAILY_PUZZLES.find(item => item.date === date);
    if (!force && !dailySyncAfgerond && (!puzzle || date === TODAY_STR)) {
      pendingDailyDate = date;
      showDailyStatus(date, true);
      setTimeout(() => {
        if (pendingDailyDate === date && !dailySyncAfgerond) showDaily(date, true);
      }, 10000);
      return true;
    }
    if (!puzzle) {
      if (dailySyncAfgerond) pendingDailyDate = null;
      showDailyStatus(date, false);
      return true;
    }
    pendingDailyDate = null;
    dailyArchivePuzzleView = date !== TODAY_STR;
    activePuzzleIndex = DAILY_PUZZLES.indexOf(puzzle);
    PUZZLE_DATA = puzzle;
    loadActivePuzzle();
    showScreen('puzzle');
    return true;
  }

  function openToday() {
    const route = 'daily/' + shortDate(TODAY_STR);
    if (pathname() !== route) history.pushState(null, '', new URL(route + '/', base));
    showDaily(TODAY_STR);
  }

  function showRoute(route) {
    if (!route) { goHome(); return true; }
    if (route === 'daily') {
      history.replaceState(null, '', new URL('daily/' + shortDate(TODAY_STR) + '/', base));
      return showDaily(TODAY_STR);
    }
    if (route === 'daily-archive') { openDailyPuzzles(); return true; }
    if (route === 'puzzles') { openPuzzles(); return true; }
    if (route.startsWith('puzzles/')) {
      const number = Number(route.slice(8));
      const puzzle = libraryPuzzles.find(item => item.number === number);
      if (!puzzle) return false;
      selectedDifficulty = puzzle.difficulty;
      openPuzzles();
      playLibraryCard(puzzle.id);
      return true;
    }
    if (route === 'connections') { openConnection(); return true; }
    if (route.startsWith('connections/')) {
      const number = Number(route.slice(12));
      openConnection();
      const index = connectionPool.findIndex(item => item.number === number);
      if (index < 0) return false;
      startConnection(index);
      return true;
    }
    if (route.startsWith('daily/')) {
      const date = fullDate(route.slice(6));
      if (!validDate(date)) return false;
      if (route.slice(6) !== shortDate(date))
        history.replaceState(null, '', new URL('daily/' + shortDate(date) + '/', base));
      return showDaily(date);
    }
    if (route === 'race' || route === 'race/online') {
      openPuzzleRace();
      if (route === 'race/online') switchRaceMode('online');
      return true;
    }
    const screens = {
      leaderboard: openLeaderboardModal,
      settings: openSettings,
      'how-to-play': openHowItWorks,
      'submit-question': openSubmitQuestion,
      about: openAbout,
      'photo-credits': openFotoverantwoording
    };
    if (!screens[route]) return false;
    screens[route]();
    return true;
  }

  function restore() {
    restoring = true;
    pendingDailyDate = null;
    const route = pathname();
    if (!showRoute(route)) {
      goHome();
      history.replaceState(null, '', base);
      showNoticeToast(statsCopy('Deze pagina bestaat niet meer.', 'This page is no longer available.'), '↩', 'Netto');
    }
    setTimeout(() => { restoring = false; }, 0);
  }

  function dailyReady() {
    if (!pendingDailyDate) return;
    const date = pendingDailyDate;
    pendingDailyDate = null;
    restoring = true;
    showDaily(date, true);
    setTimeout(() => { restoring = false; }, 0);
  }

  function dayChanged() {
    const date = fullDate(pathname().slice(6));
    if (pathname().startsWith('daily/') && date === TODAY_STR
        && document.getElementById('routeStatusScreen')?.classList.contains('active')) {
      showDaily(date);
    }
  }

  function start() {
    const aliases = {
      daily: 'daily', archive: 'daily-archive', leaderboard: 'leaderboard',
      puzzles: 'puzzles', brain: 'connections', connection: 'connections',
      race: 'race', how: 'how-to-play', submit: 'submit-question', about: 'about'
    };
    const legacy = new URLSearchParams(location.search).get('screen');
    if (legacy && aliases[legacy]) {
      const url = new URL(location.href);
      url.pathname = new URL(aliases[legacy] + '/', base).pathname;
      url.searchParams.delete('screen');
      history.replaceState(null, '', url);
    }
    if (pathname() === 'index.html') {
      const url = new URL(location.href);
      url.pathname = base.pathname;
      history.replaceState(null, '', url);
    }
    const watched = [
      'screen-home', 'screen-puzzle', 'routeStatusScreen', 'libraryScreen', 'libraryPuzzleView',
      'libraryProgress', 'aboutPanel', 'howPanel', 'breinkrakersScreen',
      'bkPlay', 'bkCounter', 'raceScreen', 'raceStart', 'raceModeOnlineTab',
      'leaderboardScreen', 'settingsScreen', 'submitScreen', 'fotoCreditsScreen'
    ];
    const observer = new MutationObserver(schedule);
    watched.forEach(id => {
      const element = document.getElementById(id);
      if (element) observer.observe(element, {
        attributes: true, attributeFilter: ['class', 'style', 'aria-selected'],
        childList: id === 'libraryProgress' || id === 'bkCounter',
        subtree: id === 'libraryProgress' || id === 'bkCounter'
      });
    });
    window.addEventListener('popstate', restore);
    restore();
  }

  window.NettoRoutes = { base, start, schedule, dailyReady, dayChanged, openToday };
  window.openNavigationDestination = start;
})();
