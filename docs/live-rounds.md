# Live Rondes — installatie en controle

## Activeren

1. Voer `supabase/live_rounds.sql` uit in de Supabase SQL Editor.
2. Voer `supabase/live_rounds_puzzles.sql` uit. Dit importeert 274 bestaande racepuzzels in een afgeschermde servercatalogus.
3. Open `/live-rounds/` met twee verschillende ingelogde accounts. Eén account kan maar één speler per room zijn; twee tabs met hetzelfde account tellen niet als twee spelers.
4. Maak een open room of deel de zesletterige roomcode van een privéroom. De host start zodra 2–8 spelers aanwezig zijn.

De update verandert geen bestaande Daily-, profiel- of Race-tabellen. De nieuwe tabellen staan in het niet-publieke schema `netto_live`; alleen de RPC `public.live_rounds` is beschikbaar voor ingelogde spelers. Voeg dat private schema **niet** toe aan de exposed schemas. Publicatie van de frontend installeert de SQL niet automatisch.

## Spelregels van deze eerste versie

- Standaard 60 seconden en 5 rondes. Vrije invoer binnen veiligheidsgrenzen: 5–3.600 seconden, 1–1.000 rondes.
- Drie seconden gezamenlijke aftelling. De vragen reizen alvast mee, maar worden pas bij de start zichtbaar en invoerbaar.
- De bestaande drie vragen en operator blijven ongewijzigd. De som moet voor iedereen kloppen, onafhankelijk van de persoonlijke instelling. Bestaande getalinvoer, autocalculator, eenheden, onderteksten, fotovermelding en kleurpaletten worden hergebruikt.
- Eén definitieve inzending per ronde. Score: het gemiddelde van `max(schatting / antwoord, antwoord / schatting)` over drie vragen.
- De database vergelijkt de ongeronde score; bij een gelijke score wint de vroegste serverinzending. De oplopende servervolgorde maakt zelfs gelijke timestamps deterministisch.
- De ronde eindigt bij de deadline of zodra iedereen heeft ingezonden. Geen geldige inzending betekent geen winnaar en geen punten.
- De reveal duurt acht seconden; daarna begint automatisch de volgende ronde. Aan het einde tellen uitsluitend rondewinsten. Gelijke eindstanden geven gedeelde winnaars. Bij nul punten wint niemand.
- Na het starten geen nieuwe deelnemers. Bestaande deelnemers kunnen via ‘Terug naar je room’ hervatten na een refresh.

## Bestaande infrastructuur en betrouwbaarheid

De mode deelt `supabaseClient`, de racekamerkanaal-helper, de zesletterige roomcodes en de bestaande `netto-race-lobby-v1` Presence-lobby. Live Rondes publiceert `kind: open-live`; Puzzle Race blijft `kind: open-race`. Open rooms van verschillende modes komen niet in elkaars lijst terecht.

Realtime stuurt uitsluitend een wijzigingssignaal, nooit inzendingen of factoren. Elke client haalt de bevoegde serverstatus op en stuurt iedere twee seconden een heartbeat. Zo gaat de wedstrijd ook verder als Realtime of de host wegvalt. Vertraagde/achtergrondtabs halen de serverstatus opnieuw op; lokale timers bepalen nooit de uitslag. Geen extra websocketdienst, framework of frontend-dependency.

Een verbinding geldt na **12 seconden zonder heartbeat** als verbroken. Dit is een bewuste netwerkgraceperiode: een enkele gemiste heartbeat kost niet meteen een ronde. Een verbroken verbinding maakt een inzending voor die ronde ongeldig; bij reconnect kan de speler vanaf de volgende ronde weer meedoen. Expliciet verlaten werkt meteen. Als alle clients weg zijn, is er geen actieve client die de volgende fase opvraagt; bij terugkeer wordt de verlopen ronde afgehandeld. Wachtkamers verlopen na 24 uur, wedstrijden na hun maximale duur plus één uur.

De server beschermt inzendingen van tegenstanders en berekent zelf scores. Dit is **geen volledig anticheatsysteem**: de bestaande statische Netto-vragenbank bevat antwoorden die een technisch vaardige speler kan opzoeken. Die bestaande databank is voor deze feature niet verwijderd of gewijzigd.

De historische rooms blijven vooralsnog in het private schema staan. Voor periodieke opruiming kan de beheerder oude, verlopen rooms verwijderen; leden en inzendingen verdwijnen dan mee via `ON DELETE CASCADE`. Er is nog geen automatische cronjob geïnstalleerd.

## Testen

Geen nieuwe afhankelijkheden in Netto. Voor de losse PostgreSQL-tests kan buiten de repo tijdelijk `@electric-sql/pglite` geïnstalleerd worden:

```text
node tools/test_live_rounds.cjs <pad-naar-@electric-sql/pglite>
```

De tests draaien de echte SQL-migratie in een lege tijdelijke database met fictieve auth-claims. Ze controleren onder andere capaciteit, privacy vóór de reveal, gelijke scores, serverdeadlines, ongeldige invoer, disconnects, hostvertrek en toegangsrechten.

Voor een veilige browserintegratietest, zonder productiedata:

```text
node tools/preview_live_rounds.cjs <pad-naar-@electric-sql/pglite> 8768
```

Open twee tabs: `http://127.0.0.1:8768/live-rounds/?player=1` en dezelfde URL met `player=2`. Deze lokale server gebruikt de echte PostgreSQL-functies; accounts en realtime-berichten zijn gesimuleerd. Hij vervangt alleen in deze testweergave de Supabase-client. De testadapter staat niet in `website/` en wordt niet door de normale website geladen. Dit vervangt niet de laatste controle met echte Supabase-accounts.

Bij een bijgewerkte racepool: `node tools/maak_live_rounds_puzzles.cjs` genereert een nieuwe SQL-import. Alleen uitvoeren wanneer die catalogusupdate gewenst is; het is geen verplichte buildstap.

Voor publicatie:

```text
python tools/sync_website.py
python tools/sync_website.py --check
python tools/bouw_routes.py
```

Controleer met echte accounts: open discovery, privécode, 2–8 spelers, gelijktijdige vragen, vinkjes zonder inzendwaarden, vroegtijdige reveal, lege ronde, gedeelde eindstand, hostvertrek en hervatten. Controleer ook een bestaande Puzzle Race-duel na de gedeelde lobby-aanpassing.
