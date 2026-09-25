// Eén fotoweergave voor alle spelmodi; bronvermelding reist altijd mee.

// De generator zet een foto op elke puzzel die hij bouwt, maar de dagpuzzel van
// vandaag komt uit de databank en heeft dat veld niet. Die viel daardoor terug
// op de decoratieve sfeerfoto — een pizza bij een vraag over Antarctica.
// NETTO_FOTOS staat al in de pagina en is op vraagtekst doorzoekbaar, dus de
// foto is alsnog te vinden zonder de databank aan te passen. Dat werkt meteen
// voor elke toekomstige dagpuzzel.
function fotoUitVraagtekst(puzzel) {
  const bron = window.NETTO_FOTOS;
  if (!bron || !puzzel) return null;
  for (const i of [1, 2, 3]) {
    const gevonden = bron[puzzel['q' + i + '_label']];
    if (gevonden) return { ...gevonden, vraag: i };
  }
  return null;
}

// Een puzzel draagt zijn foto zelf mee in het veld photo. Dat veld is gevuld
// toen de puzzel werd gemaakt en veroudert dus: bij de visuele controle zijn er
// veertig foto's afgekeurd, en in vijfentwintig puzzels stond die afgekeurde
// foto nog gewoon in dat veld. NETTO_FOTOS is de enige waarheid, dus als de
// vraag daar niet meer in staat, telt het meegedragen veld niet mee.
function nogInDeBank(puzzel, foto) {
  const bron = window.NETTO_FOTOS;
  if (!bron || !foto) return true;   // geen bank ingeladen: niets te toetsen
  const nr = Number(foto.vraag);
  const bij = nr >= 1 && nr <= 3 ? puzzel?.['q' + nr + '_label'] : null;
  return bij ? Object.prototype.hasOwnProperty.call(bron, bij) : true;
}

function geldigePuzzelfoto(puzzel) {
  const eigen = puzzel?.photo;
  const foto = (eigen && nogInDeBank(puzzel, eigen) ? eigen : null) || fotoUitVraagtekst(puzzel);
  if (!foto || !String(foto.maker || '').trim() || !String(foto.licentie || '').trim()) return null;
  try {
    const bron = new URL(foto.pagina);
    const beeld = new URL(foto.url);
    if (bron.protocol !== 'https:' || bron.hostname !== 'commons.wikimedia.org' || !bron.pathname.startsWith('/wiki/File:') || beeld.protocol !== 'https:') return null;
  } catch (_) { return null; }
  return foto;
}

function fotoBronlink(foto) {
  const link = document.createElement('a');
  link.href = foto.pagina;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Wikimedia Commons ↗';
  return link;
}

function renderPuzzelfoto(lijst, puzzel) {
  lijst.classList.remove('puzzelfoto-lijst');
  lijst.querySelectorAll('.puzzelfoto').forEach(el => el.remove());
  const foto = geldigePuzzelfoto(puzzel);
  if (!foto || ![1, 2, 3].includes(Number(foto.vraag))) return;
  // Beeld bij vraag 1 staat in het midden; bijschrift en bron blijven bij vraag 1 horen.
  const positie = Number(foto.vraag) === 1 ? 2 : Number(foto.vraag);
  const blok = lijst.querySelectorAll('.q-block')[positie - 1];
  if (!blok) return;
  lijst.classList.add('puzzelfoto-lijst');
  const figuur = document.createElement('figure');
  figuur.className = 'puzzelfoto';
  const knop = document.createElement('button');
  knop.type = 'button';
  knop.className = 'daily-photo';
  knop.setAttribute('aria-haspopup', 'dialog');
  knop.setAttribute('aria-controls', 'puzzelFotoDialog');
  const beeld = document.createElement('img');
  beeld.alt = puzzel['q' + foto.vraag + '_label'] || '';
  beeld.width = 132;
  beeld.height = 104;
  beeld.loading = 'lazy';
  beeld.decoding = 'async';
  // Een onbereikbare afbeelding verdwijnt zonder de invoervelden te verplaatsen.
  beeld.onerror = () => { figuur.style.visibility = 'hidden'; };
  beeld.src = foto.url;
  const bijschrift = document.createElement('span');
  bijschrift.textContent = 'Bij vraag ' + foto.vraag + ' ↗';
  knop.append(beeld, bijschrift);
  const credit = document.createElement('figcaption');
  credit.className = 'daily-photo-credit';
  credit.setAttribute('data-i18n-skip', '');
  credit.append(document.createTextNode(foto.maker + ' · ' + foto.licentie + ' · '), fotoBronlink(foto));
  knop.onclick = () => {
    const dialoog = document.getElementById('puzzelFotoDialog');
    const groot = dialoog.querySelector('img');
    groot.src = foto.url;
    groot.alt = beeld.alt;
    const bron = dialoog.querySelector('p');
    bron.replaceChildren(document.createTextNode(foto.maker + ' · ' + foto.licentie + ' · '), fotoBronlink(foto));
    dialoog.showModal();
  };
  figuur.append(knop, credit);
  blok.prepend(figuur);
}

