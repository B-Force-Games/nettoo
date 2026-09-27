"""Leg de redactionele kwaliteitsronde vast zonder goedgekeurde bronvragen te wissen.

Herkenbaarheid en schatbaarheid wegen zwaarder dan een vast aantal puzzels.
De oorspronkelijke selecties en iedere beslissing blijven controleerbaar.
"""
import copy
from collections import Counter
from datetime import date, timedelta
import json
from pathlib import Path
import re
import uuid

ROOT = Path(__file__).resolve().parents[1]
MODES = ('daily', 'library', 'connection')
SNAPSHOT = ROOT / 'puzzels/voor_kwaliteitsreview_20260927.json'

# Elke afgewezen combinatie heeft een eigen reden; de vraagstatus blijft APPROVED.
HOLD = {
 'daily': {
  3:'Venus met handbotten is interessant, maar de Muzen maken deze Daily te specialistisch; opnieuw gecombineerd in FTC.',
  4:'Uraniumprotonen en Shakespeare-sonnetten vragen allebei om specifieke voorkennis.',
  5:'Thaise medeklinkers, Mozart-symfonieën en een exacte uitvindingsdatum bieden te weinig houvast.',
  6:'Pac-Man-pellets en miljarden neuronen zijn samen te specialistisch; de Eiffeltoren krijgt nieuwe partners.',
  7:'Verdiepingen van de Petronas Towers en chemische elementen zijn geen brede Daily-ankers.',
  9:'Een specifieke wolkenkrabberhoogte met chromosomen past minder goed bij deze toegankelijke Daily-selectie.',
  10:'Twee precieze diepte-/traptellingen en een historische reisduur; weinig intuïtieve schatting.',
  11:'Tanganyikameer is de onbekende derde factor; cola en hondentanden krijgen een herkenbare derde vraag.',
  12:'Uienchromosomen en een beursoprichtingsjaar zijn te specialistisch voor een Daily.',
  16:'Nog een alfabetvraag naast een technische attractieduur; te veel vergelijkbare teltrivia.',
  17:'Kiesmannen en de precieze rivierlengte maken twee van de drie vragen lastig te benaderen.',
  18:'Twee Shanghai-bouw-/vervoersrecords naast een afleveringtelling; te weinig spreiding in herkenbaarheid.',
  19:'Een electorale drempel en CN Tower-hoogte maken de Daily te afhankelijk van voorkennis.',
  21:'Drie precieze feiten: oprichtingsjaar, ravijndiepte en een componistencatalogus.',
  22:'Wereldproductie bananen is een industriestatistiek; Minecraft wordt elders opnieuw gebruikt.',
  23:'Onderzeese kabels en TEU-capaciteit zijn technische grootheden zonder eenvoudig dagelijks anker.',
  25:'Harpsnaren, diamantfacetten en een lanceerrecord stapelen specialistische tellingen op.'},
 'library': {
  2:'Camel is zonder soort niet eenduidig; deze combinatie heeft bovendien weinig verrassingswaarde.',
  3:'q989 heeft een bewijszin over de oppervlakte van Egypte, niet over wereldwonderen; broncontrole nodig.',
  9:'Nog een landgrens-telling; octopus en volleybal leveren met Mars een betere combinatie op.',
  10:'De definitie van Oceanië en nog een landentelling voegen weinig toe aan de selectie.',
  15:'Het aantal Aziatische landen is definitiegevoelig en herhaalt landentelvragen.',
  29:'Europa-landen, onderzeese tunnellengte en Titanen zijn samen een specialistische combinatie.',
  30:'De precieze hoogte van Neuschwanstein is een te onbekend anker.',
  31:'Bijbelcanon en het aantal Amerikaanse nationale parken zijn definitie-/peildatumgevoelig; Jupiter wordt hergebruikt.',
  32:'Victoria-meer diepte is een tweede lastig feit naast oorlogsduur; weinig sterke onthulling.',
  36:'Een snel veranderend aantal Jupiter-manen maakt deze combinatie onderhoudsgevoelig.',
  38:'Official languages of India is zonder juridisch onderscheid te ambigu.',
  39:'Oud-Carthago en de Nederlandse Eerste Kamer zijn twee lokale/specialistische ankers; oceaanpercentage overlapt landpercentage.',
  42:'De Euromast maakt de vraag lokaal; opnieuw een wereldwondertelling.',
  44:'Saturnus-manen veranderen snel; niet behouden alleen om 300 te halen.',
  46:'Het aantal paarden van een specifiek monument is geen fijn schatanker; twee andere vragen worden gered.',
  47:'Tanganyikameer en Bijbelcanon maken dit meer opzoekkennis dan een leuke schatting.',
  48:'Leeuwen van Nelsons Column en rif-eilanden zijn allebei specialistische tellingen.',
  50:'Gettysburg-troepenaantal is specialistisch; Ramadan krijgt een betere combinatie.',
  51:'Nog een gebouwtraptelling naast een exact luchtvaartjaar; Afrika krijgt een andere combinatie.',
  53:'CN Tower-trappen zijn repetitieve gebouwtrivia.',
  56:'Nog een Eiffeltoren-traptelling en een definitiegevoelige eerste krant.',
  57:'First TV transmission is onduidelijk zonder definitie; Mars had bovendien de verkeerde bewijszin.',
  61:'De hoeveelheid bedrading in het ISS is te technisch en arbitrair.',
  64:'Bouwduur van Hagia Sophia vraagt specifieke architectuurkennis.',
  65:'Wereldproductie maïs is een industriestatistiek met weinig onthullingswaarde.',
  67:'q1084 bevat een tegenstrijdige tarwe-onderbouwing; bovendien een lokale torenhoogte.',
  68:'Woodlouse-vraag past beter bij een lichtere combinatie; deze verzameling is geen sterke Hard-puzzel.',
  72:'Sahara-uitgestrektheid hangt van de gemeten richting af; weer een draagtijdvraag.',
  74:'Zalmhaven is buiten Nederland nauwelijks herkenbaar.',
  76:'Torah-geboden en bouwduur van de Dom van Keulen zijn twee specialistische feiten.',
  82:'Nog een traptelling naast een historische eerste medische gebeurtenis.',
  84:'Het precieze D-Day-vlootbestand is moeilijk te schatten en Aconcagua vraagt extra voorkennis.',
  85:'De bron zegt expliciet dat de eerste elektrische auto niet één exact uitvindingsjaar heeft.',
  88:'Stroomgebied-landen en jaarlijkse goudproductie maken de puzzel een statistiekenquiz.',
  89:'Romeinse grens, nationale parken en Plato-boeken stapelen definitiegevoelige tellingen op.',
  90:'Uitgegraven Panamakanaalvolume is een technische archiefgrootheid.',
  92:'Cheeseburger krijgt een betere Daily; ijzermassa herhaalt Eiffeltoren-bouwcijfers.',
  93:'Hotelportfolio en een specifiek IMAX-record zijn veranderlijke nichegegevens.',
  94:'Exacte parachutisten-, missie-uur- en verkeerslichttellingen zijn schijnprecisie zonder prettig houvast.',
  95:'Australische kustlengte is afhankelijk van meetmethode; de enorme leger- en kustgetallen geven weinig schatplezier.'},
 'connection': {
  2:'Administratieve territoria en Odysseus-reisduur zijn specialistisch; dartbord wordt hergebruikt.',
  3:'Afsluitdijk is een lokaal anker; Mandela en Nieuw-Zeeland krijgen andere partners.',
  5:'Latijns alfabet en Andes-landen stapelen formele tellingen op.',
  6:'Officiële talen en hoofdringen hangen af van classificatie.',
  7:'Borneo-landen en Australische bestuurlijke delen zijn twee geografische lijstjes.',
  8:'Minaretten zonder foto zijn een zwakke derde vraag; honkbal wordt hergebruikt.',
  9:'Ondertekenaars van een verklaring zijn een specialistische telling; NBA-duur wordt hergebruikt.',
  12:'Kakkerlak-hartkamers zijn specialistische biologie; Apollo wordt hergebruikt.',
  13:'Nieuw-Zeelandse regio’s zijn te administratief voor deze FTC-selectie.',
  16:'Ringen van Uranus en tijdzones van Nieuw-Zeeland zijn definitiegevoelige tellingen.',
  17:'Landen op het Arabisch schiereiland herhalen geografische lijstvragen.',
  18:'Kattenchromosomen zijn niet intuïtief te schatten; Wright-vlucht wordt hergebruikt.',
  19:'Boekhoofdstukken en Senaatstermijn leveren samen weinig schatplezier.',
  20:'Een uitzonderingsregel voor presidentstermijnen maakt de vraag lastig te interpreteren.',
  21:'Chinese provincies en korfbalspelers vragen te veel regionale voorkennis.',
  22:'Specifieke minaretten zonder foto; gespreksvolume wordt hergebruikt.',
  23:'Zaanse Schans-molens en koffieproductie zijn lokale/industriële teltrivia.',
  25:'CFA-frank vereist uitleg voordat een speler kan schatten.',
  26:'Verdiepingen van het Witte Huis en slagduur zijn tamelijk arbitraire feiten.',
  28:'Melanesië en sluiscomponenten zijn onbekende begrippen voor veel spelers.',
  29:'pH, Finse naamvallen en oorlogsduur zijn als combinatie te schools.',
  30:'Torens van Sagrada Família zonder foto; nog een zee-landentelling.',
  32:'Metro-lijnen en Congolese buurlanden zijn repetitieve tellingen; Mars wordt gered.',
  33:'Rechters en religieuze canon zijn specialistisch; Beethoven wordt gered.',
  37:'Filmografie en landen rond een meer zijn definitie-/peildatumgevoelig.',
  38:'Alfabet, regeerduur en landen aan een zee leveren drie formele tellingen op.',
  39:'Kinderdijk en de Nederlandse Kamer zijn lokale kennis, niet internationaal herkenbaar.',
  40:'Mozart-catalogus en Argentijnse provincies zijn twee specifieke kennislijstjes.',
  41:'Landen aan een oceaan en schilderijeninventaris zijn definitiegevoelige tellingen.'}
}

