# Herbruikbare begripsuitleg

De goedgekeurde proef gebruikt een stippellijn onder een begrip in de vraag.
Hover, toetsenbordfocus of een klik/tik opent een korte uitleg. Escape, buiten
de uitleg klikken of het antwoordveld selecteren sluit de uitleg. De vraagtekst
en het antwoord blijven ongewijzigd. Dezelfde CSS volgt het lichte/donkere thema.

## Een begrip toevoegen

Voeg in `js/core.js` één item toe aan `vraagBegrippen`:

```js
{
  term: 'Parthenon',
  nl: 'Een oude Griekse tempel op de Akropolis in Athene.',
  en: 'An ancient Greek temple on the Acropolis in Athens.'
}
```

Optioneel: `aliassen: ['Andere schrijfwijze', 'English name']`.
De herkenning gebruikt de weergegeven, vertaalde vraag, negeert hoofdletters
en herkent alleen hele begrippen. Langere namen gaan voor kortere namen.
Leestekens in een begrip worden letterlijk behandeld, niet als zoekexpressie.
Gebruik unieke namen en aliassen, met een korte uitleg in beide talen.

Geen aparte markup, CSS of eventhandlers per woord nodig:
`verrijkVraagBegrippen(label, vraag)` verzorgt de koppeling,
`toonBegripUitleg(knop, uitleg)` de gedeelde tooltip.
De CSS-klassen zijn `.vraag-begrip` en `.vraag-begrip-uitleg`.

## Huidige afbakening

Alleen de Parthenon-vraag in de Daily heeft deze proef. Het aanroepen van
`verrijkVraagBegrippen` is in `werkVraagDetailsBij` beperkt tot
`#dailyQuestionView`. Gewone puzzels, Race en Find the Connection blijven
ongewijzigd. Breid woorden of spelmodi pas uit na toestemming van de gebruiker.

Uitleg beschrijft wat iets is, nooit het gevraagde aantal, jaartal of een hint
naar het antwoord. Vraag en antwoord mogen niet door deze voorziening wijzigen.

## Controle bij een wijziging

- Controleer hover, klik/tik, toetsenbordfocus en Escape.
- Controleer dat herhaald renderen geen dubbele knoppen maakt en vertaling werkt.
- Controleer dat puzzels buiten de proef geen nieuwe uitleg krijgen.
- Verhoog de cacheversie van gewijzigde JS/CSS in alle verwijzende HTML-bestanden.
- Draai `python tools/sync_website.py` en daarna dezelfde opdracht met `--check`.
- Werk lokale routepagina's bij met `python tools/bouw_routes.py --site .`.
  De deployroutepagina's worden door de publicatieworkflow gegenereerd.
