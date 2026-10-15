# Klok-app POD Logistics: installatie

Werknemers scannen de geprinte QR-code bij de deur met hun eigen telefoon. In die QR-code zit een geheime code, en de telefoon controleert of hij op kantoor is. Zonder scan kan niet geklokt worden. Hun telefoon is één keer gekoppeld met een persoonlijke koppel-QR van de beheerder, zonder account of e-mail. Daarna herkent de app ze meteen en tikken ze op één grote knop: **Inklokken** of **Uitklokken**. Jij ziet de uren per dag, week en maand op de beheerpagina en downloadt ze als Excel.

Benodigd: een Google-account (voor Firebase), een GitHub-account en ongeveer 30 minuten. Kosten: €0 voor 30 werknemers.

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
4. **QR bij de deur**: klik **QR-code maken**, dan **Printen**, en hang de QR-code bij de deur.
5. Zet op hetzelfde tabblad de **locatiecheck** aan terwijl je op kantoor bent: klik **Aanzetten: mijn huidige plek is kantoor**. Lukt dat niet (geen toestemming voor locatie)? Klik in Google Maps met de rechtermuisknop op het gebouw, klik op de cijfers bovenaan om ze te kopiëren, plak ze in het veld eronder en klik **Vastleggen**. Telefoons kunnen dan alleen binnen de straal (standaard 150 meter) klokken.
6. Vanaf dan: QR-code bij de deur scannen, de app herkent de telefoon, en één tik op **Inklokken** of **Uitklokken**.
   Zonder verse scan laat de telefoon geen knop zien. De pagina later opnieuw openen werkt dus niet.

Goed om te weten:
- Een koppel-QR werkt maar één keer en is 7 dagen geldig. Zo kan niemand anders er later mee koppelen.
- Nieuwe telefoon, of browsergegevens gewist? Klik bij de werknemer op **ontkoppelen** en maak een nieuwe Koppel-QR.
- iPhone wist websitegegevens als de site langer dan ongeveer 7 dagen niet is geopend (bijvoorbeeld na vakantie). Dan meldt de app "Telefoon nog niet gekoppeld" en maak je een nieuwe Koppel-QR.
- Werknemers krijgen bij de eerste keer klokken de vraag of de site hun locatie mag gebruiken. Ze moeten dan **Toestaan** kiezen.
- Gaat er een foto van de QR-code rond? Klik **Nieuwe code maken** en print opnieuw. De oude print werkt dan direct niet meer.
- Nog strenger: onder **Liever een tablet bij de deur?** koppel je een tablet die een QR-code toont die elke 30 seconden wisselt.
- Gebruik bij het scannen de gewone camera-app. Die opent Safari (iPhone) of Chrome (Android), waar de koppeling bewaard blijft.

---

## Dagelijks gebruik (beheerder)

- **Uren**: kies een periode (dd-mm-jjjj) en eventueel één persoon, en je ziet de uren per dag, per week en per maand. Kies je één persoon, dan zie je ook per dag de eerste in, laatste uit, geklokte tijd en pauze.
- **Pauze**: per gewerkte dag gaat er automatisch 45 minuten pauze af, of 60 minuten bij meer dan 10 uur geklokt. Werknemers hoeven voor de pauze niet uit te klokken. Andere regels? Pas `PAUZE` aan in `config.js`.
- Alle tijden zijn Nederlandse tijd (24-uurs), ook als je computer anders is ingesteld. Bovenaan staat een rode melding als iemand vergeten is uit te klokken.
- **Download Excel**: één bestand met de uren per dag (eerste in, laatste uit, uren), overzichten per dag, week en maand, en alle registraties.
  Het tabblad *Registraties* heeft dezelfde eerste drie kolommen als het eerdere Excel-sjabloon en kun je daar ook in plakken.
- **Registraties & correcties**: voeg een vergeten uitklok toe of verwijder een foute registratie. Correcties zijn herkenbaar als "correctie door …".
- **Werknemers**: iemand uit dienst? Zet "Mag klokken" uit. De uren blijven bewaard. Je kunt hier ook een tweede beheerder aanwijzen.

## Hoe is het beveiligd?

- Klokken kan alleen met de geheime code uit de QR-code bij de deur. Zonder die code weigert de database de klok.
- Met de locatiecheck aan moet de telefoon op kantoor zijn. Die check gebeurt op de telefoon: iemand met technische kennis en een foto van de QR-code kan hem omzeilen. Wil je dat helemaal uitsluiten, gebruik dan de tablet met wisselende QR-code.
- Iedere telefoon is via een eenmalige, persoonlijke koppel-QR aan één werknemer gekoppeld. De database accepteert alleen een klok **voor de werknemer van die telefoon**, met **de tijd van de server** (niet die van de telefoon).
- Werknemers kunnen niets wijzigen of verwijderen en zien alleen hun eigen klokken.
- Alleen werknemers die op "Mag klokken" staan, kunnen klokken. Ontkoppelen of "Mag klokken" uitzetten werkt direct.
- De app slaat alleen de afstand tot kantoor op, niet de locatie zelf.

## Privacy (AVG)

Informeer werknemers dat hun werktijden en e-mailadres worden vastgelegd voor de urenregistratie, en hoe lang je dat bewaart (voor de loonadministratie gelden fiscale bewaartermijnen). De gegevens staan in Firebase in de EU-regio die je in stap 2 kiest.

## Gratis limieten (Firebase Spark-abonnement)

Per dag 50.000 keer lezen en 20.000 keer schrijven. Met 30 werknemers gebruik je daar minder dan 1% van (met een tablet bij de deur ongeveer 15%).