def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf8')

def main():
    if not SNAPSHOT.exists():
        dump(SNAPSHOT, {m:json.loads((ROOT/f'puzzels/{m}_selectie_20260927.json').read_text(encoding='utf8')) for m in MODES})
    old = json.loads(SNAPSHOT.read_text(encoding='utf8'))
    by_id = {q['id']:copy.deepcopy(q) for m in MODES for p in old[m]['puzzles'] for q in p['questions']}
    original_questions = copy.deepcopy(by_id)
    overrides = {
      'q081':dict(subtitle='In Earth hours, rounded to the nearest whole hour.',
        source='https://science.nasa.gov/mars/facts/',
        evidence='Mars completes one rotation in 24.6 Earth hours, which rounds to 25 whole hours.'),
      'q529':dict(subtitle='NASA’s twin space probes.', source='https://science.nasa.gov/mission/voyager/mission-overview/',
        evidence='Together, Voyager 1 and Voyager 2 explored Jupiter, Saturn, Uranus and Neptune: four planets.'),
      'q1137':dict(question='How many kilometres above Earth is the commonly used boundary of space?', subtitle='The Kármán line.'),
      'q935':dict(question='How many metres tall is Australia’s highest mainland mountain?', subtitle='Mount Kosciuszko.'),
      'q971':dict(question='How many time zones does India use?'),
    }
    for qid, fields in overrides.items(): by_id[qid].update(fields)
    # Expliciete aliasgroepen voorkomen dat dezelfde vraag via een ander review-ID terugkomt.
    aliases = [('q131','q622'),('q930','q258'),('q254','q791'),('q171','q174','q175'),
      ('q256','q571'),('q120','q610'),('q392','q625'),('q134','q753'),('q241','q807'),
      ('q564','q878'),('q566','q924'),('q177','q928'),('q335','q967'),('q409','q1139'),
      ('q536','q1444'),('q966','q1485'),('q787','q790'),('q424','q990'),('q051','q052')]
    out = {m:{'edition':f'{m}-curated-20260927','source':old[m]['source'],
      'review_note':'Redactionele selectie: herkenbaarheid, schatbaarheid en variatie; geen door spelers gekalibreerde moeilijkheid.',
      'reserved':{}, 'puzzles':[]} for m in MODES}
    out['daily'].update(start='2026-09-21', approved_count=609,
       sql_template='review_daily_quality_template.sql',sql_output='verfijn_dailies_20260927.sql')
    def add(mode, ids, op, reason, origin=None, level='intermediate'):
        picked = [copy.deepcopy(by_id[qid]) for qid in ids]
        number = len(out[mode]['puzzles'])+1
        assert len({q['category'] for q in picked}) == 3, (mode,ids,'categorieën')
        assert len({q['unit'] for q in picked}) == 3, (mode,ids,'eenheden')
        a,b,c = [q['answer'] for q in picked]
        assert {'+':a+b==c,'−':a-b==c,'×':a*b==c,'÷':a==b*c}[op], (ids,op)
        for q in picked: assert q['answer'] == original_questions[q['id']]['answer']
        key = f'netto/{mode}-curated-20260927/'+op+'/'+','.join(ids)
        puzzle = dict(id=str(uuid.uuid5(uuid.NAMESPACE_URL,key)),number=number,operator=op,
                      questions=picked,note=reason,origin=origin)
        if mode=='daily': puzzle['date']=(date(2026,9,21)+timedelta(days=number-1)).isoformat()
        else:
            puzzle.update(difficulty=level,difficulty_score={'easy':30,'intermediate':50,'hard':70,'extremely-hard':90}[level])
            if origin and origin['mode']==mode:
                before=old[mode]['puzzles'][origin['number']-1]
                if ids==[q['id'] for q in before['questions']] and op==before['operator']:
                    puzzle['id']=before['id']
        # Toon geen foto die een telantwoord verklapt; bewaar altijd volledige attributie.
        photo = None
        if mode!='connection':
            for i in (1,0,2):
                q=picked[i]; f=q.get('photo')
                if f and all(f.get(k) for k in ('url','pagina','maker','licentie')) and not re.search(r'colou?rs|stripes|stars|legs|arms|humps|strings|pawns|rings|atoms|pyramids|pieces.*chess',q['question'],re.I):
                    photo={**f,'vraag':i+1}; break
        if mode!='connection': puzzle['photo']=photo
        else:
            for q in picked: q.pop('photo',None)
        out[mode]['puzzles'].append(puzzle)
    def retain(target, source, number, reason, level=None):
        p=old[source]['puzzles'][number-1]
        add(target,[q['id'] for q in p['questions']],p['operator'],reason,
            {'mode':source,'number':number}, level or p.get('difficulty','intermediate'))
    # Volgorde wisselt bekende onderwerpen af; dezelfde franchise staat niet op opeenvolgende dagen.
    daily=[('daily',1),('library',26),('library',18),('daily',2),('library',28),('new',0),
           ('library',17),('daily',8),('library',19),('daily',14),('library',23),('daily',15),
           ('library',12),('daily',20),('library',25),('library',7),('daily',13),
           ('library',22),('daily',24),('library',16)]
    daily_notes=[
      'Pokémon, Mona Lisa en Antarctica: drie herkenbare onderwerpen met uiteenlopende schaal.',
      'Titanic-reddingsboten, Kanaaltunnel en droog Australië: concrete beelden om op te schatten.',
      'Kolibrievleugels geven de verrassing; Olympische ringen en schaakstukken geven houvast.',
      'Digitale camera, Buckingham Palace en een giraffe: herkenbare objecten met een verrassende aftreksom.',
      'Lichaamswater, vlagstrepen en een walvishart: twee ankers en een sterke grootte-onthulling.',
      'Cheeseburger, Ramadan en Eiffeltoren: voeding, cultuur en een wereldberoemd bouwwerk.',
      'UNO, basketbal en Elizabeth II zijn breed herkenbaar; de vermenigvuldiging verbindt ze onverwacht.',
      'Marsjaar, geluidssnelheid en Titanic: herkenbare onderwerpen, geen chemische of lokale nichekennis.',
      'Tanden en Amerikaanse vlag geven houvast voor de lengte van het Panamakanaal.',
      'Apple en pianotoetsen leiden naar het verrassende kattenrecord.',
      'Friends en voetbal geven eenvoudige ankers voor het gewicht van een tijger.',
      'Tour de France, Vrijheidsbeeld en Everest: bekende sport, monument en historische gebeurtenis.',
      'NAVO, planeten en Japan: korte vragen met algemeen bekende referentiepunten.',
      'Schaakbord, aardoppervlak en Beyoncé: duidelijke grootheden met een gedateerd prijzenaantal.',
      'Kokend water en atletiekbaan maken de reistijd van zonlicht benaderbaar.',
      'Spin, darts en Russische tijdzones: een toegankelijke puzzel tussen de grotere getallen.',
      'Big Mac en melktanden geven alledaagse ankers; één alfabetvraag in de gehele Daily-reeks.',
      'Dartsmaximum, Amerikaanse staten en Mexico-bevolking: sportanker plus schaalgevoel.',
      'Euro, Scrabble en Friends: vertrouwde begrippen en een leuke totaalvergelijking.',
      'Monopoly en vlagstrepen helpen bij een bevolkingsschatting; geen specialistische terminologie.']
    for (source,n),reason in zip(daily,daily_notes):
        if source=='new': add('daily',['q709','q755','q254'],'+',reason)
        else: retain('daily',source,n,reason)
    levels={
      'easy':[1,4,5,6,8,11,13,14,21,24],
      'intermediate':[20,27,33,34,35,37,40,41,43,49],
      'hard':[45,52,54,55,58,59,60,62,63,66,69,70,71,73,75,78,91],
      'extremely-hard':[77,79,80,81,83,86,87,96,97,98,99,100]}
    remixes={5:(['q149','q1335','q131'],'+','Harry Potter vervangt een landengroep: direct herkenbaar.'),
      8:(['q162','q517','q503'],'−','Pissebedpoten, Apollo-bemanning en voetbal vervangen een herhaalde landgrensvraag.'),
      78:(['q1279','q480','q1089'],'×','Dartbord vervangt Kremlintorens: dezelfde som met een herkenbaar voorwerp.'),
      91:(['q605','q1281','q512'],'÷','Jupiters rotatie vervangt een Sahara-landentelling.'),
      96:(['q114','q081','q226'],'×','Marsrotatie vervangt een museuminventaris; de bewijszin en afronding zijn gecontroleerd bij NASA.')}
    for level, numbers in levels.items():
        for n in numbers:
            if n in remixes:
                ids,op,reason=remixes[n];add('library',ids,op,reason,{'mode':'library','number':n},level)
            else:
                reason={'easy':'Behoud: eenvoudige herkenbare ankers, passend bij Easy.',
                  'intermediate':'Behoud: herkenbare onderwerpen met één uitdagender schatting.',
                  'hard':'Behoud als Hard: grotere schattingen en specifiekere kennis, niet in de Daily.',
                  'extremely-hard':'Behoud als Extremely Hard: herkenbare objecten maar zeer lastige grootheden; geen Daily.'}[level]
                retain('library','library',n,reason,level)
    for n in [1,4,10,11,14,15,24,27,31,34,35,36,42]:
        if n==14:
            add('connection',['q1004','q971','q489'],'+','Mandela, India en Monopoly vervangen Albanese letters en nieuwjaarsdruiven.',{'mode':'connection','number':14})
        else: retain('connection','connection',n,'Behoud: herkenbare onderwerpen; één lastiger feit mag door de verbinding worden opgelost.','intermediate')
    for ids,op,reason in [
      (['q012','q164','q346'],'+','Cola, hondentanden en Mona Lisa: drie direct voorstelbare objecten.'),
      (['q080','q107','q397'],'÷','Venus, handbotten en Beethoven; de bekende componist vervangt de Muzen.'),
      (['q1110','q974','N19'],'×','Beatles en Great Lakes helpen bij de verrassende Minecraft-dagduur.'),
      (['q685','q1409','q139'],'−','Octopus, volleybal en Mars: concrete, korte vragen zonder administratieve tellingen.'),
      (['N38','q498','q1134'],'+','Eerste vlucht, NBA en gesprek: herkenbare activiteiten met verschillende meeteenheden.'),
      (['q655','q951','q1490'],'×','Jachtluipaard, Nieuw-Zeeland en Boeing: snelheid, bevolking en vliegtuigcapaciteit.'),
      (['q922','q1420','q079'],'÷','Afrika, Apollo en honkbal geven drie bekende contexten.')]:
        add('connection',ids,op,reason)
    # Reserveer feiten wereldwijd, niet alleen binnen dezelfde spelmodus.
    seen=set()
    for mode in MODES:
        for p in out[mode]['puzzles']:
            for q in p['questions']:
                group=next((g for g in aliases if q['id'] in g),(q['id'],))
                assert not seen.intersection(group), ('hergebruik',q['id'])
                seen.update(group)
                for qid in group: out[mode]['reserved'][qid]=p['number']
    audit=[]
    for mode in MODES:
        for p in old[mode]['puzzles']:
            ids={q['id'] for q in p['questions']}
            destinations=[{'mode':m,'number':n['number'],'questions':sorted(ids.intersection(q['id'] for q in n['questions']))}
              for m in MODES for n in out[m]['puzzles'] if ids.intersection(q['id'] for q in n['questions'])]
            origin_match=next((n for m in MODES for n in out[m]['puzzles'] if n.get('origin')=={'mode':mode,'number':p['number']}),None)
            reason=HOLD[mode].get(p['number']) or (origin_match or {}).get('note')
            assert reason, (mode,p['number'],'ontbrekende beoordeling')
            audit.append({'mode':mode,'number':p['number'],'questions':sorted(ids),'reason':reason,'destinations':destinations})
    report={'counts':{m:len(out[m]['puzzles']) for m in MODES},'reviewed_puzzles':len(audit),
      'used_questions':sum(len(m['puzzles'])*3 for m in out.values()),'reserved_including_aliases':len(seen),
      'held_for_source_check':{'q989':'Bewijszin gaat over oppervlakte, niet over wereldwonderen.',
        'q1084':'Tarwe-antwoord en bewijsberekening spreken elkaar tegen.',
        'q1501':'Bron ondersteunt geen eenduidig eerste uitvindingsjaar.'},
      'source_corrections':{qid:{'before':{k:original_questions[qid].get(k) for k in fields},'after':fields} for qid,fields in overrides.items()},
      'audit':audit}
    assert len(audit)==167
    for mode in MODES: dump(ROOT/f'puzzels/{mode}_selectie_20260927.json',out[mode])
    dump(ROOT/'puzzels/kwaliteitsreview_20260927.json',report)
    lines=['# Kwaliteitsreview — 27 september 2026','',
      'Redactionele beoordeling van alle 167 oorspronkelijke puzzels. Dit is geen volledige externe feitencontrole en geen spelersmeting.',
      'Goedgekeurde bronvragen blijven ongewijzigd bewaard; niet geselecteerd betekent niet door de gebruiker afgekeurd.',
      'Oorspronkelijke selecties: `puzzels/voor_kwaliteitsreview_20260927.json`. Geen productiegegevens gewist of gepubliceerd.','',
      f"Selectie: {report['counts']}. {report['used_questions']} unieke vragen; geen overlap tussen de drie modi.",'',
      '## Nieuwe Dailies','']
    for p in out['daily']['puzzles']:
        a,b,c=[q['answer'] for q in p['questions']]
        lines.extend([f"### Daily {p['number']} — {p['date']}",'',f"**{a} {p['operator']} {b} = {c}** — {p['note']}",''])
        for q in p['questions']: lines.append(f"\n- {q['id']}: {q['question']} — **{q['answer']}**"+(f" ({q['subtitle']})" if q.get('subtitle') else ''))
        lines.append('')
    lines+=['## Bronproblemen','',
      '- q989: Egyptische wereldwonderen — de aangeleverde bewijszin gaat over landoppervlakte. Apart gezet.',
      '- q1084: wereldwijde tarweproductie — antwoord en bewijsberekening verschillen. Apart gezet.',
      '- q1501: eerste elektrische auto — bron onderkent meerdere mogelijke uitvindingsjaren. Apart gezet.',
      '- q081: Marsrotatie had bewijs voor ashelling. [NASA](https://science.nasa.gov/mars/facts/) ondersteunt 24,6 uur; bestaande 25 blijft met expliciete afronding.',
      '- q529: Voyager had navigatieruis als bewijs. [NASA](https://science.nasa.gov/mission/voyager/mission-overview/) noemt Jupiter, Saturnus, Uranus en Neptunus; bestaande 4 blijft.','',
      '## Alle oorspronkelijke combinaties','', '| Reeks | Oud nummer | Reden | Nieuwe bestemming |','|---|---|---|---|']
    for item in audit:
        dest=', '.join(f"{d['mode']} {d['number']} ({', '.join(d['questions'])})" for d in item['destinations']) or 'Bewaard buiten de actieve selectie'
        lines.append(f"| {item['mode']} | {item['number']} | {item['reason']} | {dest} |")
    (ROOT/'docs/kwaliteitsreview_20260927.md').write_text('\n'.join(lines)+'\n',encoding='utf8')
    print(json.dumps({k:v for k,v in report.items() if k not in ('audit','source_corrections')},ensure_ascii=False,indent=2))

if __name__=='__main__':
    main()
