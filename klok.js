// Klokpagina: de QR-code bij de deur opent deze pagina.
import {
  auth, db, nietIngesteld, onAuthStateChanged, collection, doc, getDoc, getDocs,
  addDoc, query, where, serverTimestamp,
} from "./firebase.js";
import { toonLogin, rondEmailLinkAf, mijnEmail, uitloggen } from "./login.js";
import { KANTOOR, BEDRIJFSNAAM } from "./config.js";
import { datumVan, tijdTekst, urenTekst, berekenDag, esc, afstandMeter } from "./uren.js";

const el = document.getElementById("app");
document.getElementById("bedrijf").textContent = BEDRIJFSNAAM;

function bericht(titel, tekst, extra = "") {
  el.innerHTML = `<div class="kaart"><h1>${esc(titel)}</h1><p class="sub">${tekst}</p>${extra}</div>`;
}

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
  const email = mijnEmail();
  const dag = berekenDag(await vandaag(email));
  const actie = dag.ingeklokt ? "Uit" : "In";
  const status = dag.ingeklokt
    ? `Je bent ingeklokt sinds <b>${tijdTekst(dag.ingekloktSinds)}</b>.`
    : dag.laatste ? `Je bent uitgeklokt om <b>${tijdTekst(dag.laatste.tijd)}</b>.` : "Je bent vandaag nog niet ingeklokt.";
  el.innerHTML = `
    <div class="kaart">
      ${flits ? `<div class="flits">${flits}</div>` : ""}
      <h1>Hoi ${esc(werknemer.naam.split(" ")[0])}</h1>
      <p class="sub">${status}${dag.uren >= 0.01 ? `<br>Vandaag gewerkt: <b>${urenTekst(dag.uren)} uur</b>` : ""}</p>
      <button class="knop knop-groot ${actie === "In" ? "knop-in" : "knop-uit"}" id="btn-klok">${actie === "In" ? "Inklokken" : "Uitklokken"}</button>
      <p class="melding" id="klok-melding" role="status"></p>
      <p class="voet">Niet ${esc(werknemer.naam)}? <a href="#" id="uitlog">Uitloggen</a></p>
    </div>`;
  el.querySelector("#uitlog").onclick = (e) => { e.preventDefault(); uitloggen(); };
  const knop = el.querySelector("#btn-klok");
  const melding = el.querySelector("#klok-melding");
  knop.onclick = async () => {
    // Bescherming tegen per ongeluk twee keer tikken.
    if (dag.laatste && Date.now() - dag.laatste.tijd < 120000 &&
        !confirm(`Je hebt om ${tijdTekst(dag.laatste.tijd)} al geklokt. Toch ${actie === "In" ? "inklokken" : "uitklokken"}?`)) return;
    knop.disabled = true;
    melding.textContent = "Bezig…";
    try {
      const reg = { email, naam: werknemer.naam, actie, tijd: serverTimestamp(), datum: datumVan(new Date()), bron: "scan" };
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
      const nu = tijdTekst(new Date());
      await klokScherm(werknemer, actie === "In" ? `✓ Ingeklokt om ${nu}` : `✓ Uitgeklokt om ${nu}. Tot de volgende keer!`);
    } catch (e) {
      knop.disabled = false;
      melding.textContent = e?.code === "permission-denied"
        ? "Klokken is geweigerd. Vraag de beheerder of je account actief is."
        : (e?.message || "Er ging iets mis. Probeer het opnieuw.");
    }
  };
}

if (nietIngesteld) {
  bericht("Nog niet ingesteld", "Vul eerst de Firebase-gegevens in <code>config.js</code> in (zie HANDLEIDING.md).");
} else {
  bericht("Even geduld", "Laden…");
  rondEmailLinkAf().catch((e) => bericht("Inloggen mislukt", esc(e?.message || e)));
  onAuthStateChanged(auth, async (user) => {
    if (!user) return toonLogin(el);
    try {
      const w = await getDoc(doc(db, "werknemers", mijnEmail()));
      if (!w.exists() || w.data().actief !== true) {
        bericht("Nog niet aangemeld",
          `Je bent ingelogd als <b>${esc(user.email)}</b>, maar dit adres staat nog niet op de lijst van werknemers. Vraag de beheerder om je toe te voegen.`,
          `<button class="knop knop-licht" id="opnieuw">Opnieuw proberen</button><p class="voet"><a href="#" id="uitlog">Ander account gebruiken</a></p>`);
      } else {
        await klokScherm(w.data());
      }
    } catch (e) {
      bericht("Er ging iets mis", esc(e?.message || e), `<button class="knop knop-licht" id="opnieuw">Opnieuw proberen</button>`);
    }
    el.querySelector("#opnieuw")?.addEventListener("click", () => location.reload());
    el.querySelector("#uitlog")?.addEventListener("click", (e) => { e.preventDefault(); uitloggen(); });
  });
}
