// Drie bestaande vragen, zonder de oorspronkelijke volgorde of operator prijs te geven.
const CONNECTION_PROGRESS_KEY = 'netto_connection_progress';
const connectionOperators = ['+', '−', '×', '÷'];
let connectionPool = [];
let connectionState = null;
let connectionPicked = null;

// Gehele getallen vergelijken met BigInt voorkomt afrondingsfouten en overloop.
function connectionEquation(values, operator) {
  if (values.length !== 3 || !values.every(v => Number.isSafeInteger(v) && v > 0)) return false;
  const [a, b, c] = values.map(BigInt);
  if (operator === '+') return a + b === c;
  if (operator === '−') return a - b === c;
  if (operator === '×') return a * b === c;
  if (operator === '÷') return b !== 0n && a === b * c;
  return false;
}

function validConnections(answers) {
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  return orders.flatMap(order => connectionOperators
    .filter(operator => connectionEquation(order.map(i => answers[i]), operator))
    .map(operator => ({ order, operator })));
}

function connectionAnswers(puzzle) {
  return [puzzle.q1_answer, puzzle.q2_answer, puzzle.q3_answer];
}

function cleanConnection(puzzle) {
  const answers = connectionAnswers(puzzle);
  if (new Set(answers).size !== 3) return false;
  const valid = validConnections(answers);
  // Inverse bewerkingen horen bij één familie; een toevallig tweede verband niet.
  const families = new Set(valid.map(v => ['+', '−'].includes(v.operator) ? 'sum' : 'product'));
  return families.size === 1 && [1, 2, 3].every(i => Boolean(puzzle['q' + i + '_label']));
}

