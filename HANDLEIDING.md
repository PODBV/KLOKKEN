# Klok-app POD Logistics: installatie

Werknemers scannen de QR-code op een tablet bij de deur met hun eigen telefoon. Die QR-code wisselt elke 30 seconden, dus klokken kan alleen wie op dat moment bij de deur staat. Hun telefoon is één keer gekoppeld met een persoonlijke koppel-QR van de beheerder, zonder account of e-mail. Daarna herkent de app ze meteen en tikken ze op één grote knop: **Inklokken** of **Uitklokken**. Jij ziet de uren per dag, week en maand op de beheerpagina en downloadt ze als Excel.

Benodigd: een Google-account (voor Firebase), een GitHub-account, een tablet of oude telefoon voor bij de deur (met oplader en wifi) en ongeveer 30 minuten. Kosten: €0 voor 30 werknemers.

---

## Stap 1. Firebase-project aanmaken

1. Ga naar https://console.firebase.google.com en log in met een Google-account van het bedrijf.
2. Klik **Project maken**, naam bijv. `pod-klok`. Google Analytics mag uit.

## Stap 2. Database aanmaken

1. Links: **Build > Firestore Database > Database maken**.
2. Kies locatie **eur3 (Europe)** of `europe-west4 (Nederland)`, en **productiemodus**.
3. Tabblad **Regels**: verwijder wat er staat, plak de inhoud van `firestore.rules` en klik **Publiceren**.
4. Tabblad **Gegevens**: klik **Collectie starten**.
   - Collectie-ID: `beheerders`
   - Document-ID: jouw e-mailadres in kleine letters, bijv. `stan@podlogistics.nl`
   - Veld: `naam` (string) = `Stan`, en opslaan.

   Dit is de enige keer dat je in de database zelf werkt. Werknemers voeg je straks toe op de beheerpagina.

## Stap 3. Inlogmethodes aanzetten

**Build > Authentication > Aan de slag > Inlogmethode**:

1. **Anonymous** (anoniem): inschakelen en opslaan. Dit gebruiken de telefoons van werknemers na het koppelen met hun persoonlijke QR-code. Werknemers hebben dus geen account of e-mail nodig.
2. **Google**: inschakelen, je e-mailadres als ondersteuningsadres, en opslaan. Dit is voor de beheerder(s).

## Stap 4. Inloggen met Microsoft (optioneel)

Niet nodig: werknemers klokken via hun gekoppelde telefoon. Alleen als een beheerder liever met zijn Microsoft-werkaccount inlogt.

1. Ga in Firebase naar **Authentication > Inlogmethode > Nieuwe provider > Microsoft**. Kopieer de **callback-URL** (`https://…firebaseapp.com/__/auth/handler`).
2. Ga naar https://portal.azure.com > **Microsoft Entra ID > App-registraties > Nieuwe registratie**.
   - Naam: `Klok-app`
   - Ondersteunde accounttypen: **Alleen accounts in deze organisatiemap (één tenant)**. Dit is belangrijk voor de veiligheid.
   - Omleidings-URI: platform **Web**, plak de callback-URL, en klik **Registreren**.
3. Noteer op de overzichtspagina de **Toepassings-id (client)** en de **Map-id (tenant)**.
4. **Certificaten en geheimen > Nieuw clientgeheim**, met een geldigheid van 24 maanden. Kopieer de **Waarde**.
5. Terug in Firebase, bij de Microsoft-provider: vul de toepassings-id en het geheim in, schakel in en sla op.
6. Vul de tenant-id in `config.js` in bij `MICROSOFT_TENANT` (tussen aanhalingstekens).

Zet in je agenda: het clientgeheim verloopt na 24 maanden. Maak dan een nieuw geheim en vul het in Firebase in.

## Stap 5. App-gegevens invullen

1. Firebase: tandwiel > **Projectinstellingen > Algemeen > Jouw apps > Web (`</>`)**. Bijnaam `klok`, **zonder** Firebase Hosting, en registreren.
2. Je ziet een blok `firebaseConfig`. Neem `apiKey`, `authDomain`, `projectId` en `appId` over in `config.js`.

## Stap 6. Website op GitHub Pages zetten

1. Maak een account op https://github.com (gratis).
2. Klik **New repository**, naam `klok`, **Public**, en **Create repository**.
   (De code is dan openbaar. Dat is geen probleem: er staan geen wachtwoorden in, en de gegevens zitten beveiligd in Firebase.)
3. Klik **uploading an existing file** en selecteer **alle bestanden** uit de map `klok-app` (alles staat in één map, zonder submappen) en sleep ze erin. Klik dan **Commit changes**.
4. **Settings > Pages**: Source **Deploy from a branch**, branch **main**, map **/ (root)**, en **Save**.
5. Na een minuut staat de app op `https://<jouw-github-naam>.github.io/klok/`.

## Stap 7. Domein toestaan in Firebase

