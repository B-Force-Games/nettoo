// Uitgebreide statistieken: uitsluitend opgeslagen resultaten, nooit verzonnen antwoorden.
(function () {
  'use strict';
  const modes = { daily: ['Daily', 'Daily'], library: ['Puzzels', 'Puzzles'], breinkrakers: ['Breinkrakers', 'Brain Teasers'], race: ['Puzzelrace', 'Puzzle Race'] };
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; } };
  const t = (nl, en) => readLanguage() === 'en' ? en : nl;
  function readLanguage() { try { return localStorage.getItem('netto_language') === 'nl' ? 'nl' : 'en'; } catch (_) { return 'en'; } }
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const categoryName = value => readLanguage() === 'en' ? (window.NETTO_TRANSLATIONS_EN?.[value] || value) : value;
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  const shift = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const average = list => list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : null;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  let mode = new URLSearchParams(location.search).get('mode') || 'daily';
  if (!modes[mode]) mode = 'daily';
  let period = 'week';
  let demo = local && new URLSearchParams(location.search).get('demo') === '1';
  let shown = [];
  let summary = null;

  // De daily wisselt om 12:00 in Londen, ook tijdens de zomertijd.
  function dailyDate(now = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
    const day = parts.year + '-' + parts.month + '-' + parts.day;
    return Number(parts.hour) < 12 ? shift(day, -1) : day;
  }
  function calculate(a, op, b) {
    if (op === '+') return a + b;
    if (op === '−' || op === '-') return a - b;
    if (op === '×' || op === '*') return a * b;
    if (op === '÷' || op === '/') return b === 0 ? NaN : a / b;
    return NaN;
  }
  function attempt(play, puzzle, day) {
    if (!play || !Number.isFinite(Number(play.factor)) || Number(play.factor) < 1) return null;
    const guesses = Array.isArray(play.guesses) ? play.guesses : [play.g1, play.g2, play.g3];
    const answers = play.answers || (puzzle ? [1, 2, 3, ...(puzzle.q4 ? [4] : [])].map(i => puzzle['q' + i + '_answer'] ?? puzzle['q' + i]?.answer) : []);
    const categories = play.categories || puzzle?.categories || [];
    const questions = answers.map((answer, i) => {
      const guess = guesses[i];
      if (guess === undefined || guess === null || answer === null || answer === undefined || !Number.isFinite(Number(guess)) || !Number.isFinite(Number(answer))) return null;
      return { guess: Number(guess), answer: Number(answer), category: categories[i] || null };
    }).filter(Boolean);
    const operators = play.operators || (puzzle?.op1 ? [puzzle.op1, puzzle.op2] : [play.operator || puzzle?.operator].filter(Boolean));
    let consistent = null;
    if (answers.length >= 3 && questions.length === answers.length && operators.length === answers.length - 2) {
      let result = questions[0].guess;
      operators.forEach((op, i) => { result = calculate(result, op, questions[i + 1].guess); });
      consistent = Number.isFinite(result) && Math.abs(result - questions[questions.length - 1].guess) < 1e-9;
    }
    return { factor: Number(play.factor), exact: play.exact === undefined ? Number(play.factor) === 1 : play.exact === true,
      date: validDate(day) ? day : null, questions, operators, consistent };
  }
  function getRealAttempts(selected) {
    const data = window.NETTO_REBUILT_PUZZLES || {};
    let entries = [];
    if (selected === 'daily') {
      const puzzles = data.daily || [];
      const byDate = new Map(puzzles.map(p => [p.date, p]));
      const byNumber = new Map(puzzles.map(p => [Number(p.number), p]));
      const unique = new Map();
      Object.entries(read('netto_plays', {})).sort(([a], [b]) => Number(validDate(a)) - Number(validDate(b))).forEach(([key, play]) => {
        if (!validDate(key) && !/^puzzle_\d+$/.test(key)) return;
        const puzzle = byDate.get(key) || byNumber.get(Number(play?.puzzleNumber || key.slice(7)));
        const day = validDate(key) ? key : puzzle?.date;
        if (!validDate(day) || day > dailyDate()) return;
        const item = attempt(play, puzzle, day);
        if (item) unique.set(day, item);
      });
      entries = [...unique.values()];
    } else if (selected === 'library') {
      const plays = read('netto_library_plays', {});
      entries = (data.library || []).map(p => attempt(plays[p.id], p, plays[p.id]?.completedAt?.slice(0, 10)));
    } else if (selected === 'breinkrakers') {
      const puzzles = new Map((window.NETTO_BREINKRAKERS || []).map(p => [p.id, p]));
      const saved = read('netto_breinkrakers_progress', {});
      entries = (Array.isArray(saved.results) ? saved.results : []).map(p => attempt(p, puzzles.get(p.id), p.completedAt?.slice(0, 10)));
    } else {
      const saved = read('netto_race_stats', []);
      entries = (Array.isArray(saved) ? saved : []).map(p => attempt(p, null, p.completedAt?.slice(0, 10)));
    }
    return entries.filter(Boolean).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }
  // Alleen lokaal en expliciet via ?demo=1. Schrijft niets naar de spelopslag.
  function generateMockAttempts() {
    return Array.from({ length: 30 }, (_, i) => attempt({
      factor: 1 + ((i * 7) % 18) / 10, exact: i % 18 === 0,
      guesses: [10 + i % 5, 20 - i % 4, 30 + i % 5 - i % 4],
      answers: [10, 20, 30], categories: ['Natuur', 'Sport', 'Cultuur'], operators: ['+']
    }, null, shift(dailyDate(), i - 29)));
  }
  function computeStats(entries) {
    const factors = entries.map(e => e.factor);
    const questions = entries.flatMap(e => e.questions);
    const days = [...new Set(entries.map(e => e.date).filter(Boolean))].sort();
    let run = 0, best = 0, previous = null, current = 0;
    days.forEach(day => { run = previous && shift(previous, 1) === day ? run + 1 : 1; best = Math.max(best, run); previous = day; });
    let cursor = days.includes(dailyDate()) ? dailyDate() : shift(dailyDate(), -1);
    while (days.includes(cursor)) { current++; cursor = shift(cursor, -1); }
    if (mode === 'daily' && !demo) best = Math.max(best, Number(read('netto_max_streak', 0)) || 0);
    const ops = ['+', '−', '×', '÷'].map(symbol => {
      const values = entries.filter(e => e.operators.map(op => ({ '-': '−', '*': '×', '/': '÷' })[op] || op).includes(symbol)).map(e => e.factor);
      return { symbol, count: values.length, avg: average(values) };
    });
    const categories = new Map();
    questions.forEach(q => {
      if (!q.category || q.answer <= 0 || q.guess <= 0) return;
      if (!categories.has(q.category)) categories.set(q.category, []);
      categories.get(q.category).push(Math.max(q.guess / q.answer, q.answer / q.guess));
    });
    const formula = entries.filter(e => e.consistent !== null);
    const low = questions.filter(q => q.guess < q.answer).length;
    const high = questions.filter(q => q.guess > q.answer).length;
    const exact = entries.filter(e => e.exact).length;
    const accuracy = average(factors.map(f => 100 / f));
    return { count: entries.length, exact, rate: entries.length ? Math.round(100 * exact / entries.length) : null,
      accuracy: accuracy === null ? null : Math.round(accuracy), avg: average(factors),
      bestAccuracy: factors.length ? Math.round(100 / Math.min(...factors)) : null,
      current, best, questions: questions.length, low, high, ops,
      categories: [...categories].map(([name, values]) => ({ name, count: values.length, avg: average(values) })).sort((a, b) => a.avg - b.avg),
      formulaCount: formula.length, formulaRate: formula.length ? Math.round(100 * formula.filter(e => e.consistent).length / formula.length) : null };
  }
  const pct = value => value === null ? '—' : value + '%';
  const factor = value => value === null ? '—' : value.toFixed(2) + '×';
  function profile(s) {
    if (s.count < 5) return t('Nog in ontwikkeling', 'Still taking shape');
    if (s.rate >= 20) return t('De Scherpschutter', 'The Precisionist');
    if (s.questions && s.low / s.questions >= .55) return t('De Voorzichtige', 'The Underestimator');
    if (s.questions && s.high / s.questions >= .55) return t('De Grootdenker', 'The Optimist');
    return t('De Verkenner', 'The Explorer');
  }
  function card(title, content) { return '<section class="stats-card"><h2 class="stats-card-title">' + title + '</h2>' + content + '</section>'; }
  function trend() {
    const dated = shown.filter(e => e.date);
    const today = dailyDate();
    const recent = period === 'week' ? dated.filter(e => e.date >= shift(today, -6) && e.date <= today) : dated;
    const previous = dated.filter(e => e.date >= shift(today, -13) && e.date < shift(today, -6));
    const avg = average(recent.map(e => 100 / e.factor));
    const before = average(previous.map(e => 100 / e.factor));
    const delta = avg !== null && before !== null ? Math.round(avg - before) : null;
    const points = recent.map((e, i) => [20 + 600 * i / Math.max(1, recent.length - 1), 120 - 100 / e.factor, e]);
    return '<div class="stats-trend-controls">' + ['week', 'all'].map(p => '<button type="button" class="stats-btn-secondary" aria-pressed="' + (period === p) + '" data-period="' + p + '">' + (p === 'week' ? t('7 dagen', '7 days') : t('Alles', 'All time')) + '</button>').join('') + '</div>' +
      (recent.length ? '<svg viewBox="0 0 640 145" role="img" aria-label="' + t('Nauwkeurigheid per gespeelde puzzel, van 0 tot 100 procent', 'Accuracy per played puzzle, from 0 to 100 percent') + '"><polyline points="' + points.map(p => p[0] + ',' + p[1]).join(' ') + '" fill="none" stroke="#FFD23F" stroke-width="3"/>' + points.map(p => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4" fill="#252FB6"><title>' + p[2].date + ': ' + Math.round(100 / p[2].factor) + '%</title></circle>').join('') + '</svg><p>' + recent.length + ' ' + t('puzzels · gem. nauwkeurigheid', 'puzzles · avg. accuracy') + ' ' + pct(Math.round(avg)) + (period === 'week' && delta !== null ? ' · ' + (delta > 0 ? '+' : '') + delta + ' ' + t('procentpunt t.o.v. de vorige 7 dagen', 'percentage points vs the previous 7 days') : '') + '</p>' : '<p>' + t('Geen gedateerde resultaten in deze periode.', 'No dated results in this period.') + '</p>');
  }
  function renderFullStatsPage() {
    const root = document.getElementById('statsScreen');
    if (!root) return;
    document.documentElement.lang = readLanguage();
    shown = demo ? generateMockAttempts() : getRealAttempts(mode);
    summary = computeStats(shown);
    const s = summary;
    const metrics = [[t('Gem. nauwkeurigheid', 'Avg. accuracy'), pct(s.accuracy)], ['Spot-on', s.exact], ['Spot-on %', pct(s.rate)], [t('Gespeeld', 'Played'), s.count],
      [mode === 'daily' ? t('Huidige streak', 'Current streak') : t('Beste nauwkeurigheid', 'Best accuracy'), mode === 'daily' ? s.current : pct(s.bestAccuracy)],
      [mode === 'daily' ? t('Beste streak', 'Best streak') : t('Gem. factor', 'Avg. factor'), mode === 'daily' ? s.best : factor(s.avg)]];
    let html = '<div class="stats-page-container"><nav class="stats-nav-bar"><a class="stats-back-btn" href="index.html">← ' + t('Terug naar spel', 'Back to game') + '</a></nav><header class="stats-header-card"><p class="stats-header-eyebrow">NETTO</p><h1 class="stats-header-title">' + t('Statistieken', 'Statistics') + '</h1><p class="stats-header-desc">' + t('Jouw schattingen, van dichtbij bekeken.', 'A closer look at your estimates.') + '</p><div class="stats-modes-track" role="group" aria-label="' + t('Spelmodus', 'Game mode') + '">' +
      Object.entries(modes).map(([key, labels]) => '<button type="button" class="stats-mode-tab ' + (key === mode ? 'active' : '') + '" aria-pressed="' + (key === mode) + '" data-mode="' + key + '">' + t(...labels) + '</button>').join('') + '</div></header>' +
      (demo ? '<p role="status">' + t('Demo: fictieve resultaten, niet jouw statistieken.', 'Demo: fictional results, not your statistics.') + ' <a href="stats.html">' + t('Toon mijn cijfers', 'Show my stats') + '</a></p>' : '') +
      '<div class="stats-metrics-grid">' + metrics.map(([label, value], i) => '<div class="stats-kpi-box ' + (i === 0 ? 'hero' : '') + '"><span class="stats-kpi-label">' + label + '</span><strong class="stats-kpi-value">' + value + '</strong></div>').join('') + '</div>';
    if (!s.count) {
      html += card(t('Hier begint jouw overzicht', 'Your record starts here'), '<p>' + t('Nog geen opgeslagen resultaten in deze modus. Speel een puzzel en kom terug.', 'No saved results in this mode yet. Play a puzzle and come back.') + '</p>');
    } else {
      // Intervallen zijn expliciet; 1× betekent exact, niet afgerond bijna goed.
      const bins = [{ label: '1×', max: 1 }, { label: '>1–2×', max: 2 }, { label: '>2–3×', max: 3 }, { label: '>3–5×', max: 5 }, { label: '>5–10×', max: 10 }, { label: '>10–20×', max: 20 }, { label: '>20–50×', max: 50 }, { label: '>50–100×', max: 100 }, { label: '>100×', max: Infinity }].map(b => ({ ...b, count: 0 }));
      shown.forEach(e => bins.find(b => e.factor <= b.max).count++);
      const latest = shown[shown.length - 1];
      const latestIndex = latest.date ? bins.findIndex(b => latest.factor <= b.max) : -1;
      const max = Math.max(...bins.map(b => b.count), 1);
      html += card(t('Scoreverdeling', 'Score distribution'), '<p class="stats-header-desc">' + t('Lagere factor = dichterbij. Geel markeert je laatste gedateerde resultaat.', 'Lower factor = closer. Yellow marks your latest dated result.') + '</p><div class="stats-distribution">' + bins.map((b, i) => '<div class="stats-distribution-row"><span>' + b.label + '</span><span class="stats-distribution-track"><span style="width:' + (100 * b.count / max) + '%;background:' + (i === latestIndex ? '#FFD23F' : '#252FB6') + '"></span></span><strong>' + b.count + '</strong></div>').join('') + '</div>');
      if (s.questions) {
        const low = Math.round(100 * s.low / s.questions), exact = Math.round(100 * (s.questions - s.low - s.high) / s.questions), high = 100 - low - exact;
        html += card(t('Hoe schat jij?', 'How do you estimate?'), '<p>' + s.questions + ' ' + t('opgeslagen antwoorden', 'saved answers') + '</p><div class="stats-bias-bar-wrap"><span class="stats-bias-segment low" style="width:' + low + '%"></span><span class="stats-bias-segment exact" style="width:' + exact + '%"></span><span class="stats-bias-segment high" style="width:' + high + '%"></span></div><p>' + low + '% ' + t('te laag', 'low') + ' · ' + exact + '% ' + t('exact', 'exact') + ' · ' + high + '% ' + t('te hoog', 'high') + '</p>');
      } else html += card(t('Antwoorddetails', 'Answer details'), '<p>' + t('Deze oudere resultaten bevatten alleen een score. Schattingstendens en formuleanalyse zijn daarom nog niet beschikbaar.', 'These older results contain only a score. Estimation bias and formula analysis are not available yet.') + '</p>');
      html += card(t('Per bewerking', 'By operator'), '<div class="stats-op-grid">' + s.ops.map(o => '<div class="stats-op-col"><div class="stats-op-symbol">' + o.symbol + '</div><div class="stats-op-val">' + factor(o.avg) + '</div><p>' + o.count + ' ' + t('puzzels', 'puzzles') + '</p></div>').join('') + '</div>');
      if (s.formulaCount) html += card(t('Klopt jouw rekensom?', 'Does your equation add up?'), '<strong class="stats-kpi-value">' + pct(s.formulaRate) + '</strong><p>' + t('Van de', 'Of the') + ' ' + s.formulaCount + ' ' + t('puzzels met volledige antwoorddetails. Dit meet of de ingevoerde som klopt, niet of de schattingen juist zijn.', 'puzzles with complete answer details. This measures whether your entered equation holds, not whether your estimates are correct.') + '</p>');
      if (s.categories.length) html += card(t('Per categorie', 'By category'), '<div class="stats-category-list">' + s.categories.map(c => '<p class="stats-category-line"><span>' + escape(c.name) + '<small> · ' + c.count + '</small></span><strong>' + factor(c.avg) + '</strong></p>').join('') + '</div><p class="stats-header-desc">' + t('Gebaseerd op losse antwoorden. Er zijn nog geen communitygemiddelden beschikbaar.', 'Based on individual answers. Community averages are not available yet.') + '</p>');
      html += card(t('Jouw ontwikkeling', 'Your progress'), trend());
      html += card(t('Jouw schattingsprofiel', 'Your estimation profile'), '<h3 class="stats-archetype-name">' + profile(s) + '</h3><p>' + t('Een speelse indicatie op basis van je opgeslagen resultaten, geen vergelijking met andere spelers.', 'A playful indication based on your saved results, not a comparison with other players.') + '</p>');
      html += card(t('Deel je overzicht', 'Share your record'), '<div class="stats-share-actions"><button type="button" class="stats-btn-primary" data-share="image">' + t('Deel afbeelding', 'Share image') + '</button><button type="button" class="stats-btn-secondary" data-share="text">' + t('Kopieer tekst', 'Copy text') + '</button></div><p id="statsShareStatus" role="status" aria-live="polite"></p>');
    }
    root.innerHTML = html + '</div>';
    root.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
      mode = button.dataset.mode;
      const url = new URL(location.href); url.searchParams.set('mode', mode); history.replaceState(null, '', url);
      renderFullStatsPage(); root.querySelector('[data-mode="' + mode + '"]')?.focus();
    }));
    root.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', () => { period = button.dataset.period; renderFullStatsPage(); root.querySelector('[data-period="' + period + '"]')?.focus(); }));
    root.querySelectorAll('[data-share]').forEach(button => button.addEventListener('click', () => share(button.dataset.share)));
  }
  function shareText() {
    return 'Netto · ' + t(...modes[mode]) + (demo ? ' · DEMO' : '') + '\n' + profile(summary) + '\n' +
      summary.count + ' ' + t('gespeeld', 'played') + ' · ' + summary.exact + ' spot-on\n' +
      pct(summary.accuracy) + ' ' + t('gem. nauwkeurigheid', 'avg. accuracy');
  }
  async function share(kind) {
    const status = document.getElementById('statsShareStatus');
    try {
      if (kind === 'text') {
        await navigator.clipboard.writeText(shareText());
        status.textContent = t('Tekst gekopieerd.', 'Text copied.');
        return;
      }
      const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 630;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#14163B'; ctx.fillRect(0, 0, 1200, 630);
      ctx.fillStyle = '#FFD23F'; ctx.fillRect(60, 65, 10, 500);
      ctx.font = 'bold 40px sans-serif'; ctx.fillText('NETTO · ' + t(...modes[mode]) + (demo ? ' · DEMO' : ''), 110, 130);
      ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 52px sans-serif'; ctx.fillText(profile(summary), 110, 235);
      ctx.font = 'bold 100px sans-serif'; ctx.fillStyle = '#252FB6'; ctx.fillText(pct(summary.accuracy), 110, 365);
      ctx.font = '32px sans-serif'; ctx.fillStyle = '#FFFFFF'; ctx.fillText(t('gemiddelde nauwkeurigheid', 'average accuracy'), 110, 420);
      ctx.fillText(summary.count + ' ' + t('gespeeld', 'played') + ' · ' + summary.exact + ' spot-on', 110, 515);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Afbeelding niet beschikbaar');
      const file = new File([blob], 'netto-statistieken.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Netto', text: shareText() });
      else {
        const url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
        status.textContent = t('Afbeelding gedownload.', 'Image downloaded.');
      }
    } catch (error) {
      if (error.name !== 'AbortError') status.textContent = t('Delen lukt niet in deze browser. Probeer de andere deelknop.', 'Sharing is unavailable in this browser. Try the other share button.');
    }
  }
  window.openFullStatsPage = function (selected) {
    const aliases = { puzzles: 'library', brain: 'breinkrakers' };
    const chosen = aliases[selected] || selected || 'daily';
    location.href = 'stats.html?mode=' + encodeURIComponent(modes[chosen] ? chosen : 'daily');
  };
  window.renderFullStatsPage = renderFullStatsPage;
  // De hoofdpagina laadt alleen de navigatie; de zelfstandige pagina rendert de analyse.
  if (document.body.hasAttribute('data-full-stats')) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderFullStatsPage, { once: true });
    else renderFullStatsPage();
    window.addEventListener('storage', renderFullStatsPage);
  }
  if (local) window.NettoStatsTest = { getRealAttempts, computeStats, dailyDate, attempt, generateMockAttempts };
})();
