// De losse statistiekenpagina gebruikt dezelfde navigatie als het spel.
(function () {
  const homeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>';
  const standalone = document.body.hasAttribute('data-full-stats');
  const english = localStorage.getItem('netto_language') !== 'nl';
  const copy = (nl, en) => english ? en : nl;
  if (!standalone) {
    const menu = document.getElementById('hamburgerBtn');
    if (menu) {
      const group = document.createElement('div');
      group.className = 'topbar-navigation';
      menu.before(group);
      group.append(menu);
      const home = document.createElement('button');
      home.type = 'button'; home.className = 'topbar-home';
      home.title = home.ariaLabel = copy('Naar home', 'Go home');
      home.innerHTML = homeIcon;
      // De pijl gaat één niveau terug, niet door de browsergeschiedenis.
      const visible = id => Boolean(document.getElementById(id)?.getClientRects().length);
      function destination() {
        if (visible('liveRoom') || visible('livePlay') || visible('liveReveal') || visible('liveFinished')) return { label: copy('Terug naar Live Rondes', 'Back to Live Rounds'), open: () => { window.NettoLive.leave(); openLiveRounds(); } };
        if (visible('libraryPuzzleView')) return { label: copy('Terug naar alle puzzels', 'Back to all puzzles'), open: () => openPuzzles() };
        if (visible('bkPlay') || visible('bkDone')) return { label: copy('Terug naar alle verbanden', 'Back to all connections'), open: () => renderBreinkrakersStart() };
        return { label: copy('Naar home', 'Go home'), open: () => goHome() };
      }
      function updateBackLabel() {
        const label = destination().label;
        if (home.title !== label) home.title = home.ariaLabel = label;
      }
      home.addEventListener('click', () => { closeMenu(); destination().open(); updateBackLabel(); });
      const observer = new MutationObserver(updateBackLabel);
      ['libraryScreen', 'breinkrakersScreen', 'liveScreen'].forEach(id => {
        const screen = document.getElementById(id);
        if (screen) observer.observe(screen, { attributes: true, subtree: true, attributeFilter: ['class', 'style'] });
      });
      updateBackLabel();
      group.append(home);
    }
    window.openNavigationDestination = function () {
      const url = new URL(location.href);
      const target = url.searchParams.get('screen');
      const routes = { daily: () => window.NettoRoutes?.openToday(), archive: () => openDailyPuzzles(), leaderboard: () => openLeaderboardModal(), puzzles: () => openPuzzles(), brain: () => openConnection(), connection: () => openConnection(), race: () => openPuzzleRace(), how: () => openHowItWorks(), submit: () => openSubmitQuestion(), about: () => openAbout() };
      if (routes[target]) {
        url.searchParams.delete('screen'); history.replaceState(null, '', url);
        routes[target]();
      }
    };
    return;
  }
  const header = document.createElement('header');
  header.className = 'topbar';
  header.innerHTML = '<div class="topbar-navigation"><button type="button" class="hamburger" id="hamburgerBtn" aria-label="Menu" aria-expanded="false" aria-controls="sidebar"><span></span><span></span><span></span></button><a class="topbar-home" href="index.html" aria-label="' + copy('Naar home', 'Go home') + '" title="' + copy('Naar home', 'Go home') + '">' + homeIcon + '</a></div>';
  document.body.prepend(header);
  const overlay = document.createElement('div'); overlay.className = 'overlay';
  const nav = document.createElement('nav'); nav.className = 'sidebar'; nav.id = 'sidebar'; nav.inert = true;
  nav.ariaLabel = copy('Hoofdnavigatie', 'Main navigation');
  const groups = [
    ['Daily', [['daily','De Daily','Daily'],['archive','Daily Archive','Daily Archive'],['leaderboard','Ranglijst','Leaderboard']]],
    [copy('Spelen','Play'), [['puzzles','Puzzels','Puzzles'],['connection','Find the Connection','Find the Connection'],['race','Puzzelrace','Puzzle Race'],['live','Live Rondes','Live Rounds']]],
    [copy('Meer','More'), [['how','Hoe werkt het?','How does it work?'],['submit','Vraag insturen','Submit a question']]]
  ];
  nav.innerHTML = '<div class="sidebar-header"><a class="sidebar-logo" href="index.html">Netto</a><button type="button" class="sidebar-close" aria-label="' + copy('Menu sluiten','Close menu') + '">×</button></div><div class="sidebar-tagline">' + copy('het schattingsspel','the estimation game') + '</div><div class="sidebar-scroll">' + groups.map(([name,items]) => '<div class="sidebar-group"><div class="sidebar-group-title">' + name + '</div>' + items.map(([id,nl,en]) => '<a class="sidebar-item" href="index.html?screen=' + id + '"><span class="label">' + copy(nl,en) + '</span><span class="arrow">→</span></a>').join('') + '</div>').join('') + '</div><a class="sidebar-footer" href="index.html?screen=about">' + copy('Over Netto','About Netto') + '</a>';
  document.body.append(overlay, nav);
  const button = header.querySelector('button');
  function toggle(open) {
    nav.inert = !open; nav.classList.toggle('open',open); overlay.classList.toggle('show',open); button.classList.toggle('open',open); button.setAttribute('aria-expanded',String(open));
    document.getElementById('statsScreen').inert = open;
    if (open) nav.querySelector('a').focus(); else button.focus();
  }
  button.addEventListener('click', () => toggle(!nav.classList.contains('open')));
  overlay.addEventListener('click', () => toggle(false));
  nav.querySelector('button').addEventListener('click', () => toggle(false));
  document.addEventListener('keydown', event => {
    if (!nav.classList.contains('open')) return;
    if (event.key === 'Escape') toggle(false);
    if (event.key === 'Tab') {
      const items = [...nav.querySelectorAll('a,button')], first = items[0], last = items[items.length-1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
})();
