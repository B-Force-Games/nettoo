// Extra context herhaalt uitsluitend expliciete informatie uit de vraag.
// Redactionele aanvullingen kunnen later per exacte vraagtekst worden toegevoegd.
(function () {
  function context(vraag) {
    if (!vraag) return null;
    const editorial = window.NETTO_VRAAG_CONTEXT?.[vraag];
    if (editorial) return editorial;
    const nl = [], en = [];
    const year = vraag.match(/\b(?:stand|anno|peiljaar)\s+(\d{4})\b/i);
    if (year) { nl.push('Peiljaar: ' + year[1] + '.'); en.push('As of ' + year[1] + '.'); }
    // Alleen schaalwoorden in de gevraagde hoeveelheid, niet bijvoorbeeld CO₂ per miljoen.
    const scale = vraag.match(/^Hoeveel\s+(duizend|miljoen|miljard)\b/i) || vraag.match(/\bin\s+(duizend|miljoen|miljard)\b/i);
    if (scale) {
      const names = { duizend: ['duizenden', 'thousands', '1.000', '1,000'], miljoen: ['miljoenen', 'millions', '1.000.000', '1,000,000'], miljard: ['miljarden', 'billions', '1.000.000.000', '1,000,000,000'] };
      const s = names[scale[1].toLowerCase()];
      nl.push('Antwoord in ' + s[0] + ': 1 staat voor ' + s[2] + '.');
      en.push('Answer in ' + s[1] + ': 1 represents ' + s[3] + '.');
    }
    const rounding = vraag.match(/afgerond op (tientallen|honderdtallen|duizendtallen|hele (?:getallen|procenten))/i);
    if (rounding) {
      const names = { tientallen: 'ten', honderdtallen: 'hundred', duizendtallen: 'thousand', 'hele getallen': 'whole number', 'hele procenten': 'whole percentage point' };
      nl.push('Rond af op ' + rounding[1].toLowerCase() + '.');
      en.push('Round to the nearest ' + names[rounding[1].toLowerCase()] + '.');
    }
    return nl.length ? { nl: nl.join(' '), en: en.join(' ') } : null;
  }
  window.NettoVraagContext = context;
})();