Firebase: **Authentication > Instellingen > Geautoriseerde domeinen > Domein toevoegen**: `<jouw-github-naam>.github.io`

## Stap 8. In gebruik nemen

1. Open `https://<jouw-github-naam>.github.io/<repository>/beheer.html` en log in met Google, met het adres uit stap 2.
2. **Werknemers**: voeg iedere werknemer toe. Een naam is genoeg; een e-mailadres is niet nodig.
3. Klik bij de werknemer op **Koppel-QR**. Laat de werknemer die code één keer scannen met de gewone camera van zijn eigen telefoon, of stuur de link via **Link kopiëren** in een persoonlijk appje. De telefoon is dan gekoppeld ("Hoi Lois").
4. **Deurscherm**: klik **Deurscherm koppelen**. Scan de QR-code die verschijnt met de camera van de **tablet** die bij de deur komt (of open de link daar). De tablet toont dan de wisselende klok-QR.
   Hang de tablet bij de deur aan de oplader. Zet in de instellingen van de tablet het automatisch vergrendelen uit, of op zo lang mogelijk.
5. Vanaf dan: QR-code op de tablet scannen, de app herkent de telefoon, en één tik op **Inklokken** of **Uitklokken**.
   Zonder verse scan laat de telefoon geen knop zien. De pagina later opnieuw openen of een foto van de QR-code gebruiken werkt niet.

Goed om te weten:
- Een koppel-QR werkt maar één keer en is 7 dagen geldig. Zo kan niemand anders er later mee koppelen.
- Nieuwe telefoon, of browsergegevens gewist? Klik bij de werknemer op **ontkoppelen** en maak een nieuwe Koppel-QR.
- iPhone wist websitegegevens als de site langer dan ongeveer 7 dagen niet is geopend (bijvoorbeeld na vakantie). Dan meldt de app "Telefoon nog niet gekoppeld" en maak je een nieuwe Koppel-QR.
- Staat de tablet uit, of heeft hij geen internet? Dan kan niemand klokken. Op het tabblad **Deurscherm** zie je of hij aan staat. Vergeten klokken voeg je toe bij **Registraties & correcties**.
- Gebruik bij het scannen de gewone camera-app. Die opent Safari (iPhone) of Chrome (Android), waar de koppeling bewaard blijft.

---

## Dagelijks gebruik (beheerder)

- **Uren**: kies een periode en je ziet de uren per dag, per week en per maand. Bovenaan staat een rode melding als iemand vergeten is uit te klokken.
- **Download Excel**: één bestand met de uren per dag (eerste in, laatste uit, uren), overzichten per dag, week en maand, en alle registraties.
  Het tabblad *Registraties* heeft dezelfde eerste drie kolommen als het eerdere Excel-sjabloon en kun je daar ook in plakken.
- **Registraties & correcties**: voeg een vergeten uitklok toe of verwijder een foute registratie. Correcties zijn herkenbaar als "correctie door …".
- **Werknemers**: iemand uit dienst? Zet "Mag klokken" uit. De uren blijven bewaard. Je kunt hier ook een tweede beheerder aanwijzen.

## Hoe is het beveiligd?

- Klokken kan alleen met de QR-code die op dat moment op het deurscherm staat. De code wisselt elke 30 seconden en de database weigert een code die ouder is dan ongeveer een minuut. Thuis klokken met een foto of een bewaarde link werkt dus niet.
- Iedere telefoon is via een eenmalige, persoonlijke koppel-QR aan één werknemer gekoppeld. De database accepteert alleen een klok **voor de werknemer van die telefoon**, met **de tijd van de server** (niet die van de telefoon).
- Werknemers kunnen niets wijzigen of verwijderen en zien alleen hun eigen klokken.
- Alleen werknemers die op "Mag klokken" staan, kunnen klokken. Ontkoppelen of "Mag klokken" uitzetten werkt direct.
- Optioneel: zet in `config.js` bij `KANTOOR` de coördinaten van het kantoor. Dan kan alleen geklokt worden binnen die straal. De app slaat alleen de afstand op, niet de locatie zelf. Deze check gebeurt op de telefoon, dus iemand met technische kennis kan hem omzeilen. Zie het als drempel, niet als waterdichte controle.

## Privacy (AVG)

Informeer werknemers dat hun werktijden en e-mailadres worden vastgelegd voor de urenregistratie, en hoe lang je dat bewaart (voor de loonadministratie gelden fiscale bewaartermijnen). De gegevens staan in Firebase in de EU-regio die je in stap 2 kiest.

## Gratis limieten (Firebase Spark-abonnement)

Per dag 50.000 keer lezen en 20.000 keer schrijven. Het deurscherm schrijft elke 30 seconden een nieuwe code (ongeveer 2.900 keer per dag als hij dag en nacht aan staat); met 30 werknemers blijf je ruim onder de limiet.