function shuffledConnectionOrder(random = Math.random) {
  const order = [0, 1, 2];
  for (let i = 2; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  // Toon nooit per ongeluk de opgeslagen volgorde als beginopstelling.
  if (order.every((value, i) => value === i)) return [1, 2, 0];
  return order;
}

function connectionProgress() {
  const saved = readStatsStorage(CONNECTION_PROGRESS_KEY, {});
  return { results: Array.isArray(saved.results) ? saved.results : [] };
}

function openConnection() {
  closeMenu();
  showScreen('breinkrakers');
  renderConnectionStart();
}

function renderConnectionStart() {
  connectionPool = libraryPuzzles.filter(cleanConnection);
  connectionState = null;
  const screen = document.getElementById('breinkrakersScreen');
  screen.classList.remove('is-playing');
  screen.scrollTop = 0;
  document.getElementById('bkStart').style.display = 'block';
  document.getElementById('bkPlay').style.display = 'none';
  const results = connectionProgress().results.filter(r => connectionPool.some(p => p.id === r.id));
  document.getElementById('bkPlayedCount').textContent = results.length + '/' + connectionPool.length;
  document.getElementById('bkExactCount').textContent = results.filter(r => r.connectionCorrect).length;
  document.getElementById('bkAverageScore').textContent = results.length
    ? (results.reduce((sum, r) => sum + r.factor, 0) / results.length).toFixed(2) + '×' : '—';
  document.getElementById('bkProgress').textContent = connectionPool.length
    ? statsCopy('Kies een verborgen verband.', 'Choose a hidden connection.')
    : statsCopy('Er zijn nog geen geschikte puzzels beschikbaar.', 'No suitable puzzles are available yet.');
  const grid = document.getElementById('bkCardGrid');
  grid.replaceChildren();
  connectionPool.forEach((puzzle, index) => {
    const result = results.find(r => r.id === puzzle.id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'connection-catalog-card';
    const number = document.createElement('strong');
    number.textContent = '#' + (index + 1);
    const label = document.createElement('span');
    label.textContent = result ? (result.connectionCorrect ? '✓ ' : '≠ ') + result.factor.toFixed(2) + '×'
      : statsCopy('Open puzzel →', 'Open puzzle →');
    button.append(number, label);
    button.onclick = () => startConnection(index);
    grid.append(button);
  });
}

function startConnection(index = 0) {
  const puzzle = connectionPool[index];
  if (!puzzle) { renderConnectionStart(); return; }
  connectionState = { puzzle, index, order: shuffledConnectionOrder(), operator: null, submitted: false };
  connectionPicked = null;
  const screen = document.getElementById('breinkrakersScreen');
  screen.classList.add('is-playing');
  screen.scrollTop = 0;
  document.getElementById('bkStart').style.display = 'none';
  document.getElementById('bkPlay').style.display = 'block';
  document.getElementById('bkPuzzleLabel').textContent = statsCopy('Puzzel ', 'Puzzle ') + (index + 1);
  document.getElementById('bkCounter').textContent = (index + 1) + ' / ' + connectionPool.length;
  document.getElementById('bkFeedback').textContent = '';
  document.getElementById('connectionHint').hidden = false;
  document.getElementById('connectionSkip').hidden = false;
  const submit = document.getElementById('bkSubmitButton');
  submit.textContent = statsCopy('Controleer mijn verband', 'Check my connection');
  const list = document.getElementById('bkQuestionList');
  list.replaceChildren();
  const cards = [0, 1, 2].map(i => {
    const card = document.createElement('div');
    card.className = 'q-block connection-question';
    card.dataset.question = i;
    const position = document.createElement('span');
    position.className = 'connection-position';
    const handle = document.createElement('button');
    handle.type = 'button'; handle.className = 'connection-drag-handle';
    handle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg>';
    handle.setAttribute('aria-label', statsCopy('Verplaats deze vraag', 'Move this question'));
    handle.setAttribute('aria-pressed', 'false');
    handle.setAttribute('aria-describedby', 'connectionHint');
    handle.setAttribute('aria-description', statsCopy('Gebruik de pijltjestoetsen om te verplaatsen, of tik twee grepen aan om te wisselen.', 'Use the arrow keys to move, or tap two handles to swap.'));
    bindConnectionDrag(handle, card, i);
    const question = document.createElement('label');
    question.className = 'q-label'; question.htmlFor = 'connectionAnswer' + i;
    const original = puzzle['q' + (i + 1) + '_label'];
    question.textContent = window.NettoI18n?.t(original) || original;
    const wrapper = document.createElement('div'); wrapper.className = 'input-wrapper';
    const input = document.createElement('input');
    input.id = 'connectionAnswer' + i; input.type = 'text'; input.inputMode = 'numeric';
    input.className = 'library-answer-input daily-style-input';
    input.placeholder = statsCopy('Jouw schatting', 'Your estimate'); input.autocomplete = 'off';
    // Geen verborgen operator aan de autocalculator geven: die zou het verband verklappen.
    bindWholeNumberInput(input, () => {});
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const next = connectionState.order[connectionState.order.indexOf(i) + 1];
      if (next !== undefined) document.getElementById('connectionAnswer' + next).focus();
      else submitConnection();
    });
    const heading = document.createElement('div'); heading.className = 'connection-question-heading';
    heading.append(question, handle);
    wrapper.append(input); card.append(position, heading, wrapper);
    return card;
  });
  werkVraagDetailsBij(puzzle, cards, false);
  cards.forEach(card => list.append(card));
  const operator = document.createElement('fieldset'); operator.className = 'connection-operators';
  const legend = document.createElement('legend'); legend.textContent = statsCopy('Kies het teken', 'Choose the operator');
  operator.append(legend);
  connectionOperators.forEach(symbol => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = symbol;
    button.setAttribute('aria-pressed', 'false');
    button.onclick = () => {
      connectionState.operator = symbol;
      operator.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    };
    operator.append(button);
  });
  list.append(operator);
  const equal = document.createElement('div'); equal.className = 'connection-equals'; equal.textContent = '=';
  list.append(equal);
  layoutConnection();
}

function layoutConnection() {
  const list = document.getElementById('bkQuestionList');
  const cards = connectionState.order.map(i => list.querySelector('[data-question="' + i + '"]'));
  cards.forEach((card, index) => {
    card.querySelector('.connection-position').textContent = index === 2 ? statsCopy('Uitkomst', 'Result') : statsCopy('Positie ', 'Position ') + (index + 1);
  });
  list.replaceChildren(cards[0], list.querySelector('.connection-operators'), cards[1], list.querySelector('.connection-equals'), cards[2]);
}

function moveConnection(question, direction) {
  if (!connectionState || connectionState.submitted) return;
  const order = connectionState.order;
  const index = order.indexOf(question), target = index + direction;
  if (target < 0 || target > 2) return;
  [order[index], order[target]] = [order[target], order[index]];
  layoutConnection();
  const card = document.querySelector('#bkQuestionList [data-question="' + question + '"]');
  card.querySelector('.connection-drag-handle').focus({ preventScroll: true });
  document.getElementById('bkFeedback').textContent = statsCopy('Vraag verplaatst naar positie ', 'Question moved to position ') + (target + 1) + '.';
}

