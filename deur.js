// Deurscherm: een tablet bij de deur toont een QR-code die elke 30 seconden wisselt.
// Alleen met de code die nu op het scherm staat kan een werknemer klokken.
import {
  auth, db, nietIngesteld, onAuthStateChanged, doc, getDoc, setDoc, serverTimestamp,
  signInAnonymously, writeBatch,
} from "./firebase.js";
import { BEDRIJFSNAAM } from "./config.js";
import { esc } from "./uren.js";

const WISSEL_MS = 30000;
const el = document.getElementById("app");
const klokUrl = new URL("index.html", location.href.split("?")[0].split("#")[0]).href;

function bericht(titel, tekst) {
  el.innerHTML = `<div class="kaart" style="max-width:520px"><h1>${esc(titel)}</h1><p class="sub">${tekst}</p></div>`;
}

function nieuweCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function qrSvg(tekst) {
  if (!window.qrcode) return "<p>QR-module kon niet laden.</p>";
  const q = qrcode(0, "M"); q.addData(tekst); q.make();
  return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}

/** Koppelt deze tablet als deurscherm met de code uit Beheer > Deurscherm. */
async function koppel(code) {
  if (!auth.currentUser) await signInAnonymously(auth);
  if (!auth.currentUser.isAnonymous) throw new Error("In deze browser is iemand ingelogd op de beheerpagina. Open de link op de tablet zelf, of log eerst uit op de beheerpagina.");
  const uid = auth.currentUser.uid;
  if ((await getDoc(doc(db, "deurschermen", uid))).exists()) return;
  let kc;
  try { kc = await getDoc(doc(db, "koppelcodes", code)); } catch { kc = null; }
  if (!kc?.exists() || kc.data().gebruikt || kc.data().soort !== "deur") throw new Error("Deze koppelcode is al gebruikt of bestaat niet. Maak in Beheer een nieuwe.");
  const batch = writeBatch(db);
  batch.set(doc(db, "deurschermen", uid), { naam: kc.data().naam, code, sinds: serverTimestamp() });
  batch.update(doc(db, "koppelcodes", code), { gebruikt: true, gebruiktDoor: uid });
  try { await batch.commit(); }
  catch { throw new Error("Koppelen lukte niet. De koppelcode is mogelijk verlopen (7 dagen geldig). Maak in Beheer een nieuwe."); }
}

// Scherm aan laten staan (werkt in Chrome en Safari op tablets).
let slot = null;
async function schermAan() {
  try { if ("wakeLock" in navigator && !slot) { slot = await navigator.wakeLock.request("screen"); slot.addEventListener("release", () => { slot = null; }); } } catch { /* niet ondersteund */ }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") schermAan(); });

function draai(uid) {
  el.innerHTML = `
    <div class="deur">
      <h1>Scan om in of uit te klokken</h1>
      <p class="sub">${esc(BEDRIJFSNAAM)} · open de camera van je telefoon</p>
      <div id="qr"></div>
      <div class="balkje"><div id="balk" style="width:100%"></div></div>
      <p class="status" id="status" role="status"></p>
    </div>`;
  const qr = el.querySelector("#qr"), balk = el.querySelector("#balk"), status = el.querySelector("#status");
  let vorige = "", laatsteOk = 0, volgende = 0;

  async function wissel() {
    const code = nieuweCode();
    try {
      await setDoc(doc(db, "deur", uid), { code, vorige, sinds: serverTimestamp() });
      vorige = code; laatsteOk = Date.now(); volgende = laatsteOk + WISSEL_MS;
      qr.innerHTML = qrSvg(`${klokUrl}?s=${encodeURIComponent(uid)}&d=${code}`);
      status.textContent = ""; status.classList.remove("fout");
      setTimeout(wissel, WISSEL_MS);
    } catch (e) {
      status.textContent = e?.code === "permission-denied"
        ? "Dit deurscherm is ontkoppeld. Koppel het opnieuw via Beheer > Deurscherm."
        : "Geen verbinding met internet. Nieuwe poging…";
      status.classList.add("fout");
      if (Date.now() - laatsteOk > 80000) qr.innerHTML = "";   // oude code werkt toch niet meer
      if (e?.code !== "permission-denied") setTimeout(wissel, 5000);
    }
  }
  setInterval(() => {
    const rest = Math.max(0, volgende - Date.now());
    balk.style.width = `${(rest / WISSEL_MS) * 100}%`;
  }, 1000);

  getDoc(doc(db, "deur", uid)).then((d) => { if (d.exists()) vorige = d.data().code || ""; }).catch(() => {}).finally(wissel);
  schermAan();
}

if (nietIngesteld) {
  bericht("Nog niet ingesteld", "Vul eerst de Firebase-gegevens in <code>config.js</code> in (zie HANDLEIDING.md).");
} else {
  bericht("Even geduld", "Laden…");
  const code = new URLSearchParams(location.search).get("koppel");
  let koppelen = Promise.resolve();
  if (code) {
    koppelen = auth.authStateReady().then(() => koppel(code))
      .finally(() => history.replaceState(null, "", location.pathname));
  }
  let gestart = false;
  onAuthStateChanged(auth, async (user) => {
    if (gestart) return;
    try { await koppelen; } catch (e) { return bericht("Koppelen mislukt", esc(e?.message || e)); }
    user = auth.currentUser;
    const gekoppeld = user && await getDoc(doc(db, "deurschermen", user.uid)).then((d) => d.exists()).catch(() => false);
    if (!gekoppeld) {
      return bericht("Deurscherm nog niet gekoppeld",
        "Log op de beheerpagina in, ga naar <b>Deurscherm</b> en klik <b>Deurscherm koppelen</b>. Open de link die je krijgt op deze tablet.");
    }
    gestart = true;
    draai(user.uid);
  });
}
