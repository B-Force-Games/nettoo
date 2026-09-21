// Drie bestaande vragen, zonder de oorspronkelijke volgorde of operator prijs te geven.
const CONNECTION_PROGRESS_KEY = 'netto_connection_progress';
const connectionOperators = ['+', '−', '×', '÷'];
let connectionPool = [];
let connectionState = null;

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
    const controls = document.createElement('div');
    controls.className = 'connection-card-controls';
    const position = document.createElement('span');
    position.className = 'connection-position';
    controls.append(position);
    [-1, 1].forEach(direction => {
      const move = document.createElement('button');
      move.type = 'button'; move.textContent = direction < 0 ? '↑' : '↓';
      move.dataset.move = direction;
      move.setAttribute('aria-label', direction < 0 ? statsCopy('Vraag omhoog', 'Move question up') : statsCopy('Vraag omlaag', 'Move question down'));
      move.onclick = () => moveConnection(i, direction);
      controls.append(move);
    });
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
    wrapper.append(input); card.append(controls, question, wrapper);
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
    card.querySelector('[data-move="-1"]').disabled = index === 0;
    card.querySelector('[data-move="1"]').disabled = index === 2;
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
  (card.querySelector('[data-move="' + direction + '"]:not(:disabled)') || card.querySelector('button:not(:disabled)')).focus();
  document.getElementById('bkFeedback').textContent = statsCopy('Vraag verplaatst naar positie ', 'Question moved to position ') + (target + 1) + '.';
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
  equation.textContent = result.answers.map(fmt).join(' ').trim();
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
  document.getElementById('bkPuzzleLabel').scrollIntoView({ block: 'start' });
}

// Oude routes en integraties blijven werken, zonder de oude vier-vragenmodus te laden.
function openBreinkrakers() { openConnection(); }
function closeBreinkrakers() { showScreen('home'); }
function renderBreinkrakersStart() { renderConnectionStart(); }
function startBreinkrakers(index) { startConnection(index); }
function submitBreinkrakers() { submitConnection(); }