function selectConnectionCard(question) {
  if (!connectionState || connectionState.submitted) return;
  if (connectionPicked !== null && connectionPicked !== question) {
    const from = connectionState.order.indexOf(connectionPicked);
    const to = connectionState.order.indexOf(question);
    moveConnection(connectionPicked, to - from);
    connectionPicked = null;
  } else connectionPicked = connectionPicked === question ? null : question;
  document.querySelectorAll('#bkQuestionList .connection-question').forEach(card => {
    const picked = Number(card.dataset.question) === connectionPicked;
    card.classList.toggle('is-picked', picked);
    card.querySelector('.connection-drag-handle').setAttribute('aria-pressed', String(picked));
  });
}

// Eén pointerpad voor muis, pen en aanraking. Tijdens het slepen blijven de echte
// invoervelden op hun plek in de DOM; pas bij loslaten wisselen we de kaarten.
function bindConnectionDrag(handle, card, question) {
  let drag = null, suppressClick = false;
  const screen = document.getElementById('breinkrakersScreen');
  handle.addEventListener('click', () => {
    if (suppressClick) { suppressClick = false; return; }
    selectConnectionCard(question);
  });
  handle.addEventListener('keydown', event => {
    if (event.key === 'Escape') { finish(false); connectionPicked = question; selectConnectionCard(question); }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    moveConnection(question, event.key === 'ArrowUp' ? -1 : 1);
  });
  function frame() {
    if (!drag || !handle.isConnected) { finish(false); return; }
    if (drag.moved) {
      const bounds = screen.getBoundingClientRect();
      const top = Math.max(bounds.top, 72), bottom = Math.min(bounds.bottom, innerHeight);
      if (drag.y < top + 70) screen.scrollTop -= 9;
      else if (drag.y > bottom - 70) screen.scrollTop += 9;
      card.style.transform = 'translateY(' + (drag.y - drag.startY + screen.scrollTop - drag.scrollTop) + 'px)';
      const listBounds = card.parentElement.getBoundingClientRect();
      let distance = Infinity;
      drag.target = null;
      document.querySelectorAll('#bkQuestionList .connection-question').forEach(other => {
        other.classList.remove('is-drop-target');
        const rect = other.getBoundingClientRect();
        const centre = other === card ? drag.centre - (screen.scrollTop - drag.scrollTop) : rect.top + rect.height / 2;
        const delta = Math.abs(drag.y - centre);
        if (drag.x >= listBounds.left - 30 && drag.x <= listBounds.right + 30 && delta < distance) {
          distance = delta; drag.target = other;
        }
      });
      if (drag.target && drag.target !== card) drag.target.classList.add('is-drop-target');
    }
    drag.frame = requestAnimationFrame(frame);
  }
  function finish(commit) {
    if (!drag) return;
    const current = drag;
    drag = null;
    cancelAnimationFrame(current.frame);
    suppressClick = current.moved;
    // De eventuele klik direct na pointerup hoort niet nog een kaart te selecteren.
    setTimeout(() => { suppressClick = false; }, 0);
    if (handle.hasPointerCapture(current.id)) handle.releasePointerCapture(current.id);
    card.style.removeProperty('transform');
    card.classList.remove('is-dragging');
    document.querySelectorAll('#bkQuestionList .is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
    if (commit && current.moved && current.target && current.target !== card) {
      const from = connectionState.order.indexOf(question);
      const to = connectionState.order.indexOf(Number(current.target.dataset.question));
      moveConnection(question, to - from);
    }
  }
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary || connectionState?.submitted) return;
    const rect = card.getBoundingClientRect();
    drag = { id: event.pointerId, startY: event.clientY, y: event.clientY, x: event.clientX, scrollTop: screen.scrollTop, centre: rect.top + rect.height / 2, moved: false };
    handle.setPointerCapture(event.pointerId);
    drag.frame = requestAnimationFrame(frame);
  });
  handle.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    drag.y = event.clientY; drag.x = event.clientX;
    if (Math.abs(drag.y - drag.startY) > 5) {
      if (!drag.moved && connectionPicked !== null) {
        const picked = connectionPicked;
        selectConnectionCard(picked);
      }
      drag.moved = true;
      card.classList.add('is-dragging');
    }
  });
  handle.addEventListener('pointerup', () => finish(true));
  handle.addEventListener('pointercancel', () => finish(false));
  handle.addEventListener('lostpointercapture', () => finish(false));
}

