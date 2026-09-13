// Netto frontend module.
// Loaded as a classic script so the existing shared global scope stays intact.

// =========================================================================
  // REKENMACHINE
  // =========================================================================
  let calculatorExpression = '';
  const CALC_OPENED_KEY = 'netto_calc_opened';
  function nettoNumberLocale() { return window.NettoI18n?.locale() === 'nl' ? 'nl-NL' : 'en-GB'; }
  function toggleCalculator(open) {
    const calc = document.getElementById('calculator');
    calc.classList.toggle('open', open);
    if (open) {
      localStorage.setItem(CALC_OPENED_KEY, '1');
      updateCalculatorToggleLabel();
    }
  }
  // Label alleen tonen zolang de rekenmachine nog nooit geopend is; daarna alleen het icoon.
  function updateCalculatorToggleLabel() {
    const label = document.querySelector('.calculator-toggle-label');
    if (label) label.style.display = localStorage.getItem(CALC_OPENED_KEY) ? 'none' : 'inline';
    const toggle = document.querySelector('.calculator-toggle');
    if (toggle) toggle.style.padding = localStorage.getItem(CALC_OPENED_KEY) ? '10px' : '10px 18px';
  }
  function formatCalculatorNumber(value) {
    if (!value || value === 'Fout' || value === 'Error') return value || '0';
    return value.replace(/\d+(?:\.\d+)?/g, (part) => {
      const [whole, decimal] = part.split('.');
      const formatted = Number(whole).toLocaleString(nettoNumberLocale());
      const separator = window.NettoI18n?.locale() === 'nl' ? ',' : '.';
      return decimal === undefined ? formatted : `${formatted}${separator}${decimal}`;
    });
  }

  function updateCalculatorDisplay() {
    document.getElementById('calculatorDisplay').value = formatCalculatorNumber(calculatorExpression) || '0';
  }

  function calculatorInput(value) {
    if (calculatorExpression === '0' && /\d/.test(value)) calculatorExpression = '';
    calculatorExpression += value;
    updateCalculatorDisplay();
  }
  function calculatorClear() {
    calculatorExpression = '';
    updateCalculatorDisplay();
  }
  function calculatorBackspace() {
    calculatorExpression = calculatorExpression.slice(0, -1);
    updateCalculatorDisplay();
  }
  function calculatorEvaluate() {
    try {
      const expression = calculatorExpression.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
      if (!/^[0-9+*/().\s-]+$/.test(expression)) throw new Error('Ongeldige berekening');
      const result = Function(`"use strict"; return (${expression})`)();
      if (!Number.isFinite(result)) throw new Error('Ongeldige uitkomst');
      calculatorExpression = String(Number(result.toFixed(10)));
      updateCalculatorDisplay();
    } catch (error) {
      document.getElementById('calculatorDisplay').value = window.NettoI18n?.locale() === 'nl' ? 'Fout' : 'Error';
      calculatorExpression = '';
    }
  }

  // =========================================================================
  // 1. CONFIGURATIE & SUPABASE SETUP
  // =========================================================================
  // Vul hier je Supabase gegevens in zodra je die hebt:
  const SUPABASE_URL = "https://bqatnnouxkjdzvvhqbly.supabase.co"; 
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxYXRubm91eGtqZHp2dmhxYmx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4MzMwMDAsImV4cCI6MjEwMzQwOTAwMH0.KtjxuC3gyixJjQqKpwPd1b7wzg0VPbm-_EgeUc9iZAI"; 
  
  // Waar de speler het spel op dit moment heeft openstaan, zonder #fragment of
  // zoekparameters. De bevestigingsmail en de wachtwoord-resetmail sturen de
  // speler hierheen terug.
  //
  // Zonder dit valt Supabase terug op de Site URL van het project, en die staat
  // op één adres tegelijk. Draait het spel dan ergens anders — localhost, een
  // testadres, een eigen domein naast het GitHub-adres — dan komt iedereen die
  // zich aanmeldt op een dood linkje uit. Het adres meesturen laat de mail
  // meegroeien met waar het spel echt draait.
  //
  // Let op: Supabase accepteert alleen adressen die in de projectinstellingen
  // bij Redirect URLs staan. Wat daar niet in staat wordt genegeerd, dus een
  // nieuw adres moet daar één keer worden toegevoegd.
  // Het adres dat in gedeelde scores terechtkomt.
  //
  // Hier stond hard "https://netto.game". Dat is niet waar het spel draait, dus
  // iedereen die zijn score deelde stuurde zijn vrienden naar een adres dat
  // niets teruggeeft. Nu volgt de link waar je op dat moment speelt, zodat hij
  // meeverhuist als het spel ooit een eigen domein krijgt.
  //
  // Speel je lokaal, dan heeft je vriend niets aan http://127.0.0.1; in dat
  // geval valt hij terug op het gepubliceerde adres.
  const GEPUBLICEERD = 'https://berend-wt.github.io/nettoo/';
  function speelAdres() {
    try {
      const u = new URL(window.location.href);
      const lokaal = u.protocol === 'file:'
        || u.hostname === 'localhost' || u.hostname === '127.0.0.1'
        || u.hostname === '0.0.0.0' || u.hostname === '[::1]';
      return lokaal ? GEPUBLICEERD : u.origin + u.pathname;
    } catch (_) {
      return GEPUBLICEERD;
    }
  }

  function eigenAdres() {
    try {
      const u = new URL(window.location.href);
      return u.origin + u.pathname;
    } catch (_) {
      return undefined;   // undefined laat Supabase zijn eigen Site URL kiezen
    }
  }

  let supabaseClient = null;
  function initSupabaseClient() {
    if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  }
  initSupabaseClient();
  if (!supabaseClient && window.supabase) initSupabaseClient();
  // De supabase-library laadt met defer, dus bij het uitvoeren van dit bestand
  // bestaat window.supabase nog niet en blijft supabaseClient null. Alles wat de
  // database nodig heeft moet daarom wachten tot 'load'; anders stapt het stil
  // uit en lijkt er niets aan de hand.
  window.addEventListener('load', () => {
    initSupabaseClient();
    if (supabaseClient) {
      syncDailiesFromSupabase();
    } else {
      // Geen verbinding: de statische set is het eindantwoord, dus vanaf nu
      // mag er wel geoordeeld worden over een ontbrekende daily.
      dailySyncAfgerond = true;
      renderHomeDailyPreview();
    }
    bewaakDagwissel();
  });

  // Sessie-sync: log uit op apparaat A = ook uitgelogd op apparaat B,
  // en herstel de ingelogde gebruiker bij paginalading.
  function initAuthStateListener() {
    if (!supabaseClient || supabaseClient._authListenerSet) return;
    supabaseClient._authListenerSet = true;
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        if (currentUser) {
          currentUser = null;
          localStorage.removeItem('netto_user');
          updateUserUI();
        }
        return;
      }
      if (event === 'SIGNED_IN' && session?.user && !currentUser) {
        const u = session.user;
        currentUser = {
          id: u.id,
          email: u.email,
          username: u.user_metadata?.username || (u.email || '').split('@')[0]
        };
        localStorage.setItem('netto_user', JSON.stringify(currentUser));
        updateUserUI();
        stuurLokaleScoresOp();
        laadLeaderboardZichtbaar();
      }
    });
  }
  initAuthStateListener();
  window.addEventListener('load', initAuthStateListener);

  // Datum & Actuele Dagpuzzels (12 Geverifieerde, niet-overlappende puzzels!)
  // ===== Welke dag is het voor Netto? =====
  // Een nieuwe daily komt vrij om 12:00 Londense tijd, niet om middernacht.
  // Twaalf uur terugrekenen vanaf de Londense klok geeft precies dat
  // omslagpunt, en klopt vanzelf rond zomer- en wintertijd.
  // De RLS-policy op de puzzles-tabel rekent exact hetzelfde; wijkt dit af, dan
  // vraagt de client een datum op die de database nog verbergt.
  function nettoDagSleutel(moment = new Date()) {
    const delen = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    }).formatToParts(moment).reduce((acc, deel) => {
      acc[deel.type] = deel.value;
      return acc;
    }, {});
    const dag = new Date(Date.UTC(Number(delen.year), Number(delen.month) - 1, Number(delen.day)));
    // Voor 12:00 Londense tijd loopt de daily van gisteren nog.
    if (Number(delen.hour) < 12) dag.setUTCDate(dag.getUTCDate() - 1);
    return dag.toISOString().slice(0, 10);
  }

  // Geen const: bij de vrijgave om 12:00 Londense tijd schuift dit door zonder
  // dat de speler de pagina hoeft te verversen. Zie bewaakDagwissel().
  let TODAY_STR = nettoDagSleutel();
  
  const LIBRARY_SETS = {
    easy: [
      { name:'Kleine basis', operator:'×', q1_label:'Hoeveel officiële talen erkent de VN?', q1_answer:6, q2_label:'Hoeveel planeten telt ons zonnestelsel?', q2_answer:8, q3_label:'Wat is 6 × 8?', q3_answer:48 },
      { name:'Kaarten & cijfers', operator:'−', q1_label:'Hoeveel speelkaarten zitten in een standaard kaartspel?', q1_answer:52, q2_label:'Hoeveel staten telt de VS?', q2_answer:50, q3_label:'Wat is het verschil?', q3_answer:2 }
    ],
    intermediate: [
      { name:'Mens & muziek', operator:'×', q1_label:'Hoeveel ribben heeft een mens?', q1_answer:24, q2_label:'Hoeveel spelers staan per team in waterpolo?', q2_answer:7, q3_label:'Hoeveel stippen staan op dominostenen?', q3_answer:168 },
      { name:'Sport & ruimte', operator:'×', q1_label:'Hoeveel holes telt een golfronde?', q1_answer:18, q2_label:'Hoeveel chromosomen heeft een menselijke cel?', q2_answer:46, q3_label:'Hoe hoog is de Burj Khalifa?', q3_answer:828 }
    ],
    hard: [
      { name:'Wereldmaten', operator:'×', q1_label:'Hoe hoog is de Eiffeltoren?', q1_answer:330, q2_label:'Op welke hoogte draait het ISS?', q2_answer:400, q3_label:'Capaciteit Narendra Modi Stadium?', q3_answer:132000 },
      { name:'Licht & menigte', operator:'÷', q1_label:'Wat is de snelheid van het licht in km/s?', q1_answer:300000, q2_label:'Hoeveel toeschouwers konden in het Colosseum?', q2_answer:50000, q3_label:'Hoeveel officiële talen erkent de VN?', q3_answer:6 }
    ],
    'extremely-hard': [
      { name:'Eilandrekensom', operator:'×', q1_label:'Hoeveel eilanden telt de Filipijnen?', q1_answer:7641, q2_label:'Hoeveel strepen heeft de Amerikaanse vlag?', q2_answer:13, q3_label:'Capaciteit Camp Nou?', q3_answer:99354 },
      { name:'Tijd & afstand', operator:'×', q1_label:'Hoeveel afleveringen heeft The Office US?', q1_answer:201, q2_label:'In welk jaar zonk de Titanic?', q2_answer:1912, q3_label:'Afstand aarde-maan in km?', q3_answer:384400 }
    ]
  };

  const PUZZLE_ARCHIVE = [
    {
      number: 1,
      name: "LEGO & De Vlag",
      operator: "×",
      q1_label: "1. Hoeveel staten telt de Verenigde Staten van Amerika?",
      q1_answer: 50,
      q2_label: "2. Hoeveel letters telt ons Latijnse alfabet?",
      q2_answer: 26,
      q3_label: "3. Hoeveel LEGO-steentjes worden er wereldwijd per seconde gemaakt?",
      q3_answer: 1300
    },
    {
      number: 2,
      name: "Torenhoge Muren",
      operator: "+",
      q1_label: "1. Hoeveel inwoners heeft Vaticaanstad ongeveer?",
      q1_answer: 800,
      q2_label: "2. Hoeveel jaar stond de Berlijnse Muur overeind (1961-1989)?",
      q2_answer: 28,
      q3_label: "3. Wat is de hoogte van de Burj Khalifa in Dubai in meters?",
      q3_answer: 828
    },
    {
      number: 3,
      name: "Van Dom naar de Maan",
      operator: "+",
      q1_label: "1. Hoeveel treden telt de Domtoren in Utrecht?",
      q1_answer: 465,
      q2_label: "2. Hoeveel uren duurde de historische Apollo 11-missie naar de maan?",
      q2_answer: 195,
      q3_label: "3. Hoeveel duizend inwoners heeft het land Luxemburg (afgerond)?",
      q3_answer: 660
    },
    {
      number: 4,
      name: "Roadtrip naar Parijs",
      operator: "+",
      q1_label: "1. Hoeveel seizoenen heeft de serie Friends?",
      q1_answer: 10,
      q2_label: "2. Hoeveel vel papier zitten er in een standaard riem printpapier?",
      q2_answer: 500,
      q3_label: "3. Wat is de autorij-afstand van Amsterdam naar Parijs in km?",
      q3_answer: 510
    },
    {
      number: 5,
      name: "Parijs & Fawlty Towers",
      operator: "+",
      q1_label: "1. Hoeveel afleveringen telt de komedieserie Fawlty Towers?",
      q1_answer: 12,
      q2_label: "2. Wat is de hoogte van de Eiffeltoren in meters (met antenne)?",
      q2_answer: 330,
      q3_label: "3. Hoeveel officiële gemeenten telt Nederland (in 2024)?",
      q3_answer: 342
    },
    {
      number: 6,
      name: "Euromast & Tour de France",
      operator: "+",
      q1_label: "1. Hoe hoog is de Euromast in Rotterdam in meters?",
      q1_answer: 185,
      q2_label: "2. Hoeveel etappes telt de Tour de France doorgaans?",
      q2_answer: 21,
      q3_label: "3. Hoeveel botten heeft een volwassen menselijk lichaam?",
      q3_answer: 206
    },
    {
      number: 7,
      name: "Pianotoetsen & Hartslag",
      operator: "+",
      q1_label: "1. Hoeveel onafhankelijke landen telt Zuid-Amerika?",
      q1_answer: 12,
      q2_label: "2. Hoeveel toetsen heeft een standaard concertpiano (zwart + wit)?",
      q2_answer: 88,
      q3_label: "3. Hoeveel duizend keer klopt een mensenhart per dag (bij rust)?",
      q3_answer: 100
    },
    {
      number: 8,
      name: "Afsluitdijk & Schaakmat",
      operator: "+",
      q1_label: "1. Hoeveel tanden heeft een volwassen mens (met verstandskiezen)?",
      q1_answer: 32,
      q2_label: "2. Hoe lang is de Afsluitdijk in kilometers (afgerond)?",
      q2_answer: 32,
      q3_label: "3. Hoeveel speelvelden heeft een schaakbord?",
      q3_answer: 64
    },
    {
      number: 9,
      name: "James Bond & De Harp",
      operator: "+",
      q1_label: "1. In hoeveel officiële 007-films speelde Roger Moore?",
      q1_answer: 7,
      q2_label: "2. Hoeveel snaren heeft een standaard concert-pedaalharp?",
      q2_answer: 47,
      q3_label: "3. Hoeveel erkende landen telt het continent Afrika?",
      q3_answer: 54
    },
    {
      number: 10,
      name: "Scrabble & Cellen",
      operator: "+",
      q1_label: "1. Hoeveel punten is de letter Z waard in de Nederlandse Scrabble?",
      q1_answer: 6,
      q2_label: "2. Hoeveel chromosomen telt een gezonde menselijke lichaamscel?",
      q2_answer: 46,
      q3_label: "3. Hoeveel witte toetsen heeft een concertpiano?",
      q3_answer: 52
    },
    {
      number: 11,
      name: "Titanic & The Simpsons",
      operator: "+",
      q1_label: "1. Hoeveel Oscars won de kaskraker Titanic (1997)?",
      q1_answer: 11,
      q2_label: "2. Hoeveel ribben heeft een menselijk lichaam in totaal (12 paar)?",
      q2_answer: 24,
      q3_label: "3. Hoeveel seizoenen telt The Simpsons inmiddels (afgerond)?",
      q3_answer: 35
    },
    {
      number: 12,
      name: "Dartbord naar Rome",
      operator: "+",
      q1_label: "1. Hoeveel genummerde scorevakken heeft een dartbord?",
      q1_answer: 20,
      q2_label: "2. Wat is de autorij-afstand van Amsterdam naar Rome in km?",
      q2_answer: 1650,
      q3_label: "3. Hoeveel treden telt de Eiffeltoren naar de top?",
      q3_answer: 1665
    }
  ];

  // Huidig actieve puzzel (standaard Puzzel #01 van vandaag)
  function normalizeLibraryPuzzle(p) {
    return {
      ...p,
      q1_label: p.q1_label || p.q1,
      q1_answer: p.q1_answer ?? p.a1,
      q2_label: p.q2_label || p.q2,
      q2_answer: p.q2_answer ?? p.a2,
      q3_label: p.q3_label || p.q3,
      q3_answer: p.q3_answer ?? p.a3
    };
  }

  let activePuzzleIndex = 0;
  const REBUILT_DATA = window.NETTO_REBUILT_PUZZLES || { library: [], daily: [], reserve: [] };
  // De statische set blijft de basis: het spel moet werken zonder database.
  const STATIC_DAILIES = (REBUILT_DATA.daily || []).map(normalizeLibraryPuzzle);
  let DAILY_PUZZLES = STATIC_DAILIES;
  let PUZZLE_DATA = DAILY_PUZZLES[activePuzzleIndex] || PUZZLE_ARCHIVE[0];

  // ===== Ingeplande dailies uit Supabase =====
  // Het adminscherm plant dailies in de puzzles-tabel. Die worden hier over de
  // statische set heen gelegd, maar pas nadat de pagina al draait: een trage of
  // onbereikbare database mag het laden nooit blokkeren. Mislukt de sync, dan
  // blijft simpelweg de statische set staan.

  // De statische set loopt aaneengesloten door (nr. 35 = 2026-09-04), dus nieuwe
  // dailies tellen daarop door. Zo blijven nummers stabiel en verschuift de
  // geschiedenis niet als er iets bijkomt.
  const DAILY_NUMBER_REF = STATIC_DAILIES.find(p => p.date && p.number) || null;

  function dailyNumberForDate(dateStr) {
    if (!DAILY_NUMBER_REF || !dateStr) return null;
    const days = Math.round((Date.parse(dateStr) - Date.parse(DAILY_NUMBER_REF.date)) / 86400000);
    return Number.isFinite(days) ? DAILY_NUMBER_REF.number + days : null;
  }

  function mapDbDaily(row) {
    return normalizeLibraryPuzzle({
      id: row.id,
      operator: row.operator || '×',
      q1_label: row.question_1,
      q1_answer: row.true_answer_1,
      q2_label: row.question_2,
      q2_answer: row.true_answer_2,
      q3_label: row.question_3,
      q3_answer: row.true_answer_3,
      date: row.scheduled_date,
      image_path: row.image_path,
      image_alt: row.image_alt,
      image_caption: row.image_caption,
      image_credit: row.image_credit,
      image_source_url: row.image_source_url,
    });
  }

  function mergeDailies(dbDailies) {
    const byDate = new Map();
    const dateless = [];
    for (const puzzle of STATIC_DAILIES) {
      if (puzzle.date) byDate.set(puzzle.date, puzzle); else dateless.push(puzzle);
    }
    // Database wint van de statische set op dezelfde datum.
    for (const puzzle of dbDailies) if (puzzle.date) byDate.set(puzzle.date, puzzle);
    const merged = [...byDate.values()].map(puzzle => {
      if (puzzle.number) return puzzle;
      const number = dailyNumberForDate(puzzle.date);
      return { ...puzzle, number, name: puzzle.name || (number ? `Daily #${number}` : 'Daily') };
    });
    merged.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return merged.concat(dateless);
  }

  let dailySyncGedaan = false;
  // Apart van dailySyncGedaan: die vlag gaat aan bij de start van de sync om
  // dubbel ophalen te voorkomen. Deze gaat pas aan als het antwoord binnen is.
  let dailySyncAfgerond = false;

  // ===== Vrijgave oppikken zonder verversen =====
  // Wie de pagina om 11:55 opent en om 12:05 nog openheeft, hoort de nieuwe
  // daily te krijgen. Elke minuut kijken is simpeler dan uitrekenen hoeveel
  // milliseconden het nog duurt, en het herstelt zichzelf nadat een laptop uit
  // slaapstand komt — dan is een timer allang verlopen.
  function bewaakDagwissel() {
    const opnieuwControleren = () => {
      const nieuweSleutel = nettoDagSleutel();
      if (nieuweSleutel === TODAY_STR) return;
      TODAY_STR = nieuweSleutel;
      dailySyncGedaan = false;
      dailySyncAfgerond = false;
      syncDailiesFromSupabase();
    };
    setInterval(opnieuwControleren, 60000);
    // Een achtergrondtab krijgt getemperde timers; bij terugkeer meteen kijken.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) opnieuwControleren();
    });
    window.addEventListener('focus', opnieuwControleren);
  }

  async function syncDailiesFromSupabase() {
    // Wordt zowel vanuit initApp als vanuit de load-listener aangeroepen; alleen
    // die tweede heeft doorgaans een client. Eén keer ophalen is genoeg.
    if (!supabaseClient || dailySyncGedaan) return;
    dailySyncGedaan = true;
    try {
      const { data, error } = await supabaseClient
        .from('puzzles')
        .select('id, question_1, question_2, question_3, operator, true_answer_1, true_answer_2, true_answer_3, scheduled_date, image_path, image_alt, image_caption, image_credit, image_source_url')
        .eq('status', 'scheduled')
        .lte('scheduled_date', TODAY_STR)
        .order('scheduled_date', { ascending: false });
      // Ontbreekt question_3 nog (migratie niet gedraaid), dan faalt de select
      // en houden we gewoon de statische set aan. Wel loggen: anders is een
      // kapotte query niet te onderscheiden van "nog niets ingepland".
      if (error) {
        console.warn('Daily-sync mislukt, statische set blijft actief:', error.message || error);
        dailySyncAfgerond = true;
        renderHomeDailyPreview();
        return;
      }
      dailySyncAfgerond = true;
      if (!Array.isArray(data) || !data.length) { renderHomeDailyPreview(); return; }

      const previousId = DAILY_PUZZLES[0]?.id;
      DAILY_PUZZLES = mergeDailies(data.map(mapDbDaily));

      // Alleen de actieve puzzel omwisselen als de speler er niet in zit;
      // midden in een ingevulde puzzel de vragen vervangen is onacceptabel.
      const playing = document.getElementById('screen-puzzle')?.classList.contains('active');
      if (!playing && !dailyArchivePuzzleView && activePuzzleIndex === 0
          && DAILY_PUZZLES[0] && DAILY_PUZZLES[0].id !== previousId) {
        PUZZLE_DATA = DAILY_PUZZLES[0];
        if (typeof loadActivePuzzle === 'function') loadActivePuzzle();
      }
      renderHomeDailyPreview();
    } catch (err) {
      console.warn('Daily-sync overgeslagen, statische set blijft actief:', err);
      dailySyncAfgerond = true;
      renderHomeDailyPreview();
    }
  }

  // Sarcastische citaten als iemand letters invoert
  const SARCASTIC_QUOTES = [
    "Woorden hebben hier geen waarde. Cijfers wel.",
    "Leuk geprobeerd Shakespeare, maar we zoeken een getal.",
    "Dit is geen Scrabble. Alleen nummers!",
    "Wiskundigen huilen als je letters in een schatting typt.",
    "Letters? Daar koop je bij de kassa niks voor.",
    "Error 404: Geen getal gevonden in je essay.",
    "Probeer je een formule in dichtvorm te schrijven?",
    "Alleen cijfers graag! Nummers liegen nooit."
  ];

  let lastToastTime = 0;
  let authMode = 'login'; // 'login' of 'register'
  let currentUser = null;
  let currentLbTab = 'today';
  let leaderboardSelectedDate = TODAY_STR;
  let leaderboardRequestId = 0;
  let streakCalendarDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  // De Daily Archive gebruikt dezelfde kaart als de puzzel, maar wisselt na
  // indienen naar een aparte resultatenstaat. Zo blijven vragen en review
  // overzichtelijk en kunnen spelers met de pijlen tussen beide states gaan.
  let dailyArchivePuzzleView = false;
  let dailyReviewView = 'questions';

  // =========================================================================
  // 2. INITIALISATIE & LOCALSTORAGE SYNC
  // =========================================================================
  // Consistente nummering: Nr. 001, Nr. 028, Nr. 142 (3 cijfers)
  const puzzleNr = n => `Nr. ${String(n).padStart(3, '0')}`;

  const DAILY_CATEGORY_ICON_KEYS = Object.freeze({
    'Biologie & gezondheid': 'health',
    'Boeken en literatuur': 'book',
    'Dagelijks leven': 'home',
    'Dieren': 'animal',
    'Eten & drinken': 'food',
    'Films en series': 'film',
    'Filosofie, psychologie en religie': 'idea',
    'Gebouwen en infrastructuur': 'building',
    'Geografie': 'globe',
    'Geschiedenis': 'history',
    'Kunst en cultuur': 'art',
    'Landbouw en industrie': 'industry',
    'Milieu en duurzaamheid': 'leaf',
    'Muziek': 'music',
    'Natuurkunde': 'atom',
    'Politiek en recht': 'law',
    'Records en vergelijkingen': 'chart',
    'Scheikunde': 'chemistry',
    'Spellen en speelgoed': 'game',
    'Sport': 'sport',
    'Sterrenkunde & ruimte': 'space',
    'Taal': 'language',
    'Technologie': 'technology',
    'Vervoer': 'transport',
    'Wiskunde': 'math',
    'Economie & geld': 'chart',
    'Merken en producten': 'industry',
    'Mode en lifestyle': 'art',
    'Reizen en toerisme': 'map'
  });

  const DAILY_CATEGORY_ICON_DRAWINGS = Object.freeze({
    animal: '<circle cx="8" cy="8" r="2"/><circle cx="16" cy="8" r="2"/><circle cx="5.5" cy="13" r="1.6"/><circle cx="18.5" cy="13" r="1.6"/><path d="M8 18c0-2.4 1.8-4 4-4s4 1.6 4 4c0 1.5-1.1 2.5-2.5 2.5-.7 0-1.1-.3-1.5-.7-.4.4-.8.7-1.5.7C9.1 20.5 8 19.5 8 18Z"/>',
    art: '<path d="M12 3a9 9 0 1 0 0 18h1.2a1.8 1.8 0 0 0 0-3.6h-.8a1.8 1.8 0 0 1 0-3.6H15A6 6 0 0 0 21 8c0-3.3-4-5-9-5Z"/><circle cx="7.5" cy="10" r="1"/><circle cx="10" cy="6.8" r="1"/><circle cx="15" cy="7" r="1"/>',
    atom: '<circle cx="12" cy="12" r="1.4"/><ellipse cx="12" cy="12" rx="9" ry="3.7"/><ellipse cx="12" cy="12" rx="9" ry="3.7" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.7" transform="rotate(120 12 12)"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22V5.5ZM20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5A2.5 2.5 0 0 1 20 22V5.5Z"/>',
    building: '<path d="M4 21V7l8-4 8 4v14M8 10h2M14 10h2M8 14h2M14 14h2M10 21v-3h4v3"/>',
    chart: '<path d="M4 20V5M4 20h16M7 16l4-5 3 2 5-7"/><path d="m16 6 3-.5.5 3"/>',
    chemistry: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3M7.5 16h9"/>',
    film: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M7 3l2 3M13 3l2 3M19 3l2 3"/>',
    flag: '<path d="M5 21V4M5 5h12l-2 4 2 4H5"/>',
    food: '<path d="M6 3v7M3.5 3v4A3.5 3.5 0 0 0 7 10.5V21M11 3v18M11 11h4V7a4 4 0 0 0-4-4Z"/>',
    game: '<rect x="3" y="5" width="18" height="14" rx="5"/><path d="M8 9v6M5 12h6M16 10h.01M18 14h.01"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
    health: '<path d="M20.8 5.8a5.5 5.5 0 0 0-8.8-.9 5.5 5.5 0 0 0-8.8.9C.7 10 4.2 15.1 12 21c7.8-5.9 11.3-11 8.8-15.2Z"/><path d="M7 12h3l1.4-3 2 6 1.2-3H18"/>',
    history: '<path d="M7 3h10M7 21h10M8 3c0 4.5 1.2 6.1 4 9-2.8 2.9-4 4.5-4 9M16 3c0 4.5-1.2 6.1-4 9 2.8 2.9 4 4.5 4 9"/>',
    home: '<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',
    idea: '<path d="M9 18h6M10 22h4M8.2 14.5A7 7 0 1 1 15.8 14.5C14.7 15.3 14 16 14 18h-4c0-2-.7-2.7-1.8-3.5Z"/>',
    industry: '<path d="M3 21V9l6 3V8l6 4V5h6v16H3ZM7 16h2M12 16h2M17 16h2"/>',
    language: '<path d="M4 5h10v10H8l-4 4V5ZM10 19h10V9h-3"/><path d="M7 9h4M9 7v4M14 13h3"/>',
    law: '<path d="M3 21h18M5 18h14M7 18V9M12 18V9M17 18V9M4 8h16L12 3 4 8Z"/>',
    leaf: '<path d="M20 4C11 4 5 8 5 15c0 3 2 5 5 5 7 0 10-7 10-16Z"/><path d="M4 21c3-6 7-9 12-12"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15M15 6v15"/>',
    math: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
    music: '<path d="M9 18V6l10-2v12M9 10l10-2"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
    space: '<path d="M8 17c-3.5 1-5.5.4-5.8-.7-.5-1.8 3.8-4.8 9.6-6.7s11-2 11.5-.2c.3 1.1-1.1 2.7-3.7 4.2"/><circle cx="13" cy="12" r="7"/>',
    sport: '<circle cx="12" cy="12" r="9"/><path d="m8.5 4.5 1.4 4.2 4.4.1 1.3-4.2M3.4 10.2l3.5 2.6-1.3 4.3M18.5 17l-1.3-4.2 3.5-2.6M8 20l4-2.5 4 2.5M9.9 8.7l-3 4.1L12 17.5l5.2-4.7-2.9-4Z"/>',
    technology: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3M10 10h4v4h-4z"/>',
    transport: '<path d="M5 17h14l-1-6a3 3 0 0 0-3-2H9a3 3 0 0 0-3 2l-1 6ZM7 9l2-4h6l2 4M4 14h16M7 17v3M17 17v3"/><circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/>'
  });

  function dailyCategoryIcon(category) {
    const key = DAILY_CATEGORY_ICON_KEYS[category] || 'idea';
    const drawing = DAILY_CATEGORY_ICON_DRAWINGS[key] || DAILY_CATEGORY_ICON_DRAWINGS.idea;
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawing}</svg>`;
  }

  // Een daily uit de database heeft geen categorieën: die kolom bestaat niet in
  // de puzzles-tabel. De iconen bleven daardoor op hun placeholder staan zodra
  // de daily uit Supabase kwam. Ze zijn wel af te leiden uit de vraagtekst,
  // want dezelfde vragen staan met categorie en al in de puzzeldata.
  const VRAAG_CATEGORIE = (() => {
    const kaart = new Map();
    for (const naam of ['daily', 'library', 'reserve']) {
      for (const p of REBUILT_DATA[naam] || []) {
        const cats = Array.isArray(p.categories) ? p.categories : [];
        ['q1', 'q2', 'q3'].forEach((slot, i) => {
          const vraag = (p[`${slot}_label`] || '').trim();
          if (vraag && cats[i] && !kaart.has(vraag)) kaart.set(vraag, cats[i]);
        });
      }
    }
    return kaart;
  })();

  function categorieënVoor(puzzle) {
    if (Array.isArray(puzzle.categories) && puzzle.categories.length) return puzzle.categories;
    return ['q1', 'q2', 'q3']
      .map(slot => VRAAG_CATEGORIE.get((puzzle[`${slot}_label`] || '').trim()))
      .filter(Boolean);
  }

  function datumInWoorden(isoDatum) {
    if (!isoDatum) return '';
    // Middag-UTC zodat de dag niet verspringt door de tijdzone van de speler.
    const d = new Date(`${isoDatum}T12:00:00Z`);
    return Number.isNaN(d.getTime())
      ? isoDatum
      : d.toLocaleDateString(
          window.NettoI18n?.language === 'en' ? 'en-GB' : 'nl-NL',
          { day: 'numeric', month: 'long' }
        );
  }

  function toonVerouderdeDailyMelding(datumVanPuzzel) {
    // De statische set loopt tot 4 september, dus vóór de sync lijkt élke dag
    // een gat. Pas oordelen als de database is geraadpleegd — of als er geen
    // verbinding is, want dan is de statische set het eindantwoord.
    if (!dailySyncAfgerond) return;
    const kaart = document.querySelector('.home-daily-card');
    if (!kaart) return;
    let melding = document.getElementById('dailyVerouderdMelding');
    if (!datumVanPuzzel) {
      if (melding) melding.remove();
      return;
    }
    if (!melding) {
      melding = document.createElement('p');
      melding.id = 'dailyVerouderdMelding';
      melding.className = 'daily-verouderd';
      melding.setAttribute('role', 'status');
      kaart.appendChild(melding);
    }
    const kop = 'De daily van vandaag staat nog niet klaar. Dit is die van';
    const staart = '— je score telt niet mee.';
    melding.textContent = `${window.NettoI18n?.t(kop) || kop} `
      + `${datumInWoorden(datumVanPuzzel)} ${window.NettoI18n?.t(staart) || staart}`;
    console.warn(
      `[Netto] Geen daily ingepland voor ${TODAY_STR}. Nieuwste beschikbare puzzel is ${datumVanPuzzel}. `
      + 'Scores worden niet opgeslagen tot er een daily voor vandaag staat.'
    );
  }


  // Reveal once per daily/category; language and auth rerenders keep it still.
  const dailyCategoryReels = new WeakMap();
  function renderDailyCategoryReel(icon, category, index, dailyKey) {
    const key = dailyKey + ':' + category;
    if (icon.dataset.reelKey === key) return;
    icon.dataset.reelKey = key;
    dailyCategoryReels.get(icon)?.();
    const finalIcon = dailyCategoryIcon(category);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motion.matches || !icon.getClientRects().length || !icon.animate) {
      icon.innerHTML = finalIcon;
      return;
    }
    const choices = Object.keys(DAILY_CATEGORY_ICON_KEYS);
    const steps = 9 + index * 3;
    const sequence = Array.from({ length: steps }, (_, step) =>
      choices[(step * 7 + index * 5) % choices.length]);
    sequence.push(category);
    const track = document.createElement('i');
    track.className = 'home-category-reel';
    track.setAttribute('aria-hidden', 'true');
    track.innerHTML = sequence.map(item =>
      '<i class="home-category-reel-cell">' + dailyCategoryIcon(item) + '</i>'
    ).join('');
    icon.replaceChildren(track);
    const animation = track.animate([
      { transform: 'translateY(0)' },
      { transform: 'translateY(-' + steps * 100 + '%)' }
    ], {
      duration: 1300 + index * 260,
      delay: index * 80,
      easing: 'cubic-bezier(.16,.72,.16,1)',
      fill: 'both'
    });
    const finish = () => {
      animation.onfinish = null;
      animation.cancel();
      motion.removeEventListener('change', finish);
      icon.innerHTML = finalIcon;
      dailyCategoryReels.delete(icon);
    };
    dailyCategoryReels.set(icon, finish);
    animation.onfinish = finish;
    motion.addEventListener('change', finish);
  }

  function renderHomeDailyPreview(puzzle = DAILY_PUZZLES[0] || PUZZLE_DATA) {
    if (!puzzle) return;
    const categories = categorieënVoor(puzzle);
    const operator = puzzle.operator || '×';
    const translatedCategories = categories.map(category => window.NettoI18n?.t(category) || category);
    // Staat er voor vandaag niets ingepland, dan valt de site terug op de
    // nieuwste puzzel die er wél is. Dat gebeurde op 7 september ongemerkt: de
    // speler kreeg die van de 6e voorgeschoteld alsof het de daily van vandaag
    // was, terwijl een score alleen wordt bewaard als de gespeelde puzzel exact
    // die van vandaag is. Spelen leverde dus niets op en het leaderboard bleef
    // leeg. Liever een eerlijke datum dan een stille leugen.
    const isVandaag = !puzzle.date || puzzle.date === TODAY_STR;
    const meta = document.getElementById('heroDateMeta');
    if (meta) {
      const nummer = puzzle.number ? `Daily #${puzzle.number}` : 'Daily';
      meta.textContent = isVandaag ? nummer : `${nummer} · ${datumInWoorden(puzzle.date)}`;
    }
    toonVerouderdeDailyMelding(isVandaag ? null : puzzle.date);
    const operatorElement = document.getElementById('homeDailyOperator');
    if (operatorElement) operatorElement.textContent = operator;
    const equation = document.getElementById('homeDailyEquation');
    if (equation) equation.setAttribute('aria-label', `${translatedCategories[0] || 'A'} ${operator} ${translatedCategories[1] || 'B'} = ${translatedCategories[2] || 'C'}`);
    const card = document.querySelector('.home-daily-card');
    if (card) card.dataset.operator = operator;
    categories.slice(0, 3).forEach((category, index) => {
      const icon = document.getElementById(`homeDailyCategory${index + 1}`);
      if (!icon) return;
      renderDailyCategoryReel(icon, category, index, String(puzzle.date || puzzle.id || puzzle.number || 'daily'));
      icon.title = translatedCategories[index] || category;
      icon.setAttribute('aria-label', translatedCategories[index] || category);
    });
  }

  function initApp() {
    try {
      if (document.getElementById('q1-label')) {
        document.getElementById('q1-label').textContent = PUZZLE_DATA.q1_label;
        document.getElementById('q2-label').textContent = PUZZLE_DATA.q2_label;
        document.getElementById('q3-label').textContent = PUZZLE_DATA.q3_label;
        document.getElementById('operatorBadge').textContent = PUZZLE_DATA.operator || '×';
        document.getElementById('puzzleEyebrow').textContent = `Netto · ${puzzleNr(PUZZLE_DATA.number)}`;
      }
      renderHomeDailyPreview();
      // Bewust niet awaiten: de statische set staat er al, dit is een upgrade.
      syncDailiesFromSupabase();

      // Koppel knoppen expliciet via event listeners
      const btnStart = document.getElementById('btnStartPuzzle');
      if (btnStart) btnStart.onclick = () => {
        dailyArchivePuzzleView = false;
        activePuzzleIndex = 0;
        PUZZLE_DATA = DAILY_PUZZLES[0] || PUZZLE_ARCHIVE[0];
        loadActivePuzzle();
        showScreen('puzzle');
      };

      const btnHamb = document.getElementById('hamburgerBtn');
      if (btnHamb) btnHamb.onclick = toggleMenu;

      const overlay = document.getElementById('overlay');
      if (overlay) overlay.onclick = toggleMenu;

      const btnCheck = document.getElementById('btnCheck');
      if (btnCheck) btnCheck.onclick = checkAnswers;

      const topUserBtn = document.getElementById('topbarUserBtn');
      if (topUserBtn) topUserBtn.onclick = openAuthModal;

      const streakButton = document.getElementById('streakButton');
      if (streakButton) streakButton.onclick = toggleStreakCalendar;
      const statsButton = document.getElementById('statsButton');
      if (statsButton) statsButton.onclick = openStatsModal;
      const streakClose = document.getElementById('streakCalendarClose');
      if (streakClose) streakClose.onclick = closeStreakCalendar;
      const streakPrevious = document.getElementById('streakCalendarPrevious');
      if (streakPrevious) streakPrevious.onclick = () => moveStreakCalendarMonth(-1);
      const streakNext = document.getElementById('streakCalendarNext');
      if (streakNext) streakNext.onclick = () => moveStreakCalendarMonth(1);
      document.addEventListener('click', closeStreakCalendarOnOutsideClick);
      document.addEventListener('keydown', closeStreakCalendarOnEscape);
      document.addEventListener('keydown', closeStatsModalOnEscape);

      initInputs();
      initVraagDetails();
      loadUserProfile();
      applyTheme();
      updateCalculatorToggleLabel();
      if (supabaseClient) supabaseClient.auth.getSession().then(({ data }) => {
        if (data.session?.user) {
          currentUser = { id: data.session.user.id, email: data.session.user.email, username: data.session.user.user_metadata?.username || data.session.user.email.split('@')[0] };
          localStorage.setItem('netto_user', JSON.stringify(currentUser));
          updateUserUI();
          stuurLokaleScoresOp();
          laadLeaderboardZichtbaar();
        }
      });
      checkExistingPlay();
      updateContinuePuzzleButton();
    } catch(err) {
      console.error("Fout tijdens initApp:", err);
    }
  }

  function getLocalPlays() {
    try {
      return JSON.parse(localStorage.getItem('netto_plays')) || {};
    } catch(e) {
      return {};
    }
  }

  function getLocalStreak() {
    return statsTrailingStreak(getDailyStatsEntries().map(entry => entry.date));
  }

  // =========================================================================
  // 2B. DAILY STATISTIEKEN & STREAKS
  // =========================================================================
  const STATS_MAX_STREAK_KEY = 'netto_max_streak';
  const STATS_BUCKETS = [
    { label: '90–100%', englishLabel: '90–100%', emoji: '🟩' },
    { label: '80–89%', englishLabel: '80–89%', emoji: '🟢' },
    { label: '70–79%', englishLabel: '70–79%', emoji: '🟨' },
    { label: '50–69%', englishLabel: '50–69%', emoji: '🟧' },
    { label: '< 50%', englishLabel: '< 50%', emoji: '🟥' }
  ];
  let statsCountdownTimer = null;
  let statsReturnFocus = null;
  let statsMode = 'daily';
  const STATS_MODES = { daily: ['Daily', 'Daily'], puzzles: ['Puzzels', 'Puzzles'], brain: ['Breinkrakers', 'Brain Teasers'], race: ['Puzzelrace', 'Puzzle Race'] };

  function readStatsStorage(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; }
  }

  function getModeStatsSnapshot() {
    if (statsMode === 'daily') return getDailyStatsSnapshot();
    let results = [];
    if (statsMode === 'puzzles') {
      const plays = readStatsStorage('netto_library_plays', {});
      results = libraryPuzzles.map(p => plays[p.id]).filter(Boolean);
    } else if (statsMode === 'brain') {
      const saved = readStatsStorage('netto_breinkrakers_progress', {});
      results = Array.isArray(saved.results) ? saved.results : [];
    } else {
      const saved = readStatsStorage('netto_race_stats', []);
      results = Array.isArray(saved) ? saved : [];
    }
    const entries = results.filter(r => Number.isFinite(Number(r.factor)) && Number(r.factor) >= 1)
      .map(r => ({ ...r, factor: Number(r.factor), accuracy: 100 / Number(r.factor) }));
    const buckets = STATS_BUCKETS.map(() => 0);
    entries.forEach(r => buckets[statsBucketIndex(r.accuracy)]++);
    return { entries, buckets, todayBucket: -1, averageAccuracy: entries.length ? Math.round(entries.reduce((sum,r) => sum+r.accuracy,0)/entries.length) : null };
  }

  function selectStatsMode(mode) {
    if (!STATS_MODES[mode]) return;
    statsMode = mode;
    renderStatsModal();
    renderStatsCountdown();
    document.querySelector(`#statsModes button[data-mode="${mode}"]`)?.focus();
  }

  function statsCopy(dutch, english) {
    return window.NettoI18n?.locale() === 'en' ? english : dutch;
  }

  function safeStatsInteger(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
  }

  function isStatsDateKey(value) {
    if (typeof value !== 'string' || value.length !== 10 || value[4] !== '-' || value[7] !== '-') return false;
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const date = new Date(Date.UTC(year, month - 1, day));
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function statsDateSerial(dateKey) {
    if (!isStatsDateKey(dateKey)) return NaN;
    const [year, month, day] = dateKey.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  }

  function statsDateKeyFromSerial(serial) {
    const date = new Date(serial);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  function getDailyStatsEntries() {
    const plays = getLocalPlays();
    const dailyByNumber = new Map(DAILY_PUZZLES.map(puzzle => [Number(puzzle.number), puzzle.date]));
    const entries = new Map();

    const addEntry = (date, play, priority) => {
      if (!isStatsDateKey(date) || date > TODAY_STR || !play || typeof play !== 'object') return;
      const factor = Number(play.factor);
      if (!Number.isFinite(factor) || factor <= 0) return;
      const existing = entries.get(date);
      if (existing && existing.priority > priority) return;
      entries.set(date, { date, factor, priority });
    };

    Object.entries(plays).forEach(([key, play]) => {
      if (isStatsDateKey(key)) {
        // ISO-date keys are the canonical daily format.
        addEntry(key, play, 2);
        return;
      }
      if (!/^puzzle_\d+$/.test(key)) return;
      const legacyNumber = key.slice('puzzle_'.length);
      const date = dailyByNumber.get(Number(play?.puzzleNumber || legacyNumber));
      // Older versions stored daily results as puzzle_1, puzzle_2, etc.
      addEntry(date, play, 1);
    });

    return Array.from(entries.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(({ date, factor }) => ({ date, factor, accuracy: Math.max(0, Math.min(100, 100 / factor)) }));
  }

  function statsBucketIndex(accuracy) {
    if (accuracy >= 90) return 0;
    if (accuracy >= 80) return 1;
    if (accuracy >= 70) return 2;
    if (accuracy >= 50) return 3;
    return 4;
  }

  function statsLongestStreak(dateKeys) {
    const sorted = Array.from(new Set(dateKeys)).sort();
    let best = 0;
    let current = 0;
    let previous = null;
    sorted.forEach(dateKey => {
      const serial = statsDateSerial(dateKey);
      if (!Number.isFinite(serial)) return;
      current = previous !== null && serial - previous === 86400000 ? current + 1 : 1;
      best = Math.max(best, current);
      previous = serial;
    });
    return best;
  }

  function statsTrailingStreak(dateKeys) {
    const played = new Set(dateKeys);
    let count = 0;
    let serial = statsDateSerial(TODAY_STR);
    // Yesterday's streak remains active until today's opportunity has passed.
    if (!played.has(TODAY_STR)) serial -= 86400000;
    while (played.has(statsDateKeyFromSerial(serial))) {
      count += 1;
      serial -= 86400000;
    }
    return count;
  }

  function updateMaxStreak(currentStreak) {
    const stored = safeStatsInteger(localStorage.getItem(STATS_MAX_STREAK_KEY));
    if (currentStreak > stored) localStorage.setItem(STATS_MAX_STREAK_KEY, String(currentStreak));
  }

  function getDailyStatsSnapshot() {
    const entries = getDailyStatsEntries();
    const dateKeys = entries.map(entry => entry.date);
    const currentStreak = statsTrailingStreak(dateKeys);
    const historicalBest = statsLongestStreak(dateKeys);
    const storedBest = safeStatsInteger(localStorage.getItem(STATS_MAX_STREAK_KEY));
    const bestStreak = Math.max(storedBest, currentStreak, historicalBest);
    if (bestStreak > storedBest) localStorage.setItem(STATS_MAX_STREAK_KEY, String(bestStreak));

    const buckets = STATS_BUCKETS.map(() => 0);
    entries.forEach(entry => { buckets[statsBucketIndex(entry.accuracy)] += 1; });
    const averageAccuracy = entries.length
      ? Math.round(entries.reduce((sum, entry) => sum + entry.accuracy, 0) / entries.length)
      : null;
    const today = entries.find(entry => entry.date === TODAY_STR) || null;

    return { entries, currentStreak, bestStreak, averageAccuracy, buckets, todayBucket: today ? statsBucketIndex(today.accuracy) : -1 };
  }

  function setStatsText(id, dutch, english) {
    const element = document.getElementById(id);
    if (element) element.textContent = statsCopy(dutch, english);
  }

  function renderStatsDistribution(snapshot) {
    const container = document.getElementById('statsDistribution');
    if (!container) return;
    const maxCount = Math.max(...snapshot.buckets, 1);
    const puzzleWord = count => statsCopy(count === 1 ? 'puzzel' : 'puzzels', count === 1 ? 'puzzle' : 'puzzles');
    container.innerHTML = STATS_BUCKETS.map((bucket, index) => {
      const count = snapshot.buckets[index];
      const width = Math.round((count / maxCount) * 100);
      const todayClass = snapshot.todayBucket === index ? ' is-today' : '';
      return `<div class="stats-bar-row${todayClass}" aria-label="${bucket.label}: ${count} ${puzzleWord(count)}"${snapshot.todayBucket === index ? ` title="${statsCopy('Vandaag', 'Today')}"` : ''}>
        <span class="stats-bar-label"><b>${statsCopy(bucket.label, bucket.englishLabel)}</b><small>${count}</small></span>
        <span class="stats-bar-track"><span class="stats-bar-fill stats-bar-fill-${index}" style="width:${width}%"></span></span>
      </div>`;
    }).join('');
  }

  function localMidnightTarget() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  }

  function renderStatsCountdown() {
    const element = document.getElementById('statsCountdown');
    if (!element) return;
    element.hidden = statsMode !== 'daily';
    if (element.hidden) return;
    const nextDay = localDateKey(localMidnightTarget());
    if (!DAILY_PUZZLES.some(puzzle => puzzle.date === nextDay)) {
      element.textContent = statsCopy('Meer spelen? Bekijk het daily-archief.', 'Want to play more? Explore the daily archive.');
      return;
    }
    const remaining = Math.max(0, localMidnightTarget().getTime() - Date.now());
    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    element.innerHTML = `<span>${statsCopy('Volgende dagelijkse puzzel over:', 'Next daily puzzle in:')}</span><strong>${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}</strong>`;
  }

  function startStatsCountdown() {
    if (statsCountdownTimer) clearInterval(statsCountdownTimer);
    renderStatsCountdown();
    statsCountdownTimer = setInterval(renderStatsCountdown, 1000);
  }

  function stopStatsCountdown() {
    if (statsCountdownTimer) clearInterval(statsCountdownTimer);
    statsCountdownTimer = null;
  }

  function renderStatsModal() {
    const snapshot = getModeStatsSnapshot();
    const daily = statsMode === 'daily';
    const eyebrow = document.querySelector('#modalStats .stats-eyebrow');
    if (eyebrow) eyebrow.textContent = `NETTO · ${statsCopy(...STATS_MODES[statsMode]).toUpperCase()}`;
    const modeButtons = document.getElementById('statsModes');
    if (modeButtons) modeButtons.innerHTML = Object.entries(STATS_MODES).map(([mode, labels]) => `<button type="button" data-mode="${mode}" aria-pressed="${mode === statsMode}" onclick="selectStatsMode('${mode}')">${statsCopy(...labels)}</button>`).join('');
    setStatsText('statsTitle', 'Statistieken', 'Statistics');
    setStatsText('statsSubtitle', 'Elke schatting telt. Dit is jouw overzicht.', 'Every estimate counts. Here’s your record.');
    setStatsText('statsPlayedLabel', 'Gespeeld', 'Played');
    setStatsText('statsPlayedHint', 'daily puzzels', 'daily puzzles');
    setStatsText('statsAccuracyLabel', 'Gem. nauwkeurigheid', 'Avg. accuracy');
    setStatsText('statsAccuracyHint', 'gemiddeld', 'average');
    setStatsText('statsCurrentStreakLabel', 'Huidige streak', 'Current streak');
    setStatsText('statsCurrentStreakHint', 'opeenvolgende dagen', 'consecutive days');
    setStatsText('statsBestStreakLabel', 'Beste streak', 'Best streak');
    setStatsText('statsBestStreakHint', 'record', 'record');
    setStatsText('statsDistributionTitle', 'Scoreverdeling', 'Score distribution');
    setStatsText('statsDistributionHint', '• vandaag', '• today');
    setStatsText('statsCalendarButton', 'Streakkalender bekijken', 'View streak calendar');
    setStatsText('statsShareButton', 'Deel statistieken ↗', 'Share statistics ↗');
    if (!daily) {
      setStatsText('statsCurrentStreakLabel', 'Beste nauwkeurigheid', 'Best accuracy');
      setStatsText('statsBestStreakLabel', 'Gem. factor', 'Avg. factor');
      setStatsText('statsDistributionHint', 'per puzzel', 'per puzzle');
    }
    const subtitle = document.getElementById('statsSubtitle');
    if (subtitle) subtitle.textContent = statsMode === 'race'
      ? statsCopy('Ingediende puzzels uit voltooide races. Registratie vanaf nu.', 'Submitted puzzles from finished races. Tracking starts now.')
      : statsCopy('Spot-on = alle antwoorden exact goed.', 'Spot-on = every answer exactly right.');
    const spotOn = snapshot.entries.filter(r => r.exact === undefined ? r.factor === 1 : r.exact === true).length;
    document.getElementById('statsSpotOn').textContent = String(spotOn);
    document.getElementById('statsSpotOnRate').textContent = snapshot.entries.length ? `${Math.round(100 * spotOn / snapshot.entries.length)}%` : '—';
    document.getElementById('statsCalendarButton').hidden = !daily;

    const played = document.getElementById('statsPlayed');
    const accuracy = document.getElementById('statsAccuracy');
    const current = document.getElementById('statsCurrentStreak');
    const best = document.getElementById('statsBestStreak');
    if (played) played.textContent = String(snapshot.entries.length);
    if (accuracy) accuracy.textContent = snapshot.averageAccuracy === null ? '—' : `${snapshot.averageAccuracy}%`;
    if (current) current.textContent = daily ? String(snapshot.currentStreak) : snapshot.entries.length ? `${Math.round(Math.max(...snapshot.entries.map(r=>r.accuracy)))}%` : '—';
    if (best) best.textContent = daily ? String(snapshot.bestStreak) : snapshot.entries.length ? `${(snapshot.entries.reduce((sum,r)=>sum+r.factor,0)/snapshot.entries.length).toFixed(2)}×` : '—';

    const empty = document.getElementById('statsEmpty');
    if (empty) {
      empty.hidden = snapshot.entries.length > 0;
      empty.textContent = statsCopy('Nog geen resultaten in deze spelmodus.', 'No results in this game mode yet.');
    }
    const share = document.getElementById('statsShareButton');
    if (share) {
      share.disabled = snapshot.entries.length === 0;
      share.title = snapshot.entries.length ? '' : statsCopy('Speel eerst een puzzel in deze modus.', 'Play a puzzle in this mode first.');
    }
    renderStatsDistribution(snapshot);
  }

  function openStatsModal() {
    statsReturnFocus = document.activeElement;
    closeMenu();
    closeStreakCalendar();
    renderStatsModal();
    const modal = document.getElementById('modalStats');
    if (!modal) return;
    modal.classList.add('active');
    document.getElementById('statsButton')?.setAttribute('aria-expanded', 'true');
    startStatsCountdown();
    modal.querySelector('.modal-close')?.focus();
  }

  function closeStatsModal() {
    const modal = document.getElementById('modalStats');
    if (modal) modal.classList.remove('active');
    document.getElementById('statsButton')?.setAttribute('aria-expanded', 'false');
    document.getElementById('streakButton')?.setAttribute('aria-expanded', 'false');
    stopStatsCountdown();
    statsReturnFocus?.focus();
    statsReturnFocus = null;
  }

  function closeStatsModalOnEscape(event) {
    const modal = document.getElementById('modalStats');
    if (event.key === 'Tab' && modal?.classList.contains('active')) {
      const buttons = Array.from(modal.querySelectorAll('button:not(:disabled)'));
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    if (event.key === 'Escape' && document.getElementById('modalStats')?.classList.contains('active')) {
      closeStatsModal();
    }
  }

  function openStatsStreakCalendar() {
    closeStatsModal();
    const popover = document.getElementById('streakCalendarPopover');
    const button = document.getElementById('streakButton');
    if (!popover || !button) return;
    popover.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    renderStreakCalendar();
  }

  function shareStats() {
    const snapshot = getModeStatsSnapshot();
    if (!snapshot.entries.length) {
      showNoticeToast(statsCopy('Nog geen resultaten om te delen.', 'No results to share yet.'), '📊');
      return;
    }
    const recent = snapshot.entries.slice(-30);
    const emojis = recent.map(entry => STATS_BUCKETS[statsBucketIndex(entry.accuracy)].emoji);
    const rows = [];
    for (let index = 0; index < emojis.length; index += 10) rows.push(emojis.slice(index, index + 10).join(' '));
    const streakWord = snapshot.currentStreak === 1 ? statsCopy('dag', 'day') : statsCopy('dagen', 'days');
    const text = [
      `Netto 📊 · ${statsCopy(...STATS_MODES[statsMode])}`,
      `${statsCopy('Laatste resultaten', 'Recent results')} (${recent.length})`,
      ...rows,
      ...(statsMode === 'daily' ? [`🔥 ${snapshot.currentStreak} ${streakWord} streak`] : []),
      `🎯 ${snapshot.entries.filter(r => r.exact === undefined ? r.factor === 1 : r.exact === true).length} spot-on`,
      `📈 ${snapshot.averageAccuracy}% ${statsCopy('gemiddelde nauwkeurigheid', 'average accuracy')}`,
      speelAdres()
    ].join('\n');

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showSarcasticToast(statsCopy('Statistieken gekopieerd naar je klembord!', 'Statistics copied to your clipboard!'), true);
      }).catch(() => fallbackPrompt(text));
    } else {
      fallbackPrompt(text);
    }
  }

  function updateStreakUI(streak) {
    document.getElementById('topbarStreak').textContent = streak;
    const streakButton = document.getElementById('streakButton');
    if (streakButton) {
      const action = streakButton.getAttribute('aria-expanded') === 'true' ? statsCopy('Sluit kalender', 'Close calendar') : statsCopy('Open kalender', 'Open calendar');
      streakButton.setAttribute('aria-label', `🔥 ${streak} ${streak === 1 ? 'dag' : 'dagen'} streak. ${action}`);
    }
    const pStreak = document.getElementById('profileStreak');
    if (pStreak) pStreak.textContent = `🔥 Huidige streak: ${streak} ${streak === 1 ? 'dag' : 'dagen'}`;
  }

  function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function getPlayedDailyDates() {
    const dates = new Set();
    const dailyByNumber = new Map(DAILY_PUZZLES.map(puzzle => [Number(puzzle.number), puzzle.date]));
    Object.entries(getLocalPlays()).forEach(([key, play]) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
        dates.add(key);
        return;
      }
      const puzzleDate = dailyByNumber.get(Number(play?.puzzleNumber));
      if (puzzleDate) dates.add(puzzleDate);
    });
    return dates;
  }

  function renderStreakCalendar() {
    const grid = document.getElementById('streakCalendarGrid');
    const monthLabel = document.getElementById('streakCalendarMonth');
    if (!grid || !monthLabel) return;
    const year = streakCalendarDate.getFullYear();
    const month = streakCalendarDate.getMonth();
    const today = new Date();
    const todayKey = localDateKey(today);
    const playedDates = getPlayedDailyDates();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    const cells = Array.from({ length: startOffset }, () => '<span aria-hidden="true"></span>');
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const key = localDateKey(date);
      const played = playedDates.has(key);
      const isToday = key === todayKey;
      const isFuture = date > new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const label = new Intl.DateTimeFormat(nettoNumberLocale(), { weekday:'long', day:'numeric', month:'long', year:'numeric' }).format(date);
      cells.push(`<span class="streak-calendar-day${played ? ' is-played' : ''}${isToday ? ' is-today' : ''}${isFuture ? ' is-future' : ''}" role="gridcell" aria-label="${label}${played ? ', daily gespeeld' : ', niet gespeeld'}" title="${played ? 'Daily gespeeld' : 'Niet gespeeld'}">${day}</span>`);
    }
    monthLabel.textContent = new Intl.DateTimeFormat(nettoNumberLocale(), { month:'long', year:'numeric' }).format(streakCalendarDate);
    grid.innerHTML = cells.join('');
    const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    document.getElementById('streakCalendarNext').disabled = streakCalendarDate >= currentMonth;
  }

  function toggleStreakCalendar(event) {
    event?.stopPropagation();
    const popover = document.getElementById('streakCalendarPopover');
    const button = document.getElementById('streakButton');
    if (!popover || !button) return;
    const opening = popover.hidden;
    popover.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
    const streak = getLocalStreak();
    button.setAttribute('aria-label', `🔥 ${streak}. ${opening ? statsCopy('Sluit kalender', 'Close calendar') : statsCopy('Open kalender', 'Open calendar')}`);
    if (opening) renderStreakCalendar();
  }

  function closeStreakCalendar() {
    const popover = document.getElementById('streakCalendarPopover');
    const button = document.getElementById('streakButton');
    if (!popover || popover.hidden) return;
    popover.hidden = true;
    button?.setAttribute('aria-expanded', 'false');
    const streak = getLocalStreak();
    button?.setAttribute('aria-label', `🔥 ${streak}. ${statsCopy('Open kalender', 'Open calendar')}`);
  }

  function closeStreakCalendarOnOutsideClick(event) {
    const popover = document.getElementById('streakCalendarPopover');
    const button = document.getElementById('streakButton');
    if (!popover || popover.hidden || popover.contains(event.target) || button?.contains(event.target)) return;
    closeStreakCalendar();
  }

  function closeStreakCalendarOnEscape(event) {
    if (event.key !== 'Escape') return;
    const popover = document.getElementById('streakCalendarPopover');
    if (!popover || popover.hidden) return;
    closeStreakCalendar();
    document.getElementById('streakButton')?.focus();
  }

  function moveStreakCalendarMonth(delta) {
    const next = new Date(streakCalendarDate.getFullYear(), streakCalendarDate.getMonth() + delta, 1);
    const today = new Date();
    const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    if (next > currentMonth) return;
    streakCalendarDate = next;
    renderStreakCalendar();
  }

  // =========================================================================
  // 3. LIVE DUIZENDTAL-FORMATTERING & SARCASTISCHE TOASTS
  // =========================================================================
  function formatDutchNumber(str) {
    const isDutch = window.NettoI18n?.locale() === 'nl';
    const decimalMark = isDutch ? ',' : '.';
    const groupMark = isDutch ? '.' : ',';
    const cleanPattern = isDutch ? /[^\d,]/g : /[^\d.]/g;
    let clean = str.replace(cleanPattern, '');
    let parts = clean.split(decimalMark);
    let whole = parts[0].replace(/^0+(?=\d)/, ''); // Remove leading zeros
    if (whole === '') whole = '0';

    let formattedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, groupMark);
    return parts.length > 1 ? `${formattedWhole}${decimalMark}${parts[1].slice(0, 2)}` : formattedWhole;
  }

  function parseFormattedNumber(str) {
    if (!str) return NaN;
    const clean = window.NettoI18n?.locale() === 'nl'
      ? str.replace(/\./g, '').replace(',', '.')
      : str.replace(/,/g, '');
    return parseFloat(clean);
  }

  function showSarcasticToast(msg, isCopy = false) {
    const now = Date.now();
    if (!isCopy && now - lastToastTime < 1800) return; // Voorkom toast-spam
    lastToastTime = now;

    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${isCopy ? 'copy-toast' : ''}`;
    
    if (isCopy) {
      toast.innerHTML = `
        <div class="toast-icon">📋</div>
        <div class="toast-body">
          <b>Gekopieerd!</b>
          <span>${msg}</span>
        </div>
      `;
    } else {
      const quote = msg || SARCASTIC_QUOTES[Math.floor(Math.random() * SARCASTIC_QUOTES.length)];
      toast.innerHTML = `
        <div class="toast-icon">🧐</div>
        <div class="toast-body">
          <b>Cijfers gevraagd</b>
          <span>${quote}</span>
        </div>
      `;
    }

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3800);
  }

  // Neutrale melding (geen alert): voor validaties en informatie
  function showNoticeToast(msg, icon = '💡') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast copy-toast';
    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-body">
        <b>Let op</b>
        <span>${msg}</span>
      </div>
    `;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3800);
  }

  let autoCalculatedInputs = new Set();
  // Settings: auto-calculator aan/uit (default aan). Uit = geen auto-fill, overal.
  const AUTO_CALC_KEY = 'netto_auto_calc';
  function isAutoCalcEnabled() { return localStorage.getItem(AUTO_CALC_KEY) !== 'off'; }
  // ===== Zichtbaarheid op het leaderboard =====
  // Staat in profiles.leaderboard_zichtbaar, niet in localStorage: het is een
  // keuze over wat anderen zien, en die hoort bij het account te horen en niet
  // bij deze browser. De schakelaar staat standaard aan — meedoen zonder erom
  // te vragen, eruit kunnen zonder het spel te verlaten.
  let leaderboardZichtbaar = true;

  async function laadLeaderboardZichtbaar() {
    werkLeaderboardToggleBij();
    if (!currentUser || !supabaseClient) return;
    try {
      const { data, error } = await supabaseClient
        .from('profiles').select('leaderboard_zichtbaar').eq('id', currentUser.id).maybeSingle();
      // Kolom bestaat nog niet? Dan blijft de standaard staan; de SQL die hem
      // toevoegt is misschien nog niet gedraaid.
      if (!error && data && typeof data.leaderboard_zichtbaar === 'boolean') {
        leaderboardZichtbaar = data.leaderboard_zichtbaar;
      }
    } catch (_) { /* standaard aan laten staan */ }
    werkLeaderboardToggleBij();
  }

  function werkLeaderboardToggleBij() {
    const knop = document.getElementById('leaderboardToggle');
    const noot = document.getElementById('leaderboardZichtbaarNoot');
    if (!knop) return;
    const ingelogd = !!currentUser;
    knop.setAttribute('aria-checked', String(ingelogd && leaderboardZichtbaar));
    knop.disabled = !ingelogd;
    if (noot) noot.hidden = ingelogd;
  }

  async function toggleLeaderboardZichtbaar() {
    if (!currentUser) { openAuthModal(); return; }
    const nieuw = !leaderboardZichtbaar;
    leaderboardZichtbaar = nieuw;
    werkLeaderboardToggleBij();
    try {
      const { error } = await supabaseClient
        .from('profiles').update({ leaderboard_zichtbaar: nieuw }).eq('id', currentUser.id);
      if (error) throw error;
      showSarcasticToast(nieuw
        ? statsCopy('Je staat weer op het leaderboard.', 'You are back on the leaderboard.')
        : statsCopy('Je staat niet meer op het leaderboard. Spelen kan gewoon door.',
                    'You are off the leaderboard now. You can still play.'), true);
    } catch (err) {
      // Terugdraaien: anders zegt de schakelaar iets anders dan de databank.
      leaderboardZichtbaar = !nieuw;
      werkLeaderboardToggleBij();
      showSarcasticToast(statsCopy('Kon dit niet opslaan. Probeer het later opnieuw.',
                                   'Could not save this. Please try again later.'));
    }
  }

  function toggleAutoCalc() {
    const next = isAutoCalcEnabled() ? 'off' : 'on';
    localStorage.setItem(AUTO_CALC_KEY, next);
    updateAutoCalcToggle();
    if (!isAutoCalcEnabled()) {
      // Direct alle huidige auto-ingevulde velden leegmaken.
      [...autoCalculatedInputs].forEach(id => clearAutoInput(id));
    }
    showSarcasticToast(next === 'on' ? 'Auto-calculator staat nu AAN' : 'Auto-calculator staat nu UIT', true);
  }
  function updateAutoCalcToggle() {
    const toggle = document.getElementById('autoCalcToggle');
    if (toggle) toggle.setAttribute('aria-checked', String(isAutoCalcEnabled()));
  }

  // ===== Thema: light (Netto-blauw) / dark (goud op navy) =====
  const THEME_KEY = 'netto_theme';
  function isDarkTheme() { return (localStorage.getItem(THEME_KEY) || 'light') === 'dark'; }
  function applyTheme() {
    document.documentElement.dataset.theme = isDarkTheme() ? 'dark' : 'light';
    const toggle = document.getElementById('themeToggle');
    if (toggle) toggle.setAttribute('aria-checked', String(isDarkTheme()));
  }
  function toggleTheme() {
    localStorage.setItem(THEME_KEY, isDarkTheme() ? 'light' : 'dark');
    applyTheme();
  }
  function dailyOperator() { return PUZZLE_DATA?.operator || '×'; }
  function calculateDailyValue(a, b, operator) {
    if (operator === '+') return a + b;
    if (operator === '−' || operator === '-') return a - b;
    if (operator === '×' || operator === '*') return a * b;
    if (operator === '÷' || operator === '/') return b === 0 ? NaN : a / b;
    return NaN;
  }
  function exactNumber(value) { return Number.isFinite(value) && Math.abs(value - Math.round(value)) < 1e-9 ? Math.round(value) : value; }
  function setAutoInput(id, value) {
    const input = document.getElementById(id); if (!input || !Number.isFinite(value)) return;
    input.value = formatDutchNumber(String(exactNumber(value)).replace('.', ','));
    autoCalculatedInputs.add(id); input.dataset.autoCalculated = 'true'; input.classList.add('auto-calculated');
    input.setAttribute('aria-label', 'Automatisch berekend antwoord');
  }
  function clearAutoInput(id) {
    const input = document.getElementById(id); if (!input || !autoCalculatedInputs.has(id)) return;
    input.value = ''; input.placeholder = 'Jouw schatting'; input.dataset.autoCalculated = 'false'; input.classList.remove('auto-calculated'); autoCalculatedInputs.delete(id);
  }
  function calculateDerivedValues(ids, operator) {
    if (!isAutoCalcEnabled()) return;
    const inputs = ids.map(id => document.getElementById(id));
    if (inputs.some(input => !input)) return;
    const values = inputs.map(input => parseFormattedNumber(input.value));
    const [a, b, c] = values;
    inputs.forEach((input, index) => {
      if (autoCalculatedInputs.has(input.id) && document.activeElement?.id !== input.id) clearAutoInput(input.id);
      else if (autoCalculatedInputs.has(input.id) && !Number.isFinite(values[index])) clearAutoInput(input.id);
    });
    const fresh = ids.map(id => parseFormattedNumber(document.getElementById(id).value));
    const [left, middle, result] = fresh;
    if (Number.isFinite(left) && Number.isFinite(middle) && !Number.isFinite(result)) {
      setAutoInput(ids[2], calculateDailyValue(left, middle, operator));
    } else if (Number.isFinite(left) && Number.isFinite(result) && !Number.isFinite(middle)) {
      const value = operator === '+' ? result - left : operator === '−' || operator === '-' ? left - result : operator === '×' || operator === '*' ? (left === 0 ? NaN : result / left) : operator === '÷' || operator === '/' ? (result === 0 ? NaN : left / result) : NaN;
      if (operator !== '÷' && operator !== '/' || Number.isInteger(value)) setAutoInput(ids[1], value);
    } else if (Number.isFinite(middle) && Number.isFinite(result) && !Number.isFinite(left)) {
      const value = operator === '+' ? result - middle : operator === '−' || operator === '-' ? result + middle : operator === '×' || operator === '*' ? (middle === 0 ? NaN : result / middle) : operator === '÷' || operator === '/' ? middle * result : NaN;
      if (operator !== '÷' && operator !== '/' || Number.isInteger(value)) setAutoInput(ids[0], value);
    }
  }
  function updateDailyDerivedInput() { calculateDerivedValues(['g1','g2','g3'], dailyOperator()); }
  function bindDerivedInputs(prefix, operator) {
    const ids = [`${prefix}Answer0`, `${prefix}Answer1`, `${prefix}Answer2`];
    const inputs = ids.map(id => document.getElementById(id));
    if (inputs.some(input => !input)) return;
    inputs.forEach(input => {
      input.addEventListener('focus', () => {
        input.dataset.editing = 'true';
        // Dit geldt ook voor Daily: bij focus krijgt de speler het automatische veld terug.
        if (autoCalculatedInputs.has(input.id)) clearAutoInput(input.id);
      });
      input.addEventListener('blur', () => {
        input.dataset.editing = 'false';
        if (!input.value.trim()) calculateDerivedValues(ids, operator);
      });
      input.addEventListener('input', () => {
        autoCalculatedInputs.delete(input.id);
        input.dataset.autoCalculated = 'false';
        input.placeholder = input.value.trim() ? '' : 'Jouw schatting';
        input.classList.remove('auto-calculated');
        if (!input.value.trim()) input.placeholder = 'Jouw schatting';
        calculateDerivedValues(ids, operator);
      });
    });
    calculateDerivedValues(ids, operator);
  }

  function initInputs() {
    ['g1', 'g2', 'g3'].forEach((id, index, arr) => {
      const input = document.getElementById(id);
      
      // Detecteer letters bij keydown
      input.addEventListener('keydown', (e) => {
        // Navigatie met Enter
        if (e.key === 'Enter') {
          if (index < arr.length - 1) {
            document.getElementById(arr[index + 1]).focus();
          } else {
            checkAnswers();
          }
          return;
        }

        // Toegestane besturingstoetsen
        const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Home', 'End'];
        if (allowed.includes(e.key) || e.ctrlKey || e.metaKey) return;

        // Als er een letter of ongeldig teken wordt ingedrukt
        if (!/[\d,]/.test(e.key)) {
          e.preventDefault();
          input.classList.add('shake');
          setTimeout(() => input.classList.remove('shake'), 400);
          showSarcasticToast();
        }
      });

      // Formatteer bij invoer
      input.addEventListener('input', (e) => {
        let val = input.value;
        if (/[a-zA-Z]/.test(val)) {
          showSarcasticToast();
        }
        if (val.trim() === '') {
          autoCalculatedInputs.delete(id);
          input.dataset.autoCalculated = 'false';
          input.placeholder = 'Jouw schatting';
          input.classList.remove('auto-calculated');
          updateDailyDerivedInput();
          return;
        }
        input.value = formatDutchNumber(val);
        autoCalculatedInputs.delete(id); input.dataset.autoCalculated = 'false'; input.classList.remove('auto-calculated');
        updateDailyDerivedInput();
      });
    });
  }

  // =========================================================================
  // 4. SPEL LOGICA & SCORES
  // =========================================================================
  function scoreVraag(g, w) {
    if (!g || g <= 0) return 10;
    return Math.max(g / w, w / g);
  }

  function fmt(n) {
    if (n === null || n === undefined || isNaN(Number(n))) return '';
    return Number(n).toLocaleString(nettoNumberLocale());
  }

  function getFactorRating(factor) {
    if (factor <= 1.15) return { color: 'var(--green)', bg: '#D1FAE5', emoji: '🟩', label: 'Spot on!' };
    if (factor <= 1.50) return { color: '#D97706', bg: '#FEF3C7', emoji: '🟨', label: 'Dichtbij' };
    if (factor <= 2.50) return { color: 'var(--orange)', bg: '#FFEDD5', emoji: '🟧', label: 'Ruime schatting' };
    return { color: 'var(--red)', bg: '#FEE2E2', emoji: '🟥', label: 'Ver uit de buurt' };
  }

  function isSpotOnAnswer(guess, actual) {
    return Number.isFinite(guess) && Number.isFinite(actual) && Math.abs(guess - actual) < 0.001;
  }

  let confettiCleanupTimer = null;
  function launchConfetti() {
    const layer = document.getElementById('confettiLayer');
    if (!layer) return;
    if (confettiCleanupTimer) clearTimeout(confettiCleanupTimer);
    layer.innerHTML = '';
    layer.hidden = false;

    const colors = ['#FFD84A', '#10B981', '#4F46E5', '#F97316', '#EF4444', '#FFFFFF'];
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 84; i += 1) {
      const piece = document.createElement('span');
      const shape = i % 5;
      piece.className = `confetti-piece ${shape === 1 ? 'is-circle' : shape === 2 ? 'is-diamond' : shape === 3 ? 'is-strip' : ''}`;
      piece.style.setProperty('--left', `${Math.random() * 100}%`);
      piece.style.setProperty('--size', `${7 + Math.random() * 8}px`);
      piece.style.setProperty('--color', colors[i % colors.length]);
      piece.style.setProperty('--duration', `${2.1 + Math.random() * 1.2}s`);
      piece.style.setProperty('--delay', `${Math.random() * 0.35}s`);
      piece.style.setProperty('--drift', `${Math.round((Math.random() - 0.5) * 260)}px`);
      piece.style.setProperty('--start-rotation', `${Math.round(Math.random() * 180 - 90)}deg`);
      piece.style.setProperty('--spin', `${Math.round(Math.random() * 1080 - 540)}deg`);
      fragment.appendChild(piece);
    }
    layer.appendChild(fragment);
    confettiCleanupTimer = setTimeout(() => {
      layer.hidden = true;
      layer.innerHTML = '';
      confettiCleanupTimer = null;
    }, 3800);
  }

  function getActivePuzzleKey() {
    return PUZZLE_DATA?.date || (activePuzzleIndex === 0 ? TODAY_STR : `puzzle_${PUZZLE_DATA.number}`);
  }

  // ===== Sfeerfoto bij de daily =====
  // Ontwerppilot: de foto's horen nog niet bij de vraag, het is puur beeld.
  // De keuze is bewust deterministisch per puzzel (niet Math.random), zodat
  // dezelfde daily altijd dezelfde foto houdt en er niets omklapt bij hertekenen.
  const DAILY_PHOTOS = window.NETTO_DAILY_PHOTOS || [];
  const DAILY_PHOTO_DIR = window.NETTO_DAILY_PHOTO_DIR || 'fotos/assets/';

  function pickDailyPhoto(key) {
    if (!DAILY_PHOTOS.length) return null;
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return DAILY_PHOTOS[hash % DAILY_PHOTOS.length];
  }

  // Bronvermelding tonen. Bij CC BY en CC BY-SA is dat een licentievoorwaarde,
  // geen nettigheid, dus dit hoort bij elke toegewezen foto te staan.
  function renderDailyPhotoCredit(puzzle) {
    const credit = document.getElementById('dailyPhotoCredit');
    if (!credit) return;
    const text = puzzle?.image_credit || '';
    credit.textContent = '';
    if (!text) { credit.hidden = true; return; }
    credit.hidden = false;
    credit.appendChild(document.createTextNode(text));
    // Tekstknopen en createElement in plaats van innerHTML: de bronvermelding
    // komt uit de database en hoeft dan nergens ontsnapt te worden.
    const source = puzzle.image_source_url;
    if (source) {
      credit.appendChild(document.createTextNode(' · '));
      const link = document.createElement('a');
      link.href = source;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = statsCopy('bron', 'source');
      credit.appendChild(link);
    }
  }

  // De generator koppelt aan bijna elke puzzel een foto uit Wikimedia Commons,
  // bij een van de drie vragen. Anders dan de sfeerfoto's gaat deze wel echt
  // over de vraag, dus de tekst eronder mag niet blijven beweren dat het beeld
  // niets met de puzzel te maken heeft.
  function gekoppeldeFoto() {
    // Dagpuzzels uit de databank dragen geen photo-veld; fotoUitVraagtekst uit
    // js/photo-credits.js zoekt de foto dan alsnog op via NETTO_FOTOS.
    // Het meegedragen photo-veld telt alleen zolang die vraag nog in
    // NETTO_FOTOS staat; anders is de foto sindsdien afgekeurd. Zie
    // nogInDeBank in js/photo-credits.js.
    const eigen = PUZZLE_DATA?.photo;
    const draagbaar = eigen && (typeof nogInDeBank !== 'function'
      || nogInDeBank(PUZZLE_DATA, eigen)) ? eigen : null;
    const f = draagbaar
      || (typeof fotoUitVraagtekst === 'function' ? fotoUitVraagtekst(PUZZLE_DATA) : null);
    if (!f?.url) return null;
    const nr = Number(f.vraag);
    const bij = nr >= 1 && nr <= 3 ? PUZZLE_DATA['q' + nr + '_label'] : '';
    const maker = String(f.maker || '').trim();
    const stukjes = [maker && ('Foto: ' + maker), f.licentie].filter(Boolean);
    return { src: f.url, alt: bij, vraag: nr,
             credit: stukjes.join(' · '), bron: f.pagina };
  }

  function renderDailyPhoto() {
    const photo = document.getElementById('dailyPhotoButton');
    const image = document.getElementById('dailyPhotoImage');
    const dialogImage = document.getElementById('dailyPhotoDialogImage');
    if (!photo || !image || !dialogImage) return;

    // Volgorde: een door de redactie toegewezen foto wint, daarna de foto die
    // de generator bij een van de vragen zocht, en pas als laatste de
    // sfeerfoto-rotatie die nergens over gaat.
    const assigned = PUZZLE_DATA?.image_path;
    const gekoppeld = assigned ? null : gekoppeldeFoto();
    const rotatie = assigned || gekoppeld ? null : pickDailyPhoto(getActivePuzzleKey());
    const kaarten = [...document.querySelectorAll('#dailyQuestionView > .q-block')];
    kaarten.forEach(kaart => kaart.classList.remove('has-photo'));
    if (!assigned && !gekoppeld && !rotatie) { photo.hidden = true; return; }

    // De foto blijft bij de bijbehorende vraag, ook na wisselen van Daily.
    const vraagnummer = gekoppeld?.vraag >= 1 && gekoppeld.vraag <= 3 ? gekoppeld.vraag : 1;
    const fotokaart = kaarten[vraagnummer - 1];
    if (fotokaart) {
      fotokaart.prepend(photo);
      fotokaart.classList.add('has-photo');
    }

    const src = assigned || gekoppeld?.src || (DAILY_PHOTO_DIR + rotatie.file);
    if (image.getAttribute('src') !== src) {
      image.src = src;
      dialogImage.src = src;
    }
    // Toegewezen foto's hebben een echte alt-tekst; de rotatiefoto's zijn puur
    // decoratief en houden een lege alt, zodat schermlezers ze overslaan.
    const alt = assigned ? (PUZZLE_DATA.image_alt || '') : (gekoppeld?.alt || '');
    image.alt = alt;
    dialogImage.alt = alt;
    // Ook de rotatiefoto's krijgen bronvermelding: het zijn Commons-bestanden
    // onder CC BY of CC BY-SA, waar naamsvermelding een licentievoorwaarde is.
    renderDailyPhotoCredit(assigned ? PUZZLE_DATA
      : gekoppeld ? { image_credit: gekoppeld.credit, image_source_url: gekoppeld.bron }
      : { image_credit: rotatie.credit, image_source_url: rotatie.source });
    photo.hidden = false;
    // Alleen ruimte reserveren in de vraag als er ook echt een foto staat.
    // Decoratief beeld: de knop draagt het label, de img blijft leeg zodat
    // schermlezers het niet dubbel voorlezen.
    photo.setAttribute('aria-label', gekoppeld
      ? statsCopy('Vergroot de foto bij vraag ' + vraagnummer, 'Enlarge the photo for question ' + vraagnummer)
      : statsCopy('Vergroot de voorbeeldfoto', 'Enlarge sample photo'));
    document.getElementById('dailyPhotoCaption').textContent = gekoppeld
      ? statsCopy('Bij vraag ' + gekoppeld.vraag + ' ↗', 'With question ' + gekoppeld.vraag + ' ↗')
      : statsCopy('Voorbeeldfoto ↗', 'Sample photo ↗');
    // "Het antwoord staat er niet op" stond hier, en dat was niet waar: bij een
    // vraag over de hoogte van een toren helpt een foto van die toren je wel
    // degelijk schatten. Dat is ook precies de bedoeling. Beloof dus niet iets
    // wat het beeld niet waarmaakt, en zeg gewoon waar de foto bij hoort.
    document.getElementById('dailyPhotoDisclaimer').textContent = gekoppeld
      ? statsCopy('Hoort bij vraag ' + gekoppeld.vraag + '.',
                  'Belongs to question ' + gekoppeld.vraag + '.')
      : statsCopy('Ontwerpvoorbeeld — deze foto is geen hint.', 'Design preview — this photo is not a clue.');
  }

  // Alleen een herkenbare gevraagde eenheid tonen, nooit een contextgetal
  // zoals "bezoekers per jaar" als tijdseenheid behandelen.
  const VRAAG_EENHEDEN = [
    ['vierkante kilometers?|km[²2]', 'km²'], ['vierkante meters?|m[²2]', 'm²'],
    ['vierkante centimeters?|cm[²2]', 'cm²'], ['kubieke meters?|m[³3]', 'm³'],
    ['kubieke centimeters?|cm[³3]', 'cm³'], ['kilometers? per uur|km/[uh]', 'km/u'],
    ['kilometers? per seconde|km/s', 'km/s'], ['meters? per seconde|m/s', 'm/s'],
    ['graden? celsius|°c', '°C'], ['graden? fahrenheit|°f', '°F'],
    ['millimeters?|mm', 'mm'], ['centimeters?|cm', 'cm'], ['decimeters?|dm', 'dm'],
    ['kilometers?|km', 'km'], ['meters?|m', 'm'],
    ['milligram(?:men)?|mg', 'mg'], ['kilogram(?:men)?|kg', 'kg'],
    ['gram(?:men)?|g', 'g'], ['ton(?:nen)?', 'ton'], ['milliliters?|ml', 'ml'],
    ['centiliters?|cl', 'cl'], ['liters?|l', 'liter'], ['hectares?|ha', 'ha'],
    ['procent(?:en)?', '%'], ['graden?', 'graden'], ['seconden?', 'sec'],
    ['minu(?:ut|ten)', 'min'], ['u(?:ur|ren)', 'uur'], ['da(?:g|gen)', 'dagen'],
    ['we(?:ek|ken)', 'weken'], ['maanden?', 'maanden'], ['ja(?:ar|ren)', 'jaar'],
    ['eeuw(?:en)?', 'eeuwen'], ['euro(?:s|’s|\'s)?', 'euro'],
    ['dollars?', 'dollar']
  ];

  // Het spel toont de vraag vertaald, dus de eenheid moet mee. Eerst de
  // Engelse zin ontleden; lukt dat niet, dan het Nederlandse label vertalen.
  function eenheidUit(vraag) {
    const nederlands = nederlandseEenheid(vraag);
    if (window.NettoI18n?.language !== 'en') return nederlands;
    const tekst = String(vraag || '');
    const engels = window.NettoI18n.t(tekst);
    // Zonder vertaling blijft de vraag Nederlands staan; dan hoort de
    // Nederlandse eenheid erbij, anders verdwijnt hij helemaal.
    if (engels === tekst) return nederlands;
    return engelseEenheid(engels) || engelsLabel(nederlands);
  }

  function nederlandseEenheid(vraag) {
    const tekst = String(vraag || '').toLocaleLowerCase('nl-NL').replace(/\s+/g, ' ');
    const schaal = '(?:(duizend|miljoen|miljard) )?';
    // Een expliciete "in ..."-eenheid gaat voor een losse vermelding.
    for (const begin of ['\\bin\\s+', '\\bhoeveel\\s+']) {
      for (const [patroon, label] of VRAAG_EENHEDEN) {
        const treffer = tekst.match(new RegExp(begin + schaal + '(?:' + patroon + ')(?![\\p{L}\\p{N}/])', 'u'));
        if (treffer) return (treffer[1] ? treffer[1] + ' ' : '') + label;
      }
    }
    if (/\bwelk percentage\b/u.test(tekst)) return '%';
    if (/^in welk jaar\b/u.test(tekst)) return 'jaar';
    return telEenheid(tekst);
  }

  // Woorden die tussen "hoeveel" en het getelde zelfstandig naamwoord kunnen
  // staan. Zonder deze lijst wordt "hoeveel verschillende talen" tot
  // "verschillende" in plaats van "talen".
  const TEL_OVERSLAAN = new Set(['verschillende', 'officiele', 'offici\u00eble', 'individuele',
    'erkende', 'bekende', 'gepubliceerde', 'complete', 'standaard', 'totale', 'unieke',
    'actieve', 'echte', 'grote', 'kleine', 'afzonderlijke', 'belangrijkste', 'centrale',
    'natuurlijke', 'zware', 'gewone', 'huidige', 'oorspronkelijke']);
  // Woorden die nooit een eenheid zijn; dan valt er niets zinnigs te tonen.
  const TEL_GEEN = new Set(['van', 'de', 'het', 'een', 'er', 'is', 'zijn', 'in', 'op', 'procent']);
  const TEL_SCHAAL = { duizend: '\u00d7 1.000', miljoen: '\u00d7 1.000.000', miljard: '\u00d7 1.000.000.000', biljoen: '× 1.000.000.000.000' };

  // Bij een telvraag is het getelde zelfstandig naamwoord de eenheid: "Hoeveel
  // liften heeft de Burj Khalifa" vraagt om liften. Dat dekt driekwart van de
  // bank, waar de lijst met meeteenheden alleen de meetbare vragen ving.
  function telEenheid(tekst) {
    const m = tekst.match(/\bhoeveel\s+(.+)/u);
    if (!m) return null;
    const woorden = m[1].match(/[\p{L}']+/gu) || [];
    let i = 0;
    let voorvoegsel = '';
    if (woorden[0] && TEL_SCHAAL[woorden[0]]) { voorvoegsel = TEL_SCHAAL[woorden[0]] + ' '; i = 1; }
    while (i < woorden.length && TEL_OVERSLAAN.has(woorden[i])) i += 1;
    const woord = woorden[i];
    if (!woord || TEL_GEEN.has(woord)) return voorvoegsel.trim() || null;
    // Een heel lang woord verdringt het invoerveld; dan liever alleen de schaal.
    if (woord.length > 14) return voorvoegsel.trim() || null;
    return voorvoegsel + woord;
  }

  const EN_EENHEDEN = [
    ['square kilomet(?:er|re)s?|km[\u00b22]', 'km\u00b2'],
    ['square cent[ei]met(?:er|re)s?|cm[\u00b22]', 'cm\u00b2'],
    ['square met(?:er|re)s?|m[\u00b22]', 'm\u00b2'],
    ['cubic cent[ei]met(?:er|re)s?|cm[\u00b33]', 'cm\u00b3'],
    ['cubic met(?:er|re)s?|m[\u00b33]', 'm\u00b3'],
    ['kilomet(?:er|re)s? (?:an|per) hour|km/h', 'km/h'],
    ['kilomet(?:er|re)s? per second|km/s', 'km/s'],
    ['met(?:er|re)s? per second|m/s', 'm/s'],
    ['degrees? celsius|\u00b0c', '\u00b0C'], ['degrees? fahrenheit|\u00b0f', '\u00b0F'],
    ['millimet(?:er|re)s?|mm', 'mm'], ['cent[ei]met(?:er|re)s?|cm', 'cm'],
    ['decimet(?:er|re)s?|dm', 'dm'], ['kilomet(?:er|re)s?|km', 'km'],
    ['met(?:er|re)s?|m', 'm'], ['milligrams?|mg', 'mg'], ['kilograms?|kg', 'kg'],
    ['grams?|g', 'g'], ['tons?|tonnes?', 'tons'], ['millilit(?:er|re)s?|ml', 'ml'],
    ['centilit(?:er|re)s?|cl', 'cl'], ['lit(?:er|re)s?|l', 'liters'],
    ['hectares?|ha', 'ha'], ['percent', '%'], ['degrees?', 'degrees'],
    ['seconds?', 'sec'], ['minutes?', 'min'], ['hours?', 'hours'],
    ['days?', 'days'], ['weeks?', 'weeks'], ['months?', 'months'],
    ['years?', 'years'], ['centur(?:y|ies)', 'centuries'], ['euros?', 'euro'],
    ['dollars?', 'dollar']
  ];
  const EN_SCHAAL = { thousand: '\u00d7 1,000', million: '\u00d7 1,000,000', billion: '\u00d7 1,000,000,000', trillion: '× 1,000,000,000,000' };
  // Lidwoorden, voorzetsels en hulpwerkwoorden sluiten de naamwoordgroep af.
  const EN_STOP = new Set(('do does did is are was were has have had can could will would ' +
    'the a an there of in on at for by with to from as and or than that this these those ' +
    'it its his her their our your my he she they we you i not no per each other more most ' +
    'about approximately roughly around').split(' '));
  // Nederlandse labels die in het Engels anders heten. Telwoorden zoals
  // "liften" staan er niet in: die haalt engelseEenheid uit de vertaalde zin.
  const NL_EN_LABEL = { 'km/u': 'km/h', biljoen: '× 1,000,000,000,000', liter: 'liters', ton: 'tons', graden: 'degrees',
    uur: 'hours', dagen: 'days', weken: 'weeks', maanden: 'months', jaar: 'years',
    eeuwen: 'centuries', duizend: '\u00d7 1,000', miljoen: '\u00d7 1,000,000',
    miljard: '\u00d7 1,000,000,000' };
  const EN_METEND = new Set(VRAAG_EENHEDEN.map(paar => paar[1]).concat(['jaar']));

  // Alleen een meeteenheid laat zich zonder woordenboek vertalen; een geteld
  // zelfstandig naamwoord niet, dus dat levert liever niets op dan Nederlands.
  function engelsLabel(nederlands) {
    if (!nederlands) return null;
    const delen = String(nederlands).split(' ');
    const label = delen.pop();
    if (!EN_METEND.has(label)) return null;
    const voorvoegsel = delen.map(deel => NL_EN_LABEL[deel] || deel);
    return voorvoegsel.concat(NL_EN_LABEL[label] || label).join(' ');
  }

  function engelseEenheid(vraag) {
    const tekst = String(vraag || '').toLocaleLowerCase('en').replace(/\s+/g, ' ');
    const schaal = '(?:(thousand|million|billion) )?';
    for (const begin of ['\\bin\\s+', '\\bhow\\s+(?:many|much)\\s+']) {
      for (const [patroon, label] of EN_EENHEDEN) {
        const treffer = tekst.match(new RegExp(begin + schaal + '(?:' + patroon + ')(?![\\p{L}\\p{N}/])', 'u'));
        if (treffer) return (treffer[1] ? EN_SCHAAL[treffer[1]] + ' ' : '') + label;
      }
    }
    if (/\bwhat percent(?:age)?\b/u.test(tekst)) return '%';
    if (/^in (?:what|which) year\b/u.test(tekst)) return 'year';
    return engelsTelwoord(tekst);
  }

  // In het Engels staat de kern achteraan de naamwoordgroep: "African
  // countries" telt landen, niet Afrikanen. Het meervoud verraadt de kern,
  // want een volgend werkwoord ("countries border") eindigt niet op een s.
  function engelsTelwoord(tekst) {
    const m = tekst.match(/\bhow (?:many|much) (.+)/u);
    if (!m) return null;
    const woorden = m[1].match(/[\p{L}'-]+/gu) || [];
    let i = 0;
    let voorvoegsel = '';
    if (woorden[0] && EN_SCHAAL[woorden[0]]) { voorvoegsel = EN_SCHAAL[woorden[0]] + ' '; i = 1; }
    const groep = [];
    for (const woord of woorden.slice(i)) {
      if (EN_STOP.has(woord) || EN_SCHAAL[woord] || groep.length >= 4) break;
      groep.push(woord);
    }
    if (!groep.length) return voorvoegsel.trim() || null;
    const meervoud = groep.filter(woord => woord.length > 2 && woord.endsWith('s'));
    const woord = meervoud.length ? meervoud[meervoud.length - 1] : groep[0];
    if (woord.length > 14) return voorvoegsel.trim() || null;
    return voorvoegsel + woord;
  }

  function categorieKleurVariabele(categorie) {
    if (!Object.hasOwn(DAILY_CATEGORY_ICON_KEYS, categorie)) return '--surface-2';
    return '--categorie-' + categorie.toLocaleLowerCase('nl-NL')
      .replace(/&/g, 'en').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function maakBronpaneel(vraag) {
    const bronnen = window.NETTO_BRONNEN;
    if (!bronnen || !Object.hasOwn(bronnen, vraag)) return null;
    const vermelding = bronnen[vraag];
    if (!vermelding?.bron || !vermelding?.uitleg) return null;
    let url;
    try { url = new URL(vermelding.bron); } catch { return null; }
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const paneel = document.createElement('details');
    paneel.className = 'vraag-bron';
    const kop = document.createElement('summary');
    kop.textContent = 'Waar komt dit vandaan?';
    const uitleg = document.createElement('p');
    // Bewijszinnen zijn inhoud uit de bron, geen HTML of vertaalinstructies.
    uitleg.setAttribute('data-i18n-skip', '');
    uitleg.textContent = vermelding.uitleg;
    const link = document.createElement('a');
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener';
    // De bewijszin zelf blijft Nederlands: dat is een citaat uit de bron, geen
    // interfacetekst. Dit label eromheen is dat wel, en bleef staan omdat het
    // met de hand aan elkaar werd geplakt en dus nooit langs de vertaling kwam.
    link.textContent = statsCopy('Bekijk de bron: ', 'View the source: ')
      + url.hostname.replace(/^www\./, '');
    paneel.append(kop, uitleg, link);
    return paneel;
  }

  function werkDailyVraagDetailsBij(ingeleverd = false) {
    const kaarten = [1, 2, 3].map(i => document.getElementById('g' + i)?.closest('.q-block'));
    werkVraagDetailsBij(PUZZLE_DATA, kaarten, ingeleverd);
  }

  function werkVraagDetailsBij(puzzel, kaarten, ingeleverd) {
    // Ontbreekt één databasecategorie, schuif de andere dan niet een plek op.
    kaarten.forEach((kaart, index) => {
      if (!kaart) return;
      const vraag = puzzel['q' + (index + 1) + '_label'];
      const categorie = puzzel.categories?.[index] || VRAAG_CATEGORIE.get((vraag || '').trim());
      const invoer = kaart.querySelector('input');
      if (invoer) {
        let label = kaart.querySelector('.invoer-eenheid');
        if (!label) {
          label = document.createElement('span');
          label.id = invoer.id + 'Eenheid';
          label.className = 'invoer-eenheid';
          label.setAttribute('data-i18n-skip', '');
          invoer.parentElement.appendChild(label);
        }
        const eenheid = eenheidUit(vraag);
        label.textContent = eenheid || '';
        label.hidden = !eenheid;
        invoer.classList.toggle('met-eenheid', !!eenheid);
        invoer.style.setProperty('--eenheid-ruimte', (eenheid ? eenheid.length * 8 + 26 : 16) + 'px');
        if (eenheid) invoer.setAttribute('aria-describedby', label.id);
        else invoer.removeAttribute('aria-describedby');
        const vraaglabel = kaart.querySelector('.q-label');
        if (vraaglabel) {
          if (!vraaglabel.id) vraaglabel.id = invoer.id + 'Vraag';
          invoer.setAttribute('aria-labelledby', vraaglabel.id);
        }
      }
      kaart.classList.add('vraag-met-categorie');
      kaart.style.setProperty('--vraag-tint', 'var(' + categorieKleurVariabele(categorie) + ')');
      // Klein verschil per stap houdt ook gedeelde kleurfamilies herkenbaar.
      kaart.style.setProperty('--vraag-menging', (84 - index * 12) + '%');
      kaart.querySelector('.vraag-bron')?.remove();
      if (ingeleverd) {
        const bron = maakBronpaneel(vraag);
        if (bron) kaart.appendChild(bron);
      }
    });
  }

  const vraagDetailLijsten = new WeakSet();
  function initVraagDetails() {
    for (const prefix of ['library', 'catalogus']) {
      const lijst = document.getElementById(prefix + 'QuestionList');
      if (!lijst || vraagDetailLijsten.has(lijst)) continue;
      vraagDetailLijsten.add(lijst);
      const bijwerken = () => {
        const puzzel = prefix === 'library' ? libraryActivePuzzle : catalogusActivePuzzle;
        if (!puzzel) return;
        const kaarten = [...lijst.querySelectorAll(':scope > .q-block, :scope > .library-question')];
        if (kaarten.length === 3) werkVraagDetailsBij(puzzel, kaarten, !lijst.querySelector('input'));
      };
      // Alleen vervanging van de kaarten volgen, niet onze eigen labels of
      // vertaalde tekst daarbinnen. Zo ontstaat geen herhaalde mutatielus.
      new MutationObserver(bijwerken).observe(lijst, { childList: true });
      bijwerken();
    }
  }

  function checkExistingPlay() {
    werkDailyVraagDetailsBij();
    renderDailyPhoto();
    const plays = getLocalPlays();
    const pKey = getActivePuzzleKey();
    const existingPlay = plays[pKey];
    const streak = getLocalStreak();
    updateStreakUI(streak);

    if (existingPlay) {
      // Reeds gespeeld voor deze puzzel
      document.getElementById('g1').value = fmt(existingPlay.g1);
      document.getElementById('g2').value = fmt(existingPlay.g2);
      document.getElementById('g3').value = fmt(existingPlay.g3);
      ['g1', 'g2', 'g3'].forEach(id => document.getElementById(id).disabled = true);
      document.getElementById('btnCheck').style.display = 'none';
      document.getElementById('alreadyPlayedBanner').classList.add('show');
      renderResultsUI(existingPlay.g1, existingPlay.g2, existingPlay.g3, existingPlay.factor);
    }
  }

  function dailyEquationMatches(a, b, c, operator) {
    if (![a,b,c].every(Number.isFinite)) return false;
    let expected;
    switch (operator) {
      case '×': case '*': case 'x': expected = a*b; break;
      case '÷': case '/': expected = b === 0 ? NaN : a/b; break;
      case '+': expected = a+b; break;
      case '−': case '-': expected = a-b; break;
      default: return false;
    }
    return Number.isFinite(expected) && Math.abs(expected-c) <= 1e-10 * Math.max(Math.abs(expected),Math.abs(c),Number.MIN_VALUE);
  }

  function checkAnswers() {
    const g1 = parseFormattedNumber(document.getElementById('g1').value);
    const g2 = parseFormattedNumber(document.getElementById('g2').value);
    const g3 = parseFormattedNumber(document.getElementById('g3').value);

    if (![g1,g2,g3].every(Number.isFinite) || g1 <= 0 || g2 <= 0 || g3 <= 0) {
      showNoticeToast('Vul eerst alle drie de vragen in met een getal groter dan 0.');
      return;
    }

    if (!dailyEquationMatches(g1,g2,g3,PUZZLE_DATA.operator || '×')) {
      const error = document.getElementById('dailyEquationError');
      const message = statsCopy('Je schattingen vormen nog geen kloppende som. Pas een antwoord aan voordat je inlevert.', 'Your estimates do not form a valid equation yet. Adjust an answer before submitting.');
      if (error) { error.textContent = message; error.hidden = false; }
      document.getElementById('g3').focus();
      return;
    }
    const equationError = document.getElementById('dailyEquationError');
    if (equationError) equationError.hidden = true;
    const s1 = scoreVraag(g1, PUZZEL_ECHT().a1);
    const s2 = scoreVraag(g2, PUZZEL_ECHT().a2);
    const s3 = scoreVraag(g3, PUZZEL_ECHT().a3);
    const avgFactor = (s1 + s2 + s3) / 3;

    // Streak bijwerken (bij de dagelijkse puzzel)
    let streak = getLocalStreak();
    const plays = getLocalPlays();
    const pKey = getActivePuzzleKey();

    if (!plays[pKey] && PUZZLE_DATA?.date === TODAY_STR) {
      streak += 1;
      localStorage.setItem('netto_streak', streak.toString());
    }
    updateMaxStreak(streak);
    updateStreakUI(streak);

    // Opslaan in LocalStorage
    plays[pKey] = { g1, g2, g3, factor: avgFactor, puzzleNumber: PUZZLE_DATA.number, playedAt: new Date().toISOString() };
    localStorage.setItem('netto_plays', JSON.stringify(plays));
    if (!document.getElementById('streakCalendarPopover')?.hidden) renderStreakCalendar();

    // Velden uitschakelen
    ['g1', 'g2', 'g3'].forEach(id => document.getElementById(id).disabled = true);
    document.getElementById('btnCheck').style.display = 'none';

    renderResultsUI(g1, g2, g3, avgFactor, true);
    if ([g1, g2, g3].every((guess, i) => isSpotOnAnswer(guess, [PUZZEL_ECHT().a1, PUZZEL_ECHT().a2, PUZZEL_ECHT().a3][i]))) {
      launchConfetti();
    }

    // Sync naar Cloud / Supabase als ingelogd
    if (PUZZLE_DATA?.date === TODAY_STR) syncPlayToCloud(TODAY_STR, g1, g2, g3, avgFactor);
  }

  function PUZZEL_ECHT() {
    return { a1: PUZZLE_DATA.q1_answer, a2: PUZZLE_DATA.q2_answer, a3: PUZZLE_DATA.q3_answer };
  }

  let dailyScoreFrame = null;
  function revealDailyScore(accuracy, animate) {
    if (dailyScoreFrame !== null) cancelAnimationFrame(dailyScoreFrame);
    dailyScoreFrame = null;
    const badge = document.getElementById('scoreBadge');
    badge.setAttribute('aria-label', `${accuracy}%`);
    badge.dataset.tone = accuracy >= 85 ? 'precise' : accuracy >= 60 ? 'close' : 'wide';
    if (!animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || accuracy === 100) {
      badge.textContent = `${accuracy}%`;
      return;
    }
    const started = Date.now();
    const tick = () => {
      const progress = Math.min(1, (Date.now() - started) / 750);
      const eased = 1 - (1-progress)**3;
      badge.textContent = `${Math.round(100 + (accuracy-100)*eased)}%`;
      dailyScoreFrame = progress < 1 ? requestAnimationFrame(tick) : null;
    };
    tick();
  }

  function renderResultsUI(g1, g2, g3, avgFactor, animate = false) {
    werkDailyVraagDetailsBij(true);
    const echt = PUZZEL_ECHT();
    const s1 = scoreVraag(g1, echt.a1);
    const s2 = scoreVraag(g2, echt.a2);
    const s3 = scoreVraag(g3, echt.a3);

    const isSpotOn1 = isSpotOnAnswer(g1, echt.a1);
    const isSpotOn2 = isSpotOnAnswer(g2, echt.a2);
    const isSpotOn3 = isSpotOnAnswer(g3, echt.a3);

    document.getElementById('a1').innerHTML = fmt(echt.a1) + (isSpotOn1 ? '<div class="spot-on-sub">Spot on! 🎯</div>' : `<div class="guess-sub">Jouw gok: ${fmt(g1)}</div>`);
    document.getElementById('a2').innerHTML = fmt(echt.a2) + (isSpotOn2 ? '<div class="spot-on-sub">Spot on! 🎯</div>' : `<div class="guess-sub">Jouw gok: ${fmt(g2)}</div>`);
    document.getElementById('a3').innerHTML = fmt(echt.a3) + (isSpotOn3 ? '<div class="spot-on-sub">Spot on! 🎯</div>' : `<div class="guess-sub">Jouw gok: ${fmt(g3)}</div>`);

    renderBadge('badge-q1', s1, g1, echt.a1);
    renderBadge('badge-q2', s2, g2, echt.a2);
    renderBadge('badge-q3', s3, g3, echt.a3);

    // Nauwkeurigheid (Optie A: 100 / avgFactor)
    const accuracy = Math.round(100 / avgFactor);
    revealDailyScore(accuracy, animate);
    const factorEl = document.getElementById('scoreBadgeFactor');
    if (factorEl) {
      factorEl.textContent = `Gemiddelde afwijking: ${avgFactor.toFixed(2)}×`;
    }
    
    const exactCount = [g1 === echt.a1, g2 === echt.a2, g3 === echt.a3].filter(Boolean).length;
    const msg = statsCopy(`${exactCount} van 3 antwoorden spot-on`, `${exactCount} of 3 answers spot-on`);
    document.getElementById('scoreBadgeMsg').textContent = msg;

    // Getallenbalk tekenen
    renderNumberLine(g1, g2, g3, echt.a1, echt.a2, echt.a3, PUZZLE_DATA.operator || '×');

    if (currentUser) {
      document.getElementById('cloudSyncBanner').style.display = 'none';
    } else {
      document.getElementById('cloudSyncBanner').style.display = 'flex';
    }

    document.getElementById('results').classList.add('show');
    showDailyResults();
    if (activePuzzleIndex === 0) startDailyCountdown();
    else { const countdown = document.getElementById('dailyCountdown'); if (countdown) countdown.remove(); if (countdownTimer) clearInterval(countdownTimer); }
    renderDailyArchive();
  }

  function renderBadge(elemId, factor, guess, actual) {
    const el = document.getElementById(elemId);
    if (!el) return;
    const isSpotOn = isSpotOnAnswer(guess, actual);
    if (isSpotOn) {
      el.style.background = '#10B981';
      el.style.color = '#FFFFFF';
      el.innerHTML = `🎯 Spot on!`;
      return;
    }
    const r = getFactorRating(factor);
    const qAcc = Math.round(100 / factor);
    el.style.background = r.bg;
    el.style.color = r.color;
    el.innerHTML = `${r.emoji} ${qAcc}% (${factor.toFixed(2)}×)`;
  }

  // =========================================================================
  // DE GETALLENBALK (6 PUNTEN: WERKELIJKHEID VS SCHATTINGEN)
  // =========================================================================
  function dailyRatioPoint(guess, actual) {
    const ratio = guess / actual;
    const exponent = Math.log2(guess) - Math.log2(actual);
    return { ratio, y: 142 - Math.max(-3, Math.min(3, exponent)) * 34, clipped: Math.abs(exponent) > 3, above: exponent > 0 };
  }

  function dailyHistogramTicks(actual) {
    if (!Number.isFinite(actual) || actual <= 0) return [];
    const ticks = [actual];
    const base = Math.floor(Math.log10(actual));
    for (let exponent = base-2; exponent <= base+2; exponent++) {
      for (const multiple of [1,2,5]) {
        const value = multiple * 10**exponent;
        const position = Math.log2(value/actual);
        if (Math.abs(position) > 3 || !Number.isFinite(position)) continue;
        if (ticks.every(tick => Math.abs(Math.log2(value/tick)) >= 0.8)) ticks.push(value);
      }
    }
    return ticks.sort((a,b)=>a-b);
  }

  let dailyReviewData = null;
  function renderNumberLine(g1, g2, g3, a1, a2, a3) {
    dailyReviewData = { guesses: [g1,g2,g3], answers: [a1,a2,a3] };
    selectDailyReviewQuestion(-1);
  }

  function selectDailyReviewQuestion(index) {
    if (!dailyReviewData || !Number.isInteger(index) || index < -1 || index > 2) return;
    const container = document.getElementById('numberlineCard');
    if (!container) return;
    const overview = index === -1;
    const selected = index;
    const restoreFocus = document.activeElement?.dataset?.question !== undefined;
    container.classList.toggle('is-overview', overview);
    if (overview) index = 0;
    const { guesses, answers } = dailyReviewData;
    const guess = guesses[index], actual = answers[index];
    const copy = statsCopy;
    // Fixed illustrative percentages, never used for scoring or stored as player data.
    const demos = [
      [1,2,3,6,12,21,26,16,7,3,2,1],
      [2,3,5,8,16,24,20,10,6,3,2,1],
      [1,1,2,3,5,9,17,25,19,10,5,3]
    ];
    const bins = demos[index];
    const x = value => 42 + (Math.max(-3,Math.min(3,value))+3)/6*476;
    const logRatio = Math.log2(guess)-Math.log2(actual);
    const guessX = x(logRatio);
    const exact = guess === actual;
    const factor = Math.max(guess/actual,actual/guess);
    const direction = exact ? 'Exact' : copy(logRatio > 0 ? 'te hoog' : 'te laag', logRatio > 0 ? 'too high' : 'too low');
    const ratioLabel = Number.isFinite(factor) ? new Intl.NumberFormat(nettoNumberLocale(),{maximumSignificantDigits:3}).format(factor)+'×' : copy('Buiten schaal','Off scale');
    const ticks = dailyHistogramTicks(actual).map(value => {
      const label = new Intl.NumberFormat(nettoNumberLocale(), {notation:'compact',maximumSignificantDigits:3}).format(value);
      return `<text x="${x(Math.log2(value/actual))}" y="223" text-anchor="middle" class="hist-tick">${label}</text>`;
    }).join('');
    const bars = bins.map((percent,i) => {
      const height = percent/30*132;
      return `<rect x="${43+i*476/12}" y="${198-height}" width="36" height="${height}" rx="3" class="hist-bar"><title>DEMO: ${percent}%</title></rect>`;
    }).join('');
    const labelX = Math.max(74,Math.min(486,guessX));
    container.innerHTML = `
      <div class="review-equation"><span>${copy('Het verband','The connection')}</span><strong>${fmt(answers[0])} ${PUZZLE_DATA.operator || '×'} ${fmt(answers[1])} = ${fmt(answers[2])}</strong></div>
      <div class="review-question-tabs" role="group" aria-label="${copy('Kies een vraag','Choose a question')}">${[-1,0,1,2].map(i => `<button type="button" aria-pressed="${i===selected}" onclick="selectDailyReviewQuestion(${i})" data-question="${i}">${i === -1 ? copy('Overzicht','Overview') : copy('Vraag','Question')+' '+(i+1)}</button>`).join('')}</div>
      <div class="review-overview"><div class="overview-caption">${copy('Jouw schatting → echt antwoord','Your estimate → actual answer')}</div>${guesses.map((g,i) => {
        const exact = g === answers[i];
        const accuracy = Math.round(100/scoreVraag(g,answers[i]));
        return `<button type="button" class="overview-row ${exact ? 'is-exact' : 'is-estimate'}" onclick="selectDailyReviewQuestion(${i})"><span class="overview-row-title" id="overviewQuestion${i}"></span><span class="overview-numbers">${fmt(g)} <span aria-hidden="true">→</span> <strong>${fmt(answers[i])}</strong></span><span class="overview-status">${exact ? 'Exact' : accuracy+'%'} <span aria-hidden="true">↗</span></span></button>`;
      }).join('')}<p class="overview-note">${copy('Tik op een vraag om je schatting te bekijken.','Select a question to explore your estimate.')}</p></div>
      <h2 id="selectedReviewQuestion" class="selected-review-question"></h2>
      <div class="review-comparison"><div><span>${copy('Jouw schatting','Your estimate')}</span><strong>${fmt(guess)}</strong></div><div class="review-answer"><span>${copy('Echt antwoord','Actual answer')}</span><strong>${fmt(actual)}</strong></div></div>
      <div class="hist-heading"><strong>${exact ? 'Exact' : ratioLabel+' '+direction}</strong><span>${copy('Zo werd er geschat','How people guessed')}</span></div>
      <p class="hist-demo"><span title="${copy('Voorbeeldgegevens, geen echte spelers','Sample data, not real players')}">Demo</span></p>
      <svg class="ratio-chart histogram-chart" viewBox="0 0 560 250" role="img" aria-labelledby="histTitle histDesc">
        <title id="histTitle">${copy('Voorbeeldverdeling met jouw echte schatting','Sample distribution with your actual estimate')}</title>
        <desc id="histDesc">${copy('Hogere balken betekenen meer voorbeeldspelers. Geel is jouw schatting; de stippellijn is het echte antwoord. Logaritmische schaal met ronde schaalgetallen.','Taller bars mean more sample players. Yellow marks your estimate; the dashed line is the actual answer. Logarithmic scale with rounded tick values.')}</desc>
        <line x1="42" x2="518" y1="198" y2="198" class="ratio-grid"/>${bars}
        <line x1="280" x2="280" y1="48" y2="199" class="hist-actual"/>
        <line x1="${guessX}" x2="${guessX}" y1="44" y2="199" class="hist-you"/>
        <rect x="${labelX-32}" y="15" width="64" height="26" rx="5" fill="#FFD84A"/>
        <text x="${labelX}" y="33" text-anchor="middle" class="hist-you-label">${Math.abs(logRatio)>3 ? (logRatio<0?'← ':'→ ') : ''}${copy('Jij','You')}</text>
        ${ticks}
        <text x="280" y="243" text-anchor="middle" class="hist-tick">${copy('ECHT ANTWOORD','ACTUAL ANSWER')}</text>
      </svg>
      ${Math.abs(logRatio)>3 ? `<div class="hist-footnote">${copy('Jouw schatting valt buiten de schaal.','Your estimate is outside the scale.')}</div>` : ''}
      <details class="hist-data"><summary>${copy('Bekijk voorbeeldpercentages','View sample percentages')}</summary><div>${bins.map((percent,i)=>`<span>${new Intl.NumberFormat(nettoNumberLocale(),{maximumSignificantDigits:3}).format(2**(-3+i/2))}–${new Intl.NumberFormat(nettoNumberLocale(),{maximumSignificantDigits:3}).format(2**(-3+(i+1)/2))}×: ${percent}%</span>`).join('')}</div></details>`;
    document.getElementById('selectedReviewQuestion').textContent = [PUZZLE_DATA.q1_label,PUZZLE_DATA.q2_label,PUZZLE_DATA.q3_label][index];
    [PUZZLE_DATA.q1_label,PUZZLE_DATA.q2_label,PUZZLE_DATA.q3_label].forEach((label,i) => { document.getElementById('overviewQuestion'+i).textContent = label; });
    if (!overview) {
      const bron = maakBronpaneel(PUZZLE_DATA['q' + (index + 1) + '_label']);
      if (bron) container.querySelector('.review-comparison').insertAdjacentElement('afterend', bron);
    }
    if (restoreFocus) container.querySelector(`[data-question="${selected}"]`)?.focus();
  }
  // =========================================================================
  // 5. WORDLE-STIJL SCORE DELEN
  // =========================================================================
  function shareScore() {
    const plays = getLocalPlays();
    const pKey = getActivePuzzleKey();
    const play = plays[pKey] || plays[TODAY_STR];
    if (!play) return;

    const echt = PUZZEL_ECHT();
    const s1 = scoreVraag(play.g1, echt.a1);
    const s2 = scoreVraag(play.g2, echt.a2);
    const s3 = scoreVraag(play.g3, echt.a3);
    const streak = getLocalStreak();
    const acc = Math.round(100 / play.factor);

    function formatLine(emoji, g, a, f) {
      if (Math.abs(g - a) < 0.001) return `🎯 Spot on!`;
      const qAcc = Math.round(100 / f);
      return `${emoji} ${qAcc}% (${f.toFixed(2)}×)`;
    }

    const r1 = getFactorRating(s1);
    const r2 = getFactorRating(s2);
    const r3 = getFactorRating(s3);

    const text = `Netto #${PUZZLE_DATA.number} · Score: ${acc}% 🎯 (${play.factor.toFixed(2)}×)\n1️⃣ ${formatLine(r1.emoji, play.g1, echt.a1, s1)}\n2️⃣ ${formatLine(r2.emoji, play.g2, echt.a2, s2)}\n3️⃣ ${formatLine(r3.emoji, play.g3, echt.a3, s3)}\n🔥 Streak: ${streak} ${streak === 1 ? 'dag' : 'dagen'}\n${speelAdres()}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        showSarcasticToast("Score gekopieerd naar klembord! Deel het in je groepsapp.", true);
      }).catch(() => fallbackPrompt(text));
    } else {
      fallbackPrompt(text);
    }
  }

  function fallbackPrompt(text) {
    prompt("Kopieer jouw uitslag:", text);
  }

  // =========================================================================
  // 6. CLOUD SYNC & AUTH (Supabase)
  // =========================================================================
  function loadUserProfile() {
    const savedUser = localStorage.getItem('netto_user');
    if (savedUser) {
      try {
        currentUser = JSON.parse(savedUser);
        updateUserUI();
      } catch(e) {}
    }
  }

  function updateUserUI() {
    const userBtn = document.getElementById('topbarUserBtn');
    if (currentUser) {
      document.getElementById('topbarUsername').textContent = currentUser.username || currentUser.email.split('@')[0];
      userBtn.classList.add('logged-in');
      const sidebarAuthLabel = document.getElementById('sidebarAuthLabel');
      if (sidebarAuthLabel) sidebarAuthLabel.textContent = `Profiel (${currentUser.username || 'Speler'})`;
      document.getElementById('profileUsername').textContent = currentUser.username || currentUser.email;
      document.getElementById('profileEmailSubtitle').textContent = currentUser.email;
      document.getElementById('cloudSyncBanner').style.display = 'none';
    } else {
      document.getElementById('topbarUsername').textContent = 'Inloggen';
      userBtn.classList.remove('logged-in');
      const sidebarLabel = document.getElementById('sidebarAuthLabel');
      if (sidebarLabel) sidebarLabel.textContent = 'Inloggen / Registreren';
    }
  }

  // Alles wat je uitgelogd hebt gespeeld staat alleen in localStorage. Log je
  // daarna in, dan bleef dat daar staan: de dagpuzzels die je al had gespeeld
  // kwamen nooit op het leaderboard, en je streak begon aan de serverkant bij
  // nul. Spelen zonder account is nu het normale geval, dus dat gat loopt bijna
  // iedereen in.
  //
  // Bij het inloggen halen we die scores daarom alsnog op. Alleen de
  // dagpuzzels: die zijn op datum vast te leggen, en alleen die tellen voor het
  // scorebord. Bestaat er al een rij voor die dag, dan blijft die staan —
  // ignoreDuplicates zorgt dat een oude speelbeurt op een ander apparaat niet
  // wordt overschreven door wat er toevallig in deze browser stond.
  async function stuurLokaleScoresOp() {
    if (!currentUser || !supabaseClient) return;
    const rijen = Object.entries(getLocalPlays())
      .filter(([sleutel, spel]) => /^\d{4}-\d{2}-\d{2}$/.test(sleutel)
        && spel && Number.isFinite(Number(spel.factor)))
      .map(([datum, spel]) => ({
        user_id: currentUser.id, puzzle_date: datum,
        g1: spel.g1, g2: spel.g2, g3: spel.g3, factor: spel.factor,
      }));
    if (!rijen.length) return;
    try {
      const { error } = await supabaseClient.from('user_plays')
        .upsert(rijen, { onConflict: 'user_id,puzzle_date', ignoreDuplicates: true });
      if (error) console.warn('Lokale scores niet opgestuurd:', error.message || error);
    } catch (err) {
      console.warn('Lokale scores niet opgestuurd:', err);
    }
  }

  async function syncPlayToCloud(dateStr, g1, g2, g3, factor) {
    if (!currentUser) return;

    if (supabaseClient) {
      try {
        // Daily score blijft per datum opgeslagen.
        const { error } = await supabaseClient.from('user_plays').upsert({
          user_id: currentUser.id,
          puzzle_date: dateStr,
          g1, g2, g3, factor
          // Geen spatie na de komma: PostgREST leest dit als een lijst
          // kolomnamen, dus " puzzle_date" zou een onbekende kolom zijn.
        }, { onConflict: 'user_id,puzzle_date' });

        if (error) console.warn('Supabase sync error:', error);
      } catch (err) {
        console.warn('Sync failed:', err);
      }
    }
  }

  async function syncLibraryPlay(puzzle, g1, g2, g3, factor) {
    if (!currentUser || !supabaseClient || !puzzle?.id) return;
    const { error } = await supabaseClient.from('library_plays').upsert({ user_id: currentUser.id, puzzle_id: puzzle.id, g1, g2, g3, factor }, { onConflict: 'user_id,puzzle_id' });
    if (error) console.warn('Library score sync error:', error);
  }


  // ===== Auth helpers: Nederlandse foutmeldingen, validatie, rate limiting =====
  function mapAuthError(message) {
    const m = (message || '').toLowerCase();
    if (m.includes('rate limit') || m.includes('too many requests') || m.includes('email rate'))
      return 'Te veel pogingen. Probeer het over een uur opnieuw.';
    if (m.includes('invalid login credentials'))
      return 'Onjuist e-mailadres of wachtwoord.';
    // E-mailbevestiging staat uit in het Supabase-project. Komt deze fout toch
    // langs, dan is die instelling teruggezet en moet de speler dat weten.
    if (m.includes('email not confirmed'))
      return 'Je account is nog niet bevestigd. Klik op de link in je inbox.';
    if (m.includes('user already registered') || m.includes('already been registered'))
      return 'Er bestaat al een account met dit e-mailadres. Log in of gebruik "Wachtwoord vergeten?".';
    if (m.includes('password should be at least') || m.includes('weak password'))
      return 'Je wachtwoord is te zwak — gebruik minimaal 6 tekens.';
    if (m.includes('invalid format') && m.includes('email'))
      return 'Dit e-mailadres ziet er niet goed uit.';
    if (m.includes('unable to validate email'))
      return 'Dit e-mailadres ziet er niet goed uit.';
    if (m.includes('failed to fetch') || m.includes('network'))
      return 'Kan geen verbinding maken met de server. Controleer je internet.';
    return 'Er ging iets mis: ' + (message || 'onbekende fout');
  }

  function showAuthError(msg) {
    const box = document.getElementById('authErrorBox');
    box.textContent = msg;
    box.style.display = 'block';
  }
  function clearAuthError() {
    const box = document.getElementById('authErrorBox');
    box.style.display = 'none';
  }

  function setAuthBusy(busy) {
    const btn = document.getElementById('authSubmitBtn');
    btn.disabled = busy;
    btn.textContent = busy ? 'Even geduld…' : (authMode === 'login' ? 'Inloggen' : 'Account Aanmaken');
    btn.style.opacity = busy ? '0.6' : '1';
  }

  // Er stond hier een teller die vijf registraties per uur toestond, bewaard in
  // localStorage. Die hield niemand tegen die het echt probeerde — het wissen
  // van je opslag zette hem terug op nul — en stond wel in de weg bij het
  // aanmaken van een paar accounts om het leaderboard te bekijken. Supabase
  // begrenst registraties zelf, aan de serverkant, waar het wel telt.

  function validateAuthInput(email, password, username) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'Vul een geldig e-mailadres in.';
    // Minimale wachtwoordlengte geldt alleen bij registreren: een bestaand
    // account (bijv. met een kort wachtwoord van vóór deze regel) moet
    // gewoon kunnen inloggen — Supabase bewaakt de echte verificatie.
    if (authMode === 'register') {
      if (password.length < 6) return 'Je wachtwoord moet minimaal 6 tekens zijn.';
      if (password.length > 72) return 'Je wachtwoord mag maximaal 72 tekens zijn.';
      if (username) {
        if (username.length < 3 || username.length > 20) return 'Je spelersnaam moet 3 tot 20 tekens zijn.';
      }
    } else {
      if (!password) return 'Vul je wachtwoord in.';
    }
    return null;
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    clearAuthError();
    const email = document.getElementById('authEmail').value.trim().toLowerCase();
    const password = document.getElementById('authPassword').value;
    const username = document.getElementById('authUsername').value.trim() || email.split('@')[0];

    const validationError = validateAuthInput(email, password, username);
    if (validationError) { showAuthError(validationError); return; }

    if (!supabaseClient) {
      showAuthError('De server is momenteel niet beschikbaar. Probeer het later opnieuw — inloggen zonder server is niet mogelijk.');
      return;
    }

    setAuthBusy(true);
    try {
      if (authMode === 'register') {
        // Vooraf kijken of de naam vrij is. profiles.username is uniek, en zonder
        // deze controle liep de registratie stuk in de database-trigger — met een
        // onbegrijpelijke foutmelding in plaats van "die naam is bezet". Faalt de
        // controle zelf, dan gaat de registratie gewoon door; de trigger vangt een
        // botsing alsnog op door er een cijfer achter te zetten.
        try {
          const { data: vrij, error: checkFout } =
            await supabaseClient.rpc('username_beschikbaar', { p_naam: username });
          if (!checkFout && vrij === false) {
            showAuthError(statsCopy(
              `De spelersnaam "${username}" is al bezet. Kies een andere.`,
              `The player name "${username}" is taken. Please pick another.`));
            setAuthBusy(false);
            return;
          }
        } catch (_) { /* controle overslaan, trigger vangt het op */ }
        const { data, error } = await supabaseClient.auth.signUp({
          email, password,
          options: { data: { username }, emailRedirectTo: eigenAdres() }
        });
        if (error) throw error;
        // Met e-mailbevestiging uit levert signUp meteen een sessie op en ben je
        // dus direct ingelogd. Staat die instelling in het Supabase-project toch
        // weer aan, dan komt er geen sessie terug en is dit de uitleg.
        if (!data.session) {
          showSarcasticToast('Account aangemaakt! Bevestig je e-mailadres via de link in je inbox, daarna kun je inloggen.', true);
          setAuthBusy(false);
          return;
        }
        currentUser = { id: data.user.id, email, username };
      } else {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        currentUser = { id: data.user.id, email, username: data.user.user_metadata?.username || username };
      }
    } catch (err) {
      showAuthError(mapAuthError(err.message));
      setAuthBusy(false);
      return;
    }
    setAuthBusy(false);

    localStorage.setItem('netto_user', JSON.stringify(currentUser));
    updateUserUI();
    stuurLokaleScoresOp();
    laadLeaderboardZichtbaar();
    closeAuthModal();
    showSarcasticToast(`Welkom terug, ${currentUser.username}! Je scores zijn gesynchroniseerd.`, true);
    checkSubmissionNotifications();

    // Sync eventuele vandaag al gespeelde puzzel
    const plays = getLocalPlays();
    if (plays[TODAY_STR]) {
      const p = plays[TODAY_STR];
      syncPlayToCloud(TODAY_STR, p.g1, p.g2, p.g3, p.factor);
    }
  }

  // ===== Wachtwoord vergeten =====
  function showForgotPassword() {
    clearAuthError();
    document.getElementById('authFormView').style.display = 'none';
    document.getElementById('authForgotView').style.display = 'block';
    const email = document.getElementById('authEmail').value.trim();
    if (email) document.getElementById('forgotEmail').value = email;
  }
  function backToAuthForm() {
    document.getElementById('forgotErrorBox').style.display = 'none';
    document.getElementById('authForgotView').style.display = 'none';
    document.getElementById('authFormView').style.display = 'block';
  }
  async function handleForgotPassword(e) {
    e.preventDefault();
    const box = document.getElementById('forgotErrorBox');
    box.style.display = 'none';
    const email = document.getElementById('forgotEmail').value.trim().toLowerCase();
    if (!supabaseClient) {
      box.textContent = 'De server is momenteel niet beschikbaar. Probeer het later opnieuw.';
      box.style.display = 'block';
      return;
    }
    const btn = document.getElementById('forgotSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Versturen…';
    try {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(
        email, { redirectTo: eigenAdres() });
      if (error) throw error;
      backToAuthForm();
      showSarcasticToast('Resetlink verstuurd! Check je inbox (ook de spam-map).', true);
    } catch (err) {
      box.textContent = mapAuthError(err.message);
      box.style.display = 'block';
    }
    btn.disabled = false;
    btn.textContent = 'Verstuur resetlink';
  }

  function handleLogout() {
    if (supabaseClient) supabaseClient.auth.signOut();
    currentUser = null;
    localStorage.removeItem('netto_user');
    leaderboardZichtbaar = true;   // standaard terug voor de volgende speler
    werkLeaderboardToggleBij();
    updateUserUI();
    closeAuthModal();
    showSarcasticToast("Succesvol uitgelogd.", true);
  }

  function toggleAuthMode() {
    authMode = authMode === 'login' ? 'register' : 'login';
    clearAuthError();
    document.getElementById('authTitle').textContent = authMode === 'login' ? 'Inloggen' : 'Registreren';
    document.getElementById('authSubmitBtn').textContent = authMode === 'login' ? 'Inloggen' : 'Account Aanmaken';
    document.getElementById('usernameGroup').style.display = authMode === 'register' ? 'block' : 'none';
    document.getElementById('authToggleText').textContent = authMode === 'login' ? 'Nog geen account? ' : 'Al een account? ';
    document.getElementById('authToggleLink').textContent = authMode === 'login' ? 'Registreer gratis' : 'Log hier in';
  }

  // =========================================================================
  // 7. LEADERBOARD RENDERING
  // =========================================================================
  // Het leaderboard draaide op verzonnen namen terwijl het inlogscherm belooft
  // dat je erop komt te staan. Nu echte spelers, opgehaald via twee
  // security-definer functies: de policies laten een speler alleen zijn eigen
  // rijen zien en dat blijft zo — die functies geven uitsluitend een naam en
  // een score terug, geen e-mailadressen of andermans schattingen.
  function leaderboardDagen() {
    return DAILY_PUZZLES.filter(puzzel => puzzel.date && puzzel.date <= TODAY_STR)
      .slice().sort((a, b) => a.date.localeCompare(b.date));
  }

  function leaderboardStandaarddag() {
    const dagen = leaderboardDagen();
    return dagen.find(puzzel => puzzel.date === TODAY_STR)?.date || dagen.at(-1)?.date || TODAY_STR;
  }

  function leaderboardDatumTekst(datum, kort = false) {
    const taal = window.NettoI18n?.language === 'en' ? 'en-GB' : 'nl-NL';
    return new Intl.DateTimeFormat(taal, kort
      ? { day: 'numeric', month: 'short' }
      : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    ).format(new Date(datum + 'T12:00:00'));
  }

  function werkLeaderboardDagkopBij() {
    const dagen = leaderboardDagen();
    const index = dagen.findIndex(puzzel => puzzel.date === leaderboardSelectedDate);
    const puzzel = dagen[index];
    const dagNavigatie = document.getElementById('leaderboardDayNav');
    const vandaagTab = document.getElementById('tabTodayBtn');
    const subtitel = document.getElementById('leaderboardSubtitle');
    const isDag = currentLbTab === 'today';
    document.getElementById('leaderboardScoreHeading').textContent = isDag ? statsCopy('Gem. factor', 'Avg. factor') : statsCopy('Dagen', 'Days');
    document.getElementById('leaderboardVoetnoot').textContent = isDag
      ? statsCopy('De 50 beste scores. Een lagere factor is beter; 1,00× is exact.', 'The top 50 scores. A lower factor is better; 1.00× is exact.')
      : statsCopy('Streaks worden berekend uit werkelijk gespeelde dagen.', 'Streaks are calculated from days actually played.');
    document.getElementById('tabTodayBtn').setAttribute('aria-pressed', String(isDag));
    document.getElementById('tabStreaksBtn').setAttribute('aria-pressed', String(!isDag));
    if (dagNavigatie) dagNavigatie.hidden = !isDag;
    if (!isDag) {
      if (subtitel) subtitel.textContent = statsCopy('De langste actieve reeksen.', 'The longest active streaks.');
      return;
    }
    const isVandaag = leaderboardSelectedDate === TODAY_STR;
    if (vandaagTab) vandaagTab.textContent = statsCopy(
      `Dagpuzzel · ${isVandaag ? 'vandaag' : leaderboardDatumTekst(leaderboardSelectedDate, true)}`,
      `Daily · ${isVandaag ? 'today' : leaderboardDatumTekst(leaderboardSelectedDate, true)}`
    );
    if (subtitel) subtitel.textContent = statsCopy('Wie schat het scherpst? Bekijk de scores per Daily.', 'Who comes closest? Explore the scores for each Daily.');
    const label = document.getElementById('leaderboardDayLabel');
    if (label) label.textContent = puzzel
      ? `Daily #${puzzel.number}${isVandaag ? statsCopy(' · Vandaag', ' · Today') : ''}`
      : leaderboardDatumTekst(leaderboardSelectedDate);
    const keuze = document.getElementById('leaderboardDateSelect');
    keuze.replaceChildren(...dagen.slice().reverse().map(dag => {
      const optie = document.createElement('option');
      optie.value = dag.date;
      optie.textContent = new Intl.DateTimeFormat(window.NettoI18n?.language === 'en' ? 'en-GB' : 'nl-NL', {
        day: 'numeric', month: 'long', year: 'numeric'
      }).format(new Date(dag.date + 'T12:00:00'));
      optie.selected = dag.date === leaderboardSelectedDate;
      return optie;
    }));
    keuze.disabled = !dagen.length;
    const nieuwste = document.getElementById('leaderboardLatestDay');
    nieuwste.hidden = leaderboardSelectedDate === leaderboardStandaarddag();
    nieuwste.textContent = leaderboardStandaarddag() === TODAY_STR
      ? statsCopy('Terug naar vandaag', 'Back to today')
      : statsCopy('Nieuwste Daily', 'Latest Daily');
    const vorige = document.getElementById('leaderboardPreviousDay');
    const volgende = document.getElementById('leaderboardNextDay');
    if (vorige) vorige.disabled = index <= 0;
    if (volgende) volgende.disabled = index < 0 || index >= dagen.length - 1;
  }

  function veranderLeaderboardDag(richting) {
    const dagen = leaderboardDagen();
    const index = dagen.findIndex(puzzel => puzzel.date === leaderboardSelectedDate);
    const volgende = Math.max(0, Math.min(dagen.length - 1, index + richting));
    if (!dagen[volgende] || volgende === index) return;
    leaderboardSelectedDate = dagen[volgende].date;
    renderLeaderboard();
  }

  function resetLeaderboardDag() {
    leaderboardSelectedDate = leaderboardStandaarddag();
  }

  function kiesLeaderboardDag(datum) {
    if (!leaderboardDagen().some(puzzel => puzzel.date === datum)) return;
    leaderboardSelectedDate = datum;
    renderLeaderboard();
  }

  // Uitgelogd mag je het bord gewoon zien; meedoen is wat een account vraagt.
  // Deze uitnodiging komt ONDER de lijst te staan, niet ervoor: eerst laten
  // zien waar het over gaat, dan pas vragen om mee te doen.
  function leaderboardUitnodiging(list) {
    if (currentUser) return;
    const blok = document.createElement('div');
    blok.className = 'lb-uitnodiging';
    const tekst = document.createElement('p');
    tekst.textContent = statsCopy(
      'Je kijkt mee zonder account. Maak er een om zelf tussen de scores te komen.',
      'You are watching without an account. Create one to appear among the scores yourself.');
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = 'hero-cta';
    knop.textContent = statsCopy('Meedoen', 'Join in');
    knop.onclick = () => openAuthModal();
    blok.append(tekst, knop);
    list.appendChild(blok);
  }

  async function renderLeaderboard() {
    const list = document.getElementById('leaderboardList');
    if (!list) return;
    const requestId = ++leaderboardRequestId;
    list.setAttribute('aria-busy', 'true');
    werkLeaderboardDagkopBij();
    list.innerHTML = '';
    const melding = tekst => {
      const div = document.createElement('div');
      div.className = 'lb-leeg';
      div.textContent = tekst;
      list.innerHTML = '';
      list.appendChild(div);
    };
    melding(statsCopy('Laden…', 'Loading…'));

    // Alleen de spelersnaam. Stond hier "username || email", en dan kon een
    // e-mailadres in de vergelijking belanden zodra een profiel geen naam had.
    // Op het bord komt sowieso alleen p.username uit de databank, maar het
    // adres hoort ook hier niet rond te slingeren.
    const eigenNaam = currentUser?.username || null;
    let rijen = [];
    try {
      if (!supabaseClient) throw new Error('geen verbinding');
      const { data, error } = currentLbTab === 'today'
        ? await supabaseClient.rpc('leaderboard_dag', { p_datum: leaderboardSelectedDate })
        : await supabaseClient.rpc('leaderboard_streaks', { p_datum: TODAY_STR });
      if (error) throw error;
      if (requestId !== leaderboardRequestId) return;
      list.setAttribute('aria-busy', 'false');
      rijen = data || [];
    } catch (err) {
      if (requestId !== leaderboardRequestId) return;
      list.setAttribute('aria-busy', 'false');
      console.warn('Leaderboard niet opgehaald:', err.message || err);
      melding(statsCopy('Het leaderboard is even niet bereikbaar.',
                        'The leaderboard is unavailable right now.'));
      return;
    }

    if (!rijen.length) {
      const isVandaag = leaderboardSelectedDate === TODAY_STR;
      melding(currentLbTab === 'today'
        ? statsCopy(isVandaag
            ? 'Nog niemand heeft de daily van vandaag gespeeld. Wees de eerste.'
            : `Voor ${leaderboardDatumTekst(leaderboardSelectedDate)} zijn geen scores ingediend.`,
          isVandaag
            ? 'Nobody has played today\u2019s daily yet. Be the first.'
            : `No scores were submitted for ${leaderboardDatumTekst(leaderboardSelectedDate)}.`)
        : statsCopy('Nog geen streaks. Speel twee dagen op rij om te beginnen.',
                    'No streaks yet. Play two days in a row to get started.'));
      leaderboardUitnodiging(list);
      return;
    }

    list.innerHTML = '';
    rijen.forEach((rij, index) => {
      const ikZelf = eigenNaam && rij.naam === eigenNaam;
      const div = document.createElement('div');
      div.className = 'lb-row' + (ikZelf ? ' me' : '');

      const links = document.createElement('div');
      links.className = 'lb-left';
      const rang = document.createElement('span');
      rang.className = 'lb-rank';
      rang.textContent = '#' + (index + 1);
      const naam = document.createElement('div');
      naam.className = 'lb-name';
      // textContent, geen innerHTML: spelersnamen komen van andere gebruikers.
      naam.textContent = rij.naam + (ikZelf ? statsCopy(' · jij', ' · you') : '');
      links.append(rang, naam);

      const score = document.createElement('span');
      score.className = 'lb-score';
      if (currentLbTab === 'today') {
        score.textContent = Number(rij.factor).toFixed(2) + '\u00d7';
      } else {
        score.classList.add('lb-score-streak');
        // Er stond "1 days", en in het Nederlands zou er "1 dagen" staan.
        // Elders in dit bestand wordt enkelvoud wel afgevangen, hier niet.
        const enkel = Number(rij.streak) === 1;
        score.textContent = rij.streak + ' ' + statsCopy(enkel ? 'dag' : 'dagen',
                                                        enkel ? 'day' : 'days');
      }

      div.append(links, score);
      list.appendChild(div);
    });
    leaderboardUitnodiging(list);
  }

  function switchLbTab(tab) {
    currentLbTab = tab;
    document.getElementById('tabTodayBtn').classList.toggle('active', tab === 'today');
    document.getElementById('tabStreaksBtn').classList.toggle('active', tab === 'streaks');
    werkLeaderboardDagkopBij();
    renderLeaderboard();
  }

  // =========================================================================
  // 8. MODAL & SCREEN CONTROLLERS
  // =========================================================================
  function toggleMenu() {
    document.getElementById('hamburgerBtn').classList.toggle('open');
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('show');
  }

  function closeMenu() {
    document.getElementById('hamburgerBtn').classList.remove('open');
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay').classList.remove('show');
  }

  let countdownTimer = null;

  function updateDailyReviewNav() {
    const nav = document.getElementById('dailyReviewNav');
    const questionsButton = document.getElementById('dailyQuestionsNav');
    const resultsButton = document.getElementById('dailyResultsNav');
    const position = document.getElementById('dailyReviewPosition');
    if (!nav || !questionsButton || !resultsButton || !position) return;
    nav.classList.add('show');
    const showingResults = dailyReviewView === 'results';
    questionsButton.disabled = !showingResults;
    resultsButton.disabled = showingResults;
    questionsButton.setAttribute('aria-disabled', String(!showingResults));
    resultsButton.setAttribute('aria-disabled', String(showingResults));
    position.textContent = showingResults ? 'Resultaat' : 'Vragen';
  }

  function showDailyResults() {
    const questions = document.getElementById('dailyQuestionView');
    const results = document.getElementById('results');
    if (!questions || !results) return;
    dailyReviewView = 'results';
    document.getElementById('screen-puzzle').classList.add('is-review');
    const headline = document.getElementById('dailyHeadline');
    if (headline) headline.textContent = statsCopy('Jouw resultaat.', 'Your result.');
    questions.style.display = 'none';
    results.classList.add('show');
    updateDailyReviewNav();
    results.setAttribute('tabindex', '-1');
    if (document.getElementById('screen-puzzle').classList.contains('active')) {
      results.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  function showDailyQuestions() {
    document.getElementById('screen-puzzle').classList.remove('is-review');
    const headline = document.getElementById('dailyHeadline');
    if (headline) headline.textContent = statsCopy('De vragen.', 'The questions.');
    const questions = document.getElementById('dailyQuestionView');
    const results = document.getElementById('results');
    if (!questions || !results) return;
    dailyReviewView = 'questions';
    questions.style.display = 'block';
    results.classList.remove('show');
    updateDailyReviewNav();
  }

  function resetDailyReviewView() {
    werkDailyVraagDetailsBij();
    const equationError = document.getElementById('dailyEquationError');
    if (equationError) equationError.hidden = true;
    document.getElementById('screen-puzzle').classList.remove('is-review');
    const headline = document.getElementById('dailyHeadline');
    if (headline) headline.innerHTML = statsCopy('Schat het <span class="script">slim.</span>', 'Make a <span class="script">smart guess.</span>');
    const questions = document.getElementById('dailyQuestionView');
    const nav = document.getElementById('dailyReviewNav');
    const results = document.getElementById('results');
    if (questions) questions.style.display = 'block';
    if (nav) nav.classList.remove('show');
    if (results) results.classList.remove('show');
    dailyReviewView = 'questions';
  }

  function londonMidnightTarget() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/London', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now);
    const date = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
    const tomorrow = new Date(Date.UTC(Number(date.year), Number(date.month) - 1, Number(date.day) + 1, 0, 0, 0));
    const london = new Intl.DateTimeFormat('en-US', { timeZone:'Europe/London', timeZoneName:'longOffset', year:'numeric' }).formatToParts(tomorrow).find(p => p.type === 'timeZoneName')?.value || 'GMT';
    const offset = london.match(/GMT([+-])(\d{2}):(\d{2})/);
    const offsetMinutes = offset ? (offset[1] === '+' ? 1 : -1) * (Number(offset[2]) * 60 + Number(offset[3])) : 0;
    return new Date(tomorrow.getTime() - offsetMinutes * 60000);
  }

  function startDailyCountdown() {
    if (activePuzzleIndex !== 0) return;
    const existing = document.getElementById('dailyCountdown');
    if (existing) existing.remove();
    if (countdownTimer) clearInterval(countdownTimer);
    const el = document.createElement('div');
    el.id = 'dailyCountdown';
    el.className = 'countdown-card';
    el.setAttribute('role', 'timer');
    el.setAttribute('aria-live', 'off');
    document.querySelector('#screen-puzzle .card').appendChild(el);
    const tick = () => {
      const ms = Math.max(0, londonMidnightTarget() - new Date());
      const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000);
      el.innerHTML = `<b>${statsCopy('Volgende daily','Next daily')}</b><span>${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}<em>:${String(s).padStart(2,'0')}</em></span>`;
    };
    tick(); countdownTimer = setInterval(tick, 1000);
  }

  function showScreen(name) {
    document.getElementById('fotoCreditsScreen')?.classList.toggle('active', name === 'fotoverantwoording');
    stopPuzzleTimer('library');
    stopPuzzleTimer('catalogus');
    if (name === 'library') document.getElementById('libraryCardGrid').style.display = 'none';
    if (name !== 'race' && raceState) {
      stopRaceTimer();
      raceState = null;
      if (raceDuelSession) leaveRaceRoom();
    }
    if (name === 'home') renderHomeDailyPreview();
    document.getElementById('screen-home').classList.toggle('active', name === 'home');
    document.getElementById('screen-puzzle').classList.toggle('active', name === 'puzzle');
    document.getElementById('libraryScreen').classList.toggle('active', name === 'library');
    document.getElementById('catalogusScreen').classList.toggle('active', name === 'catalogus');
    document.getElementById('raceScreen').classList.toggle('active', name === 'race');
    document.getElementById('breinkrakersScreen').classList.toggle('active', name === 'breinkrakers');
    document.getElementById('settingsScreen').classList.toggle('active', name === 'settings');
    document.getElementById('leaderboardScreen')?.classList.toggle('active', name === 'leaderboard');
    document.getElementById('submitScreen').classList.toggle('active', name === 'submit');
    document.getElementById('calculator').classList.remove('open');
    window.scrollTo(0, 0);
  }

  function getArchiveDates() {
    return DAILY_PUZZLES.map(p => p.date).filter(date => date && date <= TODAY_STR).sort();
  }
  function getArchiveBounds() {
    const dates = getArchiveDates();
    const first = dates[0] || TODAY_STR;
    const last = dates[dates.length - 1] || TODAY_STR;
    return { first: first.slice(0, 7), last: last.slice(0, 7) };
  }
  const latestArchiveMonth = getArchiveBounds().last.split('-').map(Number);
  let archiveMonth = { year: latestArchiveMonth[0], month: latestArchiveMonth[1] };
  function monthLabel(month) { return new Intl.DateTimeFormat(nettoNumberLocale(), { month:'long', year:'numeric' }).format(new Date(archiveMonth.year, month - 1, 1)); }
  function changeArchiveMonth(delta) {
    const next = new Date(archiveMonth.year, archiveMonth.month - 1 + delta, 1);
    const key = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    const bounds = getArchiveBounds();
    if (key < bounds.first || key > bounds.last) return;
    archiveMonth = { year: next.getFullYear(), month: next.getMonth() + 1 };
    renderDailyArchive();
  }
  const LIBRARY_DIFFICULTY_ORDER = ['easy', 'intermediate', 'hard', 'extremely-hard'];
  const LIBRARY_DIFFICULTY_OFFSET = { easy: 0, intermediate: 50, hard: 100, 'extremely-hard': 150 };
  const LIBRARY_DIFFICULTY_LABEL = {
    easy: 'Easy',
    intermediate: 'Intermediate',
    hard: 'Hard',
    'extremely-hard': 'Extremely Hard'
  };

  function libraryPuzzleNumber(difficulty, index) {
    return (LIBRARY_DIFFICULTY_OFFSET[difficulty] || 0) + index + 1;
  }

  function getSavedLibraryPlays() {
    try {
      return JSON.parse(localStorage.getItem('netto_library_plays') || '{}');
    } catch (_) {
      return {};
    }
  }

  function findNextIncompleteLibraryPuzzle(puzzles = libraryPuzzles, plays = getSavedLibraryPlays()) {
    for (const difficulty of LIBRARY_DIFFICULTY_ORDER) {
      const set = puzzles.filter(puzzle => puzzle.difficulty === difficulty);
      const index = set.findIndex(puzzle => !plays[puzzle.id] && !plays[`library_${puzzle.id}`]);
      if (index >= 0) {
        return { difficulty, index, number: libraryPuzzleNumber(difficulty, index), puzzle: set[index] };
      }
    }
    return null;
  }

  function updateContinuePuzzleButton() {
    const button = document.getElementById('btnContinuePuzzle');
    if (!button) return;
    const next = findNextIncompleteLibraryPuzzle();
    const title = button.querySelector('strong');
    if (title) {
      title.textContent = next ? `Speel puzzel ${next.number}` : 'Alle puzzels voltooid ✓';
    } else {
      button.textContent = next ? `Speel puzzel ${next.number} →` : 'Alle puzzels voltooid ✓';
    }
  }

  function startNextPuzzle() {
    dailyArchivePuzzleView = false;
    const next = findNextIncompleteLibraryPuzzle();
    if (!next) {
      selectedDifficulty = 'easy';
      openPuzzles();
      showNoticeToast('Je hebt alle Library-puzzels voltooid. Lekker gewerkt!', '🏆');
      return;
    }
    selectedDifficulty = next.difficulty;
    openPuzzles();
    playLibraryCard(next.puzzle.id);
  }

  let selectedDifficulty = 'easy';
  let libraryIndex = 0;
  let libraryPuzzles = (REBUILT_DATA.library || []).map((p, i) => ({ ...normalizeLibraryPuzzle(p), id: p.id || `local-${i + 1}`, difficulty: p.difficulty || getPuzzleDifficulty(p) }));
  let libraryMode = 'daily';
  let libraryActivePuzzle = null;