function verzamelFotocredits() {
  const data = window.NETTO_REBUILT_PUZZLES || {};
  const puzzels = [...(data.library || []), ...(data.daily || []), ...(data.reserve || []), ...(data.race || []), ...(window.NETTO_RACE_POOL || [])];
  // Ook ingeladen daily-toewijzingen en de bestaande sfeerfoto's tellen mee.
  if (typeof DAILY_PUZZLES !== 'undefined') puzzels.push(...DAILY_PUZZLES);
  const uniek = new Map();
  const voegToe = foto => {
    if (geldigePuzzelfoto({ photo: foto }) && !uniek.has(foto.pagina)) uniek.set(foto.pagina, foto);
  };
  puzzels.forEach(p => {
    if (p.photo) voegToe(p.photo);
    if (p.image_path && p.image_credit && p.image_source_url) {
      const delen = p.image_credit.split(' · ');
      voegToe({ url: new URL(p.image_path, document.baseURI).href, pagina: p.image_source_url, maker: delen.slice(0, -1).join(' · '), licentie: delen.at(-1) });
    }
  });
  (window.NETTO_DAILY_PHOTOS || []).forEach(f => {
    const delen = (f.credit || '').split(' · ');
    // De bestaande lijst bewaart titel, maker en licentie in één creditregel.
    const foto = { url: new URL((window.NETTO_DAILY_PHOTO_DIR || 'fotos/assets/') + f.file, document.baseURI).href, pagina: f.source, maker: delen.slice(1, -1).join(' · '), licentie: delen.at(-1) };
    if (foto.maker && foto.licentie && foto.pagina?.startsWith('https://commons.wikimedia.org/wiki/File:') && !uniek.has(foto.pagina)) uniek.set(foto.pagina, foto);
  });
  return [...uniek.values()].sort((a, b) => a.maker.localeCompare(b.maker, 'nl') || a.licentie.localeCompare(b.licentie, 'nl'));
}

function openFotoverantwoording() {
  closeMenu();
  const lijst = document.getElementById('fotoCreditsLijst');
  lijst.replaceChildren();
  const fotos = verzamelFotocredits();
  lijst.dataset.aantal = fotos.length;
  fotos.forEach(foto => {
    const kaart = document.createElement('article');
    kaart.className = 'foto-credit-kaart';
    kaart.setAttribute('data-i18n-skip', '');
    const beeld = document.createElement('img');
    beeld.src = foto.url;
    beeld.alt = '';
    beeld.width = 160;
    beeld.height = 112;
    beeld.loading = 'lazy';
    beeld.decoding = 'async';
    beeld.onerror = () => { beeld.style.visibility = 'hidden'; };
    const tekst = document.createElement('div');
    const maker = document.createElement('strong');
    maker.textContent = foto.maker;
    const licentie = document.createElement('p');
    licentie.textContent = foto.licentie;
    tekst.append(maker, licentie, fotoBronlink(foto));
    kaart.append(beeld, tekst);
    lijst.append(kaart);
  });
  showScreen('fotoverantwoording');
}