function submitConnection() {
  const state = connectionState;
  if (!state) return;
  if (state.submitted) { startConnection(state.index + 1); return; }
  const guesses = [0, 1, 2].map(i => parseFormattedNumber(document.getElementById('connectionAnswer' + i).value));
  const feedback = document.getElementById('bkFeedback');
  if (!validWholeAnswers(guesses)) {
    feedback.textContent = statsCopy('Vul drie positieve gehele getallen in.', 'Enter a positive whole number for each question.'); return;
  }
  if (!state.operator) {
    feedback.textContent = statsCopy('Kies eerst een operator.', 'Choose an operator first.'); return;
  }
  if (isEquationRequired() && !connectionEquation(state.order.map(i => guesses[i]), state.operator)) { showEquationNotice(); return; }
  const answers = connectionAnswers(state.puzzle);
  const correct = connectionEquation(state.order.map(i => answers[i]), state.operator);
  const factor = answers.reduce((sum, answer, i) => sum + scoreVraag(guesses[i], answer), 0) / 3;
  const progress = connectionProgress();
  const result = { id: state.puzzle.id, factor, connectionCorrect: correct, exact: correct && guesses.every((g, i) => isSpotOnAnswer(g, answers[i])),
    guesses: state.order.map(i => guesses[i]), answers: state.order.map(i => answers[i]), order: [...state.order],
    categories: state.order.map(i => state.puzzle.categories?.[i] || ''), operators: [state.operator], completedAt: new Date().toISOString() };
  progress.results = progress.results.filter(r => r.id !== result.id).concat(result);
  localStorage.setItem(CONNECTION_PROGRESS_KEY, JSON.stringify(progress));
  state.submitted = true;
  // De normale review wordt hergebruikt, in de door de speler gekozen volgorde.
  const ordered = { categories: result.categories };
  state.order.forEach((i, position) => { ordered['q' + (position + 1) + '_label'] = state.puzzle['q' + (i + 1) + '_label']; });
  renderPuzzleReview('bk', ordered, result.guesses, result.answers, factor);
  const connection = document.createElement('section'); connection.className = 'connection-verdict';
  connection.classList.toggle('is-correct', correct);
  const title = document.createElement('h2'); title.textContent = correct ? statsCopy('✓ Verband gevonden', '✓ Connection found') : statsCopy('Verband niet gevonden', 'Connection not found');
  const equation = document.createElement('p');
  equation.textContent = fmt(result.answers[0]) + ' ' + state.operator + ' ' + fmt(result.answers[1]) + (correct ? ' = ' : ' ≠ ') + fmt(result.answers[2]);
  connection.append(title, equation);
  if (!correct) {
    const solution = validConnections(answers)[0];
    const [a, b, c] = solution.order.map(i => fmt(answers[i]));
    const reveal = document.createElement('p');
    reveal.textContent = statsCopy('Een geldig verband: ', 'A valid connection: ') + a + ' ' + solution.operator + ' ' + b + ' = ' + c;
    connection.append(reveal);
  }
  document.getElementById('bkQuestionList').prepend(connection);
  feedback.textContent = '';
  document.getElementById('connectionHint').hidden = true;
  document.getElementById('connectionSkip').hidden = true;
  document.getElementById('bkSubmitButton').textContent = state.index + 1 < connectionPool.length ? statsCopy('Volgende puzzel →', 'Next puzzle →') : statsCopy('Alle puzzels →', 'All puzzles →');
  if (result.exact) launchConfetti();
  document.getElementById('breinkrakersScreen').scrollTop = 0;
}

// Oude routes en integraties blijven werken, zonder de oude vier-vragenmodus te laden.
function openBreinkrakers() { openConnection(); }
function closeBreinkrakers() { showScreen('home'); }
function renderBreinkrakersStart() { renderConnectionStart(); }
function startBreinkrakers(index) { startConnection(index); }
function submitBreinkrakers() { submitConnection(); }
