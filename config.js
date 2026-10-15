// ------------------------------------------------------------------
// Instellingen van de klok-app. Dit is het enige bestand dat je hoeft
// aan te passen. Zie HANDLEIDING.md, stap 5 en 7.
// ------------------------------------------------------------------

// Firebase > Projectinstellingen > Algemeen > Jouw apps > Web-app > "Config".
// Deze gegevens zijn niet geheim; de beveiliging zit in firestore.rules.
export const firebaseConfig = {
  apiKey: "AIzaSyC7XC1X_6B1vbi-o005Z0NpwfWUqRyfook",
  authDomain: "pod-klok.firebaseapp.com",
  projectId: "pod-klok",
  appId: "1:113447922645:web:23a6577915fea430a72b5c",
};

export const BEDRIJFSNAAM = "POD Logistics";

// Inloggen met Microsoft: alleen werkaccounts van POD Logistics (Directory/tenant ID
// van de Azure-app "Klok-app"). null = Microsoft-knop verbergen.
export const MICROSOFT_TENANT = "d6520df1-4cc1-4777-ab40-423852bfb41e";

// Inloggen via een link per e-mail. Werkt voor elk e-mailadres, maar het
// gratis Firebase-abonnement verstuurt maximaal 5 van deze mails per dag.
export const EMAIL_LINK_LOGIN = false;

// Optioneel: alleen klokken binnen een straal rond kantoor (locatiecheck).
// null = uit. Voorbeeld: { lat: 51.8853, lng: 4.3108, straalMeter: 250 }
export const KANTOOR = null;

export const TIJDZONE = "Europe/Amsterdam";
