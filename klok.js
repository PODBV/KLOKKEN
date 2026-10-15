// Klokpagina: de wisselende QR-code op het deurscherm opent deze pagina.
import {
  auth, db, nietIngesteld, onAuthStateChanged, collection, doc, getDoc, getDocs,
  addDoc, query, where, serverTimestamp, signInAnonymously, writeBatch,
} from "./firebase.js";
import { toonLogin, rondEmailLinkAf, mijnEmail, uitloggen } from "./login.js";
import { KANTOOR, BEDRIJFSNAAM } from "./config.js";
import { datumVan, tijdTekst, urenTekst, berekenDag, esc, afstandMeter } from "./uren.js";

const el = document.getElementById("app");
document.getElementById("bedrijf").textContent = BEDRIJFSNAAM;

function bericht(titel, tekst, extra = "") {
  el.innerHTML = `<div class="kaart"><h1>${esc(titel)}</h1><p class="sub">${tekst}</p>${extra}</div>`;
}

// ---------- de scan van de deur-QR ----------
// De QR-code op het deurscherm bevat ?s=<scherm>&d=<code>. De code wisselt elke
// 30 seconden en de database accepteert hem maar kort. Zonder verse scan geen knop.
const SCAN_GELDIG_MS = 75000;
function bewaarScan() {
  const p = new URLSearchParams(location.search);
  if (!p.get("s") || !p.get("d")) return;
  try { sessionStorage.setItem("klok-scan", JSON.stringify({ s: p.get("s"), d: p.get("d"), t: Date.now() })); } catch { /* geen opslag */ }
}
function scan() {
  try {
    const x = JSON.parse(sessionStorage.getItem("klok-scan") || "null");
    return x && Date.now() - x.t < SCAN_GELDIG_MS ? x : null;
  } catch { return null; }
}
function scanGebruikt() { try { sessionStorage.removeItem("klok-scan"); } catch { /* geen opslag */ } }

let verloopTimer;
async function vandaag(email) {
  const snap = await getDocs(query(collection(db, "registraties"),
    where("email", "==", email), where("datum", "==", datumVan(new Date()))));
  return snap.docs.map((d) => ({ ...d.data(), tijd: d.data().tijd?.toDate() }));
}

