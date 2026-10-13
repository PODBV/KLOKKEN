# Klok-app POD Logistics: installatie

Werknemers scannen de QR-code bij de deur met hun eigen telefoon. De eerste keer loggen ze in met Google, Microsoft of een link per e-mail. Daarna herkent de app ze meteen en tikken ze op één grote knop: **Inklokken** of **Uitklokken**. Jij ziet de uren per dag, week en maand op de beheerpagina en downloadt ze als Excel.

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

1. **Google**: inschakelen, je e-mailadres als ondersteuningsadres, en opslaan.
2. **E-mailadres/wachtwoord**: inschakelen, plus de schakelaar **E-maillink (inloggen zonder wachtwoord)**, en opslaan.
   Let op: het gratis abonnement verstuurt maximaal **5 inlogmails per dag**. Laat werknemers dus bij voorkeur met Google of Microsoft inloggen.

## Stap 4. Inloggen met Microsoft (voor werknemers met een Microsoft-werkaccount)

Sla deze stap over als iedereen met Google of e-maillink inlogt.

1. Ga in Firebase naar **Authentication > Inlogmethode > Nieuwe provider > Microsoft**. Kopieer de **callback-URL** (`https://…firebaseapp.com/__/auth/handler`).
2. Ga naar https://portal.azure.com > **Microsoft Entra ID > App-registraties > Nieuwe registratie**.
   - Naam: `Klok-app`
   - Ondersteunde accounttypen: **Alleen accounts in deze organisatiemap (één tenant)**. Dit is belangrijk voor de veiligheid.
   - Omleidings-URI: platform **Web**, plak de callback-URL, en klik **Registreren**.
3. Noteer op de overzichtspagina de **Toepassings-id (client)** en de **Map-id (tenant)**.
4. **Certificaten en geheimen > Nieuw clientgeheim**, met een geldigheid van 24 maanden. Kopieer de **Waarde**.
5. Terug in Firebase, bij de Microsoft-provider: vul de toepassings-id en het geheim in, schakel in en sla op.
6. Vul de tenant-id in `js/config.js` in bij `MICROSOFT_TENANT` (tussen aanhalingstekens).

Zet in je agenda: het clientgeheim verloopt na 24 maanden. Maak dan een nieuw geheim en vul het in Firebase in.

## Stap 5. App-gegevens invullen

1. Firebase: tandwiel > **Projectinstellingen > Algemeen > Jouw apps > Web (`</>`)**. Bijnaam `klok`, **zonder** Firebase Hosting, en registreren.
2. Je ziet een blok `firebaseConfig`. Neem `apiKey`, `authDomain`, `projectId` en `appId` over in `js/config.js`.

## Stap 6. Website op GitHub Pages zetten

1. Maak een account op https://github.com (gratis).
2. Klik **New repository**, naam `klok`, **Public**, en **Create repository**.
   (De code is dan openbaar. Dat is geen probleem: er staan geen wachtwoorden in, en de gegevens zitten beveiligd in Firebase.)
3. Klik **uploading an existing file** en sleep **de inhoud** van de map `klok-app` erin (index.html, beheer.html, de mappen css en js enz.). Klik dan **Commit changes**.
4. **Settings > Pages**: Source **Deploy from a branch**, branch **main**, map **/ (root)**, en **Save**.
5. Na een minuut staat de app op `https://<jouw-github-naam>.github.io/klok/`.

## Stap 7. Domein toestaan in Firebase

Firebase: **Authentication > Instellingen > Geautoriseerde domeinen > Domein toevoegen**: `<jouw-github-naam>.github.io`

## Stap 8. In gebruik nemen

1. Open `https://<jouw-github-naam>.github.io/klok/beheer.html` en log in met het adres uit stap 2.
2. **Werknemers**: voeg iedere werknemer toe met naam en **het e-mailadres waarmee hij of zij inlogt** (Gmail, Microsoft-werkadres, enz.).
3. **QR-code**: klik **Printen** en hang de QR-code bij de deur.
4. Laat iedere werknemer één keer scannen en inloggen. Vanaf dan:
   scannen, de app zegt "Hoi Fatima", en één tik op Inklokken of Uitklokken.

Tip voor werknemers: scan met de gewone camera-app. Die opent de link in Safari (iPhone) of Chrome (Android), en daar blijft de login bewaard. Wie via een inlogmail inlogt, opent de link uit de mail in diezelfde browser.

---

## Dagelijks gebruik (beheerder)

- **Uren**: kies een periode en je ziet de uren per dag, per week en per maand. Bovenaan staat een rode melding als iemand vergeten is uit te klokken.
- **Download Excel**: één bestand met de uren per dag (eerste in, laatste uit, uren), overzichten per dag, week en maand, en alle registraties.
  Het tabblad *Registraties* heeft dezelfde eerste drie kolommen als het eerdere Excel-sjabloon en kun je daar ook in plakken.
- **Registraties & correcties**: voeg een vergeten uitklok toe of verwijder een foute registratie. Correcties zijn herkenbaar als "correctie door …".
- **Werknemers**: iemand uit dienst? Zet "Mag klokken" uit. De uren blijven bewaard. Je kunt hier ook een tweede beheerder aanwijzen.

## Hoe is het beveiligd?

- Iedere werknemer logt in met een eigen account. De database accepteert alleen een klok **voor het eigen e-mailadres**, met **de tijd van de server** (niet die van de telefoon).
- Werknemers kunnen niets wijzigen of verwijderen en zien alleen hun eigen klokken.
- Alleen e-mailadressen die jij bij Werknemers hebt toegevoegd en die op "Mag klokken" staan, kunnen klokken.
- Optioneel: zet in `js/config.js` bij `KANTOOR` de coördinaten van het kantoor. Dan kan alleen geklokt worden binnen die straal. De app slaat alleen de afstand op, niet de locatie zelf. Deze check gebeurt op de telefoon, dus iemand met technische kennis kan hem omzeilen. Zie het als drempel, niet als waterdichte controle.

## Privacy (AVG)

Informeer werknemers dat hun werktijden en e-mailadres worden vastgelegd voor de urenregistratie, en hoe lang je dat bewaart (voor de loonadministratie gelden fiscale bewaartermijnen). De gegevens staan in Firebase in de EU-regio die je in stap 2 kiest.

## Gratis limieten (Firebase Spark-abonnement)

Per dag 50.000 keer lezen en 20.000 keer schrijven. Met 30 werknemers gebruik je daar minder dan 1% van. Alleen de inlogmails per e-maillink zijn beperkt tot 5 per dag.