function locatie() {
  return new Promise((ok, fout) => {
    if (!navigator.geolocation) return fout(new Error("Deze telefoon geeft geen locatie door."));
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude, nauwkeurigheid: p.coords.accuracy }),
      () => fout(new Error("Geef de browser toestemming voor je locatie om te kunnen klokken.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}

async function klokScherm(werknemer, flits = "") {
  const email = werknemer.email;
  const dag = berekenDag(await vandaag(email));
  const actie = dag.ingeklokt ? "Uit" : "In";
  const s = scan();
  clearTimeout(verloopTimer);
  if (s) verloopTimer = setTimeout(() => klokScherm(werknemer), SCAN_GELDIG_MS - (Date.now() - s.t) + 500);
  const status = dag.ingeklokt
    ? `Je bent ingeklokt sinds <b>${tijdTekst(dag.ingekloktSinds)}</b>.`
    : dag.laatste ? `Je bent uitgeklokt om <b>${tijdTekst(dag.laatste.tijd)}</b>.` : "Je bent vandaag nog niet ingeklokt.";
  el.innerHTML = `
    <div class="kaart">
      ${flits ? `<div class="flits">${flits}</div>` : ""}
      <h1>Hoi ${esc(werknemer.naam.split(" ")[0])}</h1>
      <p class="sub">${status}${dag.uren >= 0.01 ? `<br>Vandaag gewerkt: <b>${urenTekst(dag.uren)} uur</b>` : ""}</p>
      ${s ? `<button class="knop knop-groot ${actie === "In" ? "knop-in" : "knop-uit"}" id="btn-klok">${actie === "In" ? "Inklokken" : "Uitklokken"}</button>
      <p class="melding" id="klok-melding" role="status"></p>`
        : `<div class="scan-eerst">📷 Scan de QR-code op het scherm bij de deur om ${actie === "In" ? "in" : "uit"} te klokken.</div>`}
      <p class="voet">Niet ${esc(werknemer.naam)}? <a href="#" id="uitlog">${werknemer.viaTelefoon ? "Telefoon ontkoppelen" : "Uitloggen"}</a></p>
    </div>`;
  el.querySelector("#uitlog").onclick = (e) => {
    e.preventDefault();
    if (werknemer.viaTelefoon && !confirm("Deze telefoon ontkoppelen? Je hebt daarna een nieuwe koppel-QR van de beheerder nodig.")) return;
    uitloggen();
  };
  const knop = el.querySelector("#btn-klok");
  if (!knop) return;
  const melding = el.querySelector("#klok-melding");
  knop.onclick = async () => {
    // Bescherming tegen per ongeluk twee keer tikken.
    if (dag.laatste && Date.now() - dag.laatste.tijd < 120000 &&
        !confirm(`Je hebt om ${tijdTekst(dag.laatste.tijd)} al geklokt. Toch ${actie === "In" ? "inklokken" : "uitklokken"}?`)) return;
    knop.disabled = true;
    melding.textContent = "Bezig…";
    try {
      const nuScan = scan();
      if (!nuScan) throw new Error("De QR-code is verlopen. Scan de code bij de deur opnieuw.");
      const reg = { email, naam: werknemer.naam, actie, tijd: serverTimestamp(), datum: datumVan(new Date()), bron: "scan", scherm: nuScan.s, deur: nuScan.d };
      if (KANTOOR) {
        melding.textContent = "Locatie controleren…";
        const pos = await locatie();
        const afstand = afstandMeter(pos, KANTOOR);
        if (afstand > KANTOOR.straalMeter + Math.min(pos.nauwkeurigheid, 500)) {
          throw new Error(`Je bent niet op kantoor (ongeveer ${Math.round(afstand)} meter ervandaan). Klokken kan alleen op locatie.`);
        }
        reg.locatie = { afstandMeter: Math.round(afstand), nauwkeurigheidMeter: Math.round(pos.nauwkeurigheid) };
      }
      await addDoc(collection(db, "registraties"), reg);
      scanGebruikt();
      const nu = tijdTekst(new Date());
      await klokScherm(werknemer, actie === "In" ? `✓ Ingeklokt om ${nu}` : `✓ Uitgeklokt om ${nu}. Tot de volgende keer!`);
    } catch (e) {
      knop.disabled = false;
      melding.textContent = e?.code === "permission-denied"
        ? "Klokken is geweigerd: de QR-code is waarschijnlijk verlopen. Scan de code bij de deur opnieuw."
        : (e?.message || "Er ging iets mis. Probeer het opnieuw.");
    }
  };
}

/** Koppelt deze telefoon aan een werknemer met de code uit de persoonlijke koppel-QR. */
async function koppel(code) {
  if (!auth.currentUser) await signInAnonymously(auth);
  if (!auth.currentUser.isAnonymous) throw new Error("Log eerst uit voordat je deze telefoon koppelt.");
  const uid = auth.currentUser.uid;
  const mijnApparaat = await getDoc(doc(db, "apparaten", uid));
  if (mijnApparaat.exists()) return;                       // al gekoppeld
  let kc;
  try { kc = await getDoc(doc(db, "koppelcodes", code)); } catch { kc = null; }
  if (!kc?.exists() || kc.data().gebruikt) throw new Error("Deze koppel-QR is al gebruikt of bestaat niet. Vraag de beheerder om een nieuwe.");
  const batch = writeBatch(db);
  batch.set(doc(db, "apparaten", uid), { email: kc.data().email, naam: kc.data().naam, code, sinds: serverTimestamp() });
  batch.update(doc(db, "koppelcodes", code), { gebruikt: true, gebruiktDoor: uid });
  try { await batch.commit(); }
  catch { throw new Error("Koppelen lukte niet. De koppel-QR is mogelijk verlopen (7 dagen geldig). Vraag de beheerder om een nieuwe."); }
}

/** Zoekt uit welke werknemer deze telefoon of dit account is. */
async function wieBenIk(user) {
  let email, viaTelefoon = false;
  if (user.isAnonymous) {
    const a = await getDoc(doc(db, "apparaten", user.uid));
    if (!a.exists()) return null;
    email = a.data().email; viaTelefoon = true;
  } else {
    email = mijnEmail();
  }
  const w = await getDoc(doc(db, "werknemers", email)).catch(() => null);
  return { email, viaTelefoon, bekend: !!w?.exists(), actief: w?.exists() && w.data().actief === true, ...(w?.exists() ? w.data() : {}) };
}

function nietGekoppeld() {
  bericht("Telefoon nog niet gekoppeld",
    "Scan eerst één keer je <b>persoonlijke koppel-QR</b>. Die krijg je van de beheerder. Daarna herkent deze telefoon je automatisch als je de QR-code bij de deur scant.",
    `<p class="voet"><a href="#" id="account">Of log in met een account</a></p>`);
  el.querySelector("#account").onclick = (e) => { e.preventDefault(); toonLogin(el); };
}

if (nietIngesteld) {
  bericht("Nog niet ingesteld", "Vul eerst de Firebase-gegevens in <code>config.js</code> in (zie HANDLEIDING.md).");
} else {
  bericht("Even geduld", "Laden…");
  bewaarScan();
  if (location.search.includes("s=")) history.replaceState(null, "", location.pathname + location.search.replace(/[?&](s|d)=[^&]*/g, "").replace(/^&/, "?"));
  const code = new URLSearchParams(location.search).get("code");
  let koppelen = Promise.resolve();
  if (code) {
    koppelen = auth.authStateReady()
      .then(() => koppel(code))
      .then(() => { history.replaceState(null, "", location.pathname); })
      .catch((e) => { history.replaceState(null, "", location.pathname); throw e; });
  }
  rondEmailLinkAf().catch((e) => bericht("Inloggen mislukt", esc(e?.message || e)));
  let eerste = true, getoond;   // getoond: uid van het laatst getoonde scherm
  onAuthStateChanged(auth, async () => {
    try {
      await koppelen;
    } catch (e) {
      return bericht("Koppelen mislukt", esc(e?.message || e));
    }
    const user = auth.currentUser;
    if (getoond !== undefined && getoond === (user?.uid ?? null)) return;
    getoond = user?.uid ?? null;
    if (!user) return nietGekoppeld();
    try {
      const ik = await wieBenIk(user);
      if (!ik) return nietGekoppeld();
      if (!ik.actief) {
        bericht("Nog niet aangemeld",
          ik.viaTelefoon
            ? "Deze telefoon is gekoppeld, maar je account staat (nog) niet aan. Vraag de beheerder om je aan te zetten."
            : `Je bent ingelogd als <b>${esc(user.email)}</b>, maar dit adres staat nog niet op de lijst van werknemers. Vraag de beheerder om je toe te voegen.`,
          `<button class="knop knop-licht" id="opnieuw">Opnieuw proberen</button>${ik.viaTelefoon ? "" : `<p class="voet"><a href="#" id="uitlog">Ander account gebruiken</a></p>`}`);
      } else {
        await klokScherm(ik, code && eerste ? `✓ Deze telefoon is gekoppeld aan ${esc(ik.naam)}` : "");
      }
    } catch (e) {
      bericht("Er ging iets mis", esc(e?.message || e), `<button class="knop knop-licht" id="opnieuw">Opnieuw proberen</button>`);
    }
    eerste = false;
    el.querySelector("#opnieuw")?.addEventListener("click", () => location.reload());
    el.querySelector("#uitlog")?.addEventListener("click", (e) => { e.preventDefault(); uitloggen(); });
  });
}
