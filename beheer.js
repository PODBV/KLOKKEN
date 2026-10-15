// Beheerpagina: uren bekijken, Excel downloaden, werknemers en correcties beheren, deurscherm koppelen.
import {
  auth, db, nietIngesteld, onAuthStateChanged, collection, doc, getDoc, getDocs,
  addDoc, setDoc, updateDoc, deleteDoc, query, where, Timestamp,
} from "./firebase.js";
import { toonLogin, rondEmailLinkAf, mijnEmail, uitloggen } from "./login.js";
import { BEDRIJFSNAAM } from "./config.js";
import { datumVan, tijdTekst, urenTekst, berekenDagen, isoWeek, datumsTussen, esc } from "./uren.js";

const el = document.getElementById("app");
document.getElementById("bedrijf").textContent = BEDRIJFSNAAM;
const DAGEN = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

const nlDatum = (d) => `${d.slice(8)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;
const staat = { tab: "uren", werknemers: [], beheerders: new Set(), apparaten: [], regs: [], van: null, tot: null, koppel: null };

// ---------- gegevens ----------
function standaardPeriode() {
  const nu = datumVan(new Date());
  staat.van = nu.slice(0, 8) + "01";
  const [j, m] = nu.split("-").map(Number);
  staat.tot = new Date(Date.UTC(j, m, 0)).toISOString().slice(0, 10);   // laatste dag van de maand
}

async function laadWerknemers() {
  const [w, b, a] = await Promise.all([getDocs(collection(db, "werknemers")), getDocs(collection(db, "beheerders")), getDocs(collection(db, "apparaten"))]);
  staat.werknemers = w.docs.map((d) => ({ email: d.id, ...d.data() })).sort((a, b) => a.naam.localeCompare(b.naam));
  staat.beheerders = new Set(b.docs.map((d) => d.id));
  staat.apparaten = a.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

async function laadDeurschermen() {
  const [s, d, k] = await Promise.all([getDocs(collection(db, "deurschermen")), getDocs(collection(db, "deur")), getDoc(doc(db, "instellingen", "kantoor"))]);
  const codes = new Map(d.docs.map((x) => [x.id, x.data()]));
  staat.papier = codes.get("papier")?.code || null;
  staat.kantoor = k.exists() ? k.data() : null;
  staat.deurschermen = s.docs.map((x) => ({ uid: x.id, ...x.data(), laatst: codes.get(x.id)?.sinds?.toDate() }));
}

const klokUrl = () => new URL("index.html", location.href.split("?")[0].split("#")[0]).href;

function qrSvg(tekst) {
  if (!window.qrcode) return "<p>QR-module kon niet laden.</p>";
  const q = qrcode(0, "M"); q.addData(tekst); q.make();
  return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}

/** Maakt een eenmalige, 7 dagen geldige koppelcode voor een werknemer. */
async function maakKoppelcode(w) {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const code = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await setDoc(doc(db, "koppelcodes", code), { email: w.email, naam: w.naam, gebruikt: false, aangemaakt: Timestamp.now(), door: mijnEmail() });
  return `${klokUrl()}?code=${code}`;
}

/** Sleutel voor een werknemer zonder e-mailadres: naam in kleine letters plus een willekeurig stukje. */
function sleutelZonderEmail(naam) {
  const basis = naam.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${basis || "werknemer"}-${Math.random().toString(36).slice(2, 6)}`;
}

async function laadRegistraties() {
  // Een dag marge aan beide kanten; daarna filteren op de Nederlandse datum.
  const van = new Date(staat.van + "T00:00:00Z"); van.setUTCDate(van.getUTCDate() - 1);
  const tot = new Date(staat.tot + "T00:00:00Z"); tot.setUTCDate(tot.getUTCDate() + 2);
  const snap = await getDocs(query(collection(db, "registraties"),
    where("tijd", ">=", Timestamp.fromDate(van)), where("tijd", "<", Timestamp.fromDate(tot))));
  staat.regs = snap.docs
    .map((d) => { const x = d.data(); const tijd = x.tijd.toDate(); return { id: d.id, ...x, tijd, datum: datumVan(tijd) }; })
    .filter((r) => r.datum >= staat.van && r.datum <= staat.tot)
    .sort((a, b) => a.tijd - b.tijd);
}

/** Werknemers in de kolommen: iedereen die actief is of in de periode geklokt heeft. */
function kolommen() {
  const metData = new Set(staat.regs.map((r) => r.email));
  const lijst = staat.werknemers.filter((w) => w.actief || metData.has(w.email));
  for (const r of staat.regs) {
    if (!lijst.some((w) => w.email === r.email)) lijst.push({ email: r.email, naam: r.naam || r.email });
  }
  return lijst;
}

function overzicht() {
  const dagen = berekenDagen(staat.regs);
  const per = (sleutel) => {
    const m = new Map();
    for (const d of dagen) {
      const k = sleutel(d.datum) + "|" + d.email;
      m.set(k, (m.get(k) || 0) + d.uren);
    }
    return m;
  };
  return {
    dagen,
    perDag: per((x) => x),
    perWeek: per((x) => { const w = isoWeek(x); return `${w.jaar}-W${String(w.week).padStart(2, "0")}`; }),
    perMaand: per((x) => x.slice(0, 7)),
  };
}

// ---------- weergave ----------
function kader() {
  el.innerHTML = `
    <nav class="tabs">
      ${[["uren", "Uren"], ["registraties", "Registraties & correcties"], ["werknemers", "Werknemers"], ["qr", "QR bij de deur"]]
        .map(([k, t]) => `<button class="tab ${staat.tab === k ? "actief" : ""}" data-tab="${k}">${t}</button>`).join("")}
    </nav>
    <div id="inhoud"></div>`;
  el.querySelectorAll(".tab").forEach((b) => b.onclick = async () => {
    staat.tab = b.dataset.tab; staat.koppel = null; staat.deurKoppel = null;
    // Steeds de nieuwste gegevens tonen.
    if (staat.tab === "uren" || staat.tab === "registraties") await laadRegistraties();
    if (staat.tab === "werknemers") await laadWerknemers();
    if (staat.tab === "qr") await laadDeurschermen();
    toon();
  });
}

function periodeKeuze() {
  return `<div class="rij geen-print">
      <label>Van <input type="date" id="van" value="${staat.van}"></label>
      <label>Tot en met <input type="date" id="tot" value="${staat.tot}"></label>
      <button class="knop knop-blauw knop-klein" id="laad">Toon</button>
      <button class="knop knop-licht knop-klein" id="maand-terug">‹ Vorige maand</button>
      <button class="knop knop-licht knop-klein" id="maand-nu">Deze maand</button>
    </div>`;
}

function koppelPeriode() {
  const herlaad = async () => { await laadRegistraties(); toon(); };
  el.querySelector("#laad").onclick = () => { staat.van = el.querySelector("#van").value; staat.tot = el.querySelector("#tot").value; herlaad(); };
  el.querySelector("#maand-nu").onclick = () => { standaardPeriode(); herlaad(); };
  el.querySelector("#maand-terug").onclick = () => {
    const [j, m] = staat.van.split("-").map(Number);
    const eerste = new Date(Date.UTC(j, m - 2, 1));
    staat.van = eerste.toISOString().slice(0, 10);
    staat.tot = new Date(Date.UTC(eerste.getUTCFullYear(), eerste.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    herlaad();
  };
}

function rasterTabel(rijen, kols, waarde, rijLabel, rijKlasse = () => "") {
  const totKol = (k) => rijen.reduce((s, r) => s + (waarde(r, k) || 0), 0);
  return `<div class="tabel-wrap"><table>
    <thead><tr><th></th>${kols.map((k) => `<th class="getal">${esc(k.naam)}</th>`).join("")}<th class="getal">Totaal</th></tr></thead>
    <tbody>
      ${rijen.map((r) => {
        const tot = kols.reduce((s, k) => s + (waarde(r, k) || 0), 0);
        return `<tr class="${rijKlasse(r)}"><td>${rijLabel(r)}</td>${kols.map((k) => { const v = waarde(r, k); return `<td class="getal">${v ? urenTekst(v) : ""}</td>`; }).join("")}<td class="getal"><b>${tot ? urenTekst(tot) : ""}</b></td></tr>`;
      }).join("")}
      <tr class="totaal"><td>Totaal</td>${kols.map((k) => `<td class="getal">${urenTekst(totKol(k))}</td>`).join("")}<td class="getal">${urenTekst(kols.reduce((s, k) => s + totKol(k), 0))}</td></tr>
    </tbody></table></div>`;
}

function toonUren(box) {
  const o = overzicht();
  const kols = kolommen();
  const datums = datumsTussen(staat.van, staat.tot);
  const weken = [...new Set(datums.map((d) => { const w = isoWeek(d); return `${w.jaar}-W${String(w.week).padStart(2, "0")}`; }))];
  const maanden = [...new Set(datums.map((d) => d.slice(0, 7)))];
  const problemen = o.dagen.filter((d) => d.problemen.length);
  box.innerHTML = `
    <div class="kaart">
      <h2>Uren per werknemer</h2>
      ${periodeKeuze()}
      <button class="knop knop-blauw knop-klein geen-print" id="excel" style="margin-bottom:14px">Download Excel</button>
      ${problemen.length ? `<div class="waarschuwingen"><b>Let op: ${problemen.length} dag(en) met een ontbrekende klok</b> (tellen niet volledig mee, corrigeer bij Registraties)
        <ul>${problemen.map((d) => `<li>${esc(d.naam)}, ${nlDatum(d.datum)}: ${esc(d.problemen.join("; "))}</li>`).join("")}</ul></div>` : ""}
      <h2>Per dag</h2>
      ${rasterTabel(datums, kols, (d, k) => o.perDag.get(`${d}|${k.email}`),
        (d) => `${DAGEN[new Date(d + "T00:00:00Z").getUTCDay()]} ${d.slice(8)}-${d.slice(5, 7)}`,
        (d) => ([0, 6].includes(new Date(d + "T00:00:00Z").getUTCDay()) ? "weekend" : ""))}
      <h2>Per week</h2>
      ${rasterTabel(weken, kols, (w, k) => o.perWeek.get(`${w}|${k.email}`), (w) => `Week ${Number(w.slice(6))} (${w.slice(0, 4)})`)}
      ${maanden.length > 1 ? `<h2>Per maand</h2>${rasterTabel(maanden, kols, (m, k) => o.perMaand.get(`${m}|${k.email}`), (m) => `${MAANDEN[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`)}` : ""}
      <p class="klein">Uren in decimalen: 7,50 = 7 uur en 30 minuten. Pauzes tellen alleen niet mee als iemand ervoor uit- en weer inklokt.</p>
    </div>`;
  koppelPeriode();
  box.querySelector("#excel").onclick = () => downloadExcel(o, kols, datums, weken, maanden);
}

function downloadExcel(o, kols, datums, weken, maanden) {
  if (!window.XLSX) return alert("De Excel-module kon niet laden. Controleer de internetverbinding.");
  const r2 = (u) => (u ? Math.round(u * 100) / 100 : 0);
  const raster = (rijen, label, sleutel, kaart) => {
    const kop = [label, ...kols.map((k) => k.naam), "Totaal"];
    const data = rijen.map((r) => {
      const vals = kols.map((k) => r2(kaart.get(`${r}|${k.email}`)));
      return [sleutel(r), ...vals, r2(vals.reduce((a, b) => a + b, 0))];
    });
    const tot = kols.map((_, i) => r2(data.reduce((s, rij) => s + rij[i + 1], 0)));
    return [kop, ...data, ["Totaal", ...tot, r2(tot.reduce((a, b) => a + b, 0))]];
  };
  const alsDatum = (d) => new Date(d + "T00:00:00");
  const wb = XLSX.utils.book_new();
  const blad = (aoa, naam, breedtes) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: "dd-mm-yyyy" });
    ws["!cols"] = breedtes.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, naam);
  };
  blad([["Datum", "Naam", "E-mailadres", "Eerste in", "Laatste uit", "Uren", "Opmerking"],
    ...o.dagen.map((d) => [alsDatum(d.datum), d.naam, d.email, d.eersteIn ? tijdTekst(d.eersteIn) : "", d.laatsteUit ? tijdTekst(d.laatsteUit) : "", r2(d.uren), d.problemen.join("; ")])],
    "Uren per dag", [12, 24, 30, 10, 11, 8, 40]);
  blad(raster(datums, "Datum", alsDatum, o.perDag), "Overzicht per dag", [12, ...kols.map(() => 14), 10]);
  blad(raster(weken, "Week", (w) => `${w.slice(0, 4)} week ${Number(w.slice(6))}`, o.perWeek), "Per week", [16, ...kols.map(() => 14), 10]);
  blad(raster(maanden, "Maand", (m) => `${MAANDEN[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`, o.perMaand), "Per maand", [12, ...kols.map(() => 14), 10]);
  blad([["Tijdstip", "E-mailadres", "Actie", "Naam", "Bron"],
    ...staat.regs.map((r) => [new Date(`${r.datum}T${tijdTekst(r.tijd)}:00`), r.email, r.actie, r.naam, r.bron === "beheer" ? "correctie" : "scan"])],
    "Registraties", [18, 30, 7, 24, 10]);
  wb.Sheets["Registraties"]["!cols"][0] = { wch: 18 };
  for (const c of Object.keys(wb.Sheets["Registraties"])) {
    if (/^A\d+$/.test(c) && c !== "A1") wb.Sheets["Registraties"][c].z = "dd-mm-yyyy hh:mm";
  }
  XLSX.writeFile(wb, `Uren ${staat.van} tm ${staat.tot}.xlsx`);
}

function toonRegistraties(box) {
  const opties = staat.werknemers.map((w) => `<option value="${esc(w.email)}">${esc(w.naam)}</option>`).join("");
  const nu = new Date(); nu.setMinutes(nu.getMinutes() - nu.getTimezoneOffset());
  box.innerHTML = `
    <div class="kaart">
      <h2>Registratie toevoegen</h2>
      <p class="klein">Bijvoorbeeld als iemand vergeten is uit te klokken.</p>
      <form class="rij" id="corr">
        <label>Werknemer <select id="c-wie" required>${opties}</select></label>
        <label>Datum en tijd <input type="datetime-local" id="c-tijd" required value="${nu.toISOString().slice(0, 16)}"></label>
        <label>Actie <select id="c-actie"><option>In</option><option selected>Uit</option></select></label>
        <button class="knop knop-blauw knop-klein" type="submit">Toevoegen</button>
      </form>
      <p class="melding" id="c-melding"></p>
    </div>
    <div class="kaart">
      <h2>Registraties</h2>
      ${periodeKeuze()}
      <div class="tabel-wrap"><table>
        <thead><tr><th>Datum</th><th>Tijd</th><th>Naam</th><th>Actie</th><th>Bron</th><th></th></tr></thead>
        <tbody>${[...staat.regs].reverse().map((r) => `<tr>
          <td>${nlDatum(r.datum)}</td><td>${tijdTekst(r.tijd)}</td><td>${esc(r.naam)}</td>
          <td>${r.actie}</td><td>${r.bron === "beheer" ? "correctie door " + esc(r.door || "beheer") : "scan"}${r.locatie ? ` (${r.locatie.afstandMeter} m)` : ""}</td>
          <td><button class="link-knop" data-wis="${r.id}">verwijderen</button></td></tr>`).join("") || `<tr><td colspan="6">Geen registraties in deze periode.</td></tr>`}
        </tbody></table></div>
    </div>`;
  koppelPeriode();
  box.querySelector("#corr").onsubmit = async (ev) => {
    ev.preventDefault();
    const email = box.querySelector("#c-wie").value;
    const w = staat.werknemers.find((x) => x.email === email);
    const tijd = new Date(box.querySelector("#c-tijd").value);
    try {
      await addDoc(collection(db, "registraties"), {
        email, naam: w.naam, actie: box.querySelector("#c-actie").value,
        tijd: Timestamp.fromDate(tijd), datum: datumVan(tijd), bron: "beheer", door: mijnEmail(),
      });
      await laadRegistraties(); toon();
    } catch (e) { box.querySelector("#c-melding").textContent = e.message; }
  };
  box.querySelectorAll("[data-wis]").forEach((b) => b.onclick = async () => {
    if (!confirm("Deze registratie verwijderen?")) return;
    await deleteDoc(doc(db, "registraties", b.dataset.wis));
    await laadRegistraties(); toon();
  });
}

function toonWerknemers(box) {
  const telefoons = (email) => staat.apparaten.filter((a) => a.email === email).length;
  box.innerHTML = `
    <div class="kaart">
      <h2>Werknemer toevoegen</h2>
      <form class="rij" id="nieuw">
        <label>Naam <input id="n-naam" required placeholder="Jan de Vries"></label>
        <label>E-mailadres (optioneel) <input id="n-email" type="email" placeholder="alleen voor inloggen met account"></label>
        <button class="knop knop-blauw knop-klein" type="submit">Toevoegen</button>
      </form>
      <p class="klein">Daarna klik je bij de werknemer op <b>Koppel-QR</b>. Die scant de werknemer één keer met zijn eigen telefoon; daarna herkent de app hem automatisch.</p>
      <p class="melding" id="n-melding"></p>
    </div>
    <div class="kaart">
      <h2>Werknemers (${staat.werknemers.filter((w) => w.actief).length} actief)</h2>
      <div class="tabel-wrap"><table>
        <thead><tr><th>Naam</th><th>E-mailadres</th><th>Telefoon</th><th>Mag klokken</th><th>Beheerder</th></tr></thead>
        <tbody>${staat.werknemers.map((w) => `<tr>
          <td>${esc(w.naam)}</td><td>${w.email.includes("@") ? esc(w.email) : "–"}</td>
          <td>${telefoons(w.email) ? `✓ gekoppeld${telefoons(w.email) > 1 ? ` (${telefoons(w.email)})` : ""} · <button class="link-knop" data-ontkoppel="${esc(w.email)}">ontkoppelen</button> · ` : ""}
              <button class="link-knop" style="color:var(--blauw)" data-koppel="${esc(w.email)}">Koppel-QR</button></td>
          <td><input type="checkbox" data-actief="${esc(w.email)}" ${w.actief ? "checked" : ""}></td>
          <td>${w.email.includes("@") ? `<input type="checkbox" data-beheer="${esc(w.email)}" ${staat.beheerders.has(w.email) ? "checked" : ""} ${w.email === mijnEmail() ? "disabled" : ""}>` : ""}</td></tr>`).join("")
          || `<tr><td colspan="5">Nog geen werknemers.</td></tr>`}</tbody></table></div>
      <p class="klein">Gaat iemand uit dienst? Zet "Mag klokken" uit. De uren blijven bewaard. Nieuwe telefoon? Ontkoppel de oude en maak een nieuwe Koppel-QR.</p>
    </div>`;
  box.querySelector("#nieuw").onsubmit = async (ev) => {
    ev.preventDefault();
    const melding = box.querySelector("#n-melding");
    const naam = box.querySelector("#n-naam").value.trim();
    const email = box.querySelector("#n-email").value.trim().toLowerCase() || sleutelZonderEmail(naam);
    if (staat.werknemers.some((w) => w.email === email)) { melding.textContent = "Dit e-mailadres staat er al in."; return; }
    try {
      await setDoc(doc(db, "werknemers", email), { naam, actief: true });
      await laadWerknemers(); toon();
    } catch (e) { melding.textContent = e.message; }
  };
  box.querySelectorAll("[data-actief]").forEach((c) => c.onchange = async () => {
    await updateDoc(doc(db, "werknemers", c.dataset.actief), { actief: c.checked });
    await laadWerknemers(); toon();
  });
  box.querySelectorAll("[data-beheer]").forEach((c) => c.onchange = async () => {
    const ref = doc(db, "beheerders", c.dataset.beheer);
    if (c.checked) await setDoc(ref, { sinds: Timestamp.now() }); else await deleteDoc(ref);
    await laadWerknemers(); toon();
  });
  box.querySelectorAll("[data-koppel]").forEach((b) => b.onclick = async () => {
    const w = staat.werknemers.find((x) => x.email === b.dataset.koppel);
    try {
      staat.koppel = { naam: w.naam, url: await maakKoppelcode(w) };
      toon();
    } catch (e) { box.querySelector("#n-melding").textContent = e.message; }
  });
  box.querySelectorAll("[data-ontkoppel]").forEach((b) => b.onclick = async () => {
    if (!confirm("Telefoon(s) van deze werknemer ontkoppelen? Daarna kan er niet meer mee geklokt worden.")) return;
    await Promise.all(staat.apparaten.filter((a) => a.email === b.dataset.ontkoppel).map((a) => deleteDoc(doc(db, "apparaten", a.uid))));
    await laadWerknemers(); toon();
  });
}

function toonKoppel(box) {
  const k = staat.koppel;
  box.innerHTML = `
    <div class="kaart" id="qr-print">
      <h1>Koppel-QR voor ${esc(k.naam)}</h1>
      <p class="sub">Scan deze code één keer met je <b>eigen telefoon</b> (gewone camera-app).<br>Daarna herkent de app je automatisch bij de QR-code bij de deur.</p>
      ${qrSvg(k.url)}
      <p class="klein">Eenmalig te gebruiken en 7 dagen geldig. Persoonlijk: niet doorsturen.</p>
      <div class="rij geen-print" style="justify-content:center">
        <button class="knop knop-blauw knop-klein" id="print">Printen</button>
        <button class="knop knop-licht knop-klein" id="kopieer">Link kopiëren (om te appen)</button>
        <button class="knop knop-licht knop-klein" id="terug">Terug</button>
      </div>
      <p class="melding geen-print" id="k-melding"></p>
    </div>`;
  box.querySelector("#print").onclick = () => window.print();
  box.querySelector("#terug").onclick = async () => { staat.koppel = null; await laadWerknemers(); toon(); };
  box.querySelector("#kopieer").onclick = async () => {
    try { await navigator.clipboard.writeText(k.url); box.querySelector("#k-melding").textContent = "Link gekopieerd."; }
    catch { prompt("Kopieer deze link:", k.url); }
  };
}

const deurUrl = () => new URL("deur.html", location.href.split("?")[0].split("#")[0]).href;

function nieuweCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Haalt breedte- en lengtegraad uit "51.8853, 4.3108" of uit een Google Maps-link. */
function leesCoordinaten(tekst) {
  let t = (tekst || "").trim();
  try { t = decodeURIComponent(t); } catch { /* geen geldige link-codering */ }
  const m = t.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || t.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/)
    || t.match(/(-?\d{1,2}\.\d+)\s*[,;]\s*(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

function mijnLocatie() {
  return new Promise((ok, fout) => {
    if (!navigator.geolocation) return fout(new Error("Deze browser geeft geen locatie door."));
    navigator.geolocation.getCurrentPosition((p) => ok(p.coords),
      () => fout(new Error("Geef de browser toestemming voor je locatie.")), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}

/** QR-code bij de deur: papier (vaste geheime code) met locatiecheck, of optioneel een tablet. */
function toonQr(box) {
  const papierUrl = staat.papier ? `${klokUrl()}?s=papier&d=${staat.papier}` : null;
  const k = staat.kantoor;
  box.innerHTML = `
    <div class="kaart" id="qr-print">
      ${papierUrl ? `
        <h1>Scan om in of uit te klokken</h1>
        <p class="sub">${esc(BEDRIJFSNAAM)} · open de camera van je telefoon</p>
        ${qrSvg(papierUrl)}
        <div class="rij geen-print" style="justify-content:center;margin-top:14px">
          <button class="knop knop-blauw knop-klein" id="print">Printen</button>
          <button class="knop knop-licht knop-klein" id="papier-nieuw">Nieuwe code maken</button>
        </div>
        <p class="klein geen-print">Hang deze QR-code bij de deur. Alleen met deze code kan geklokt worden.
          Denk je dat er een foto van rondgaat? Klik <b>Nieuwe code maken</b> en print opnieuw: de oude print werkt dan niet meer.</p>`
      : `<h2>QR-code voor bij de deur</h2>
        <p class="sub">Maak een QR-code met een geheime code erin en hang die bij de deur. Alleen met die code kan geklokt worden.</p>
        <button class="knop knop-blauw knop-klein" id="papier-nieuw">QR-code maken</button>`}
      <p class="melding geen-print" id="papier-melding"></p>
    </div>
    <div class="kaart geen-print">
      <h2>Alleen klokken op kantoor (locatiecheck)</h2>
      ${k ? `<p>✓ Aan: telefoons kunnen alleen klokken binnen <b>${k.straalMeter} meter</b> van de vastgelegde kantoorlocatie
          (<a href="https://www.google.com/maps?q=${k.lat},${k.lng}" target="_blank" rel="noopener">bekijk op de kaart</a>).</p>`
        : `<p><b>Uit.</b> Iemand met een foto van de QR-code kan nu ook van buiten kantoor klokken. Zet de locatiecheck aan als je op kantoor bent.</p>`}
      <div class="rij">
        <label>Straal in meters <input type="number" id="straal" min="50" max="2000" step="10" value="${k?.straalMeter || 150}" style="width:120px"></label>
        <button class="knop knop-blauw knop-klein" id="kantoor-zet">${k ? "Opnieuw vastleggen op mijn huidige plek" : "Aanzetten: mijn huidige plek is kantoor"}</button>
        ${k ? `<button class="knop knop-licht knop-klein" id="kantoor-uit">Uitzetten</button>` : ""}
      </div>
      <div class="rij">
        <label style="flex:1;min-width:240px">Of plak coördinaten of een Google Maps-link
          <input id="kantoor-plak" placeholder="bijv. 51.8853, 4.3108"></label>
        <button class="knop knop-licht knop-klein" id="kantoor-plak-zet">Vastleggen</button>
      </div>
      <p class="klein">Coördinaten vind je in Google Maps: klik met de rechtermuisknop op jullie gebouw en klik op de bovenste regel met de cijfers (die worden dan gekopieerd).
        Of doe dit op je telefoon of laptop terwijl je op kantoor bent. Werknemers moeten bij het klokken hun locatie delen;
        de app bewaart alleen de afstand tot kantoor, niet de locatie zelf.</p>
      <p class="melding" id="kantoor-melding"></p>
    </div>
    <details class="kaart geen-print" ${(staat.deurschermen || []).length || staat.deurKoppel ? "open" : ""}>
      <summary><b>Liever een tablet bij de deur? (optioneel)</b></summary>
      <div id="tablet" style="margin-top:12px"></div>
    </details>`;
  const pm = box.querySelector("#papier-melding"), km = box.querySelector("#kantoor-melding");
  box.querySelector("#print")?.addEventListener("click", () => window.print());
  box.querySelector("#papier-nieuw").onclick = async () => {
    if (staat.papier && !confirm("Nieuwe code maken? De QR-code die nu bij de deur hangt werkt daarna niet meer.")) return;
    try {
      await setDoc(doc(db, "deur", "papier"), { code: nieuweCode(), sinds: Timestamp.now(), door: mijnEmail() });
      await laadDeurschermen(); toon();
    } catch (e) { pm.textContent = e.message; }
  };
  box.querySelector("#kantoor-zet").onclick = async () => {
    const straal = Math.max(50, Math.min(2000, Number(box.querySelector("#straal").value) || 150));
    km.textContent = "Locatie bepalen…";
    try {
      const c = await mijnLocatie();
      if (c.accuracy > 200 && !confirm(`De locatie is maar op ongeveer ${Math.round(c.accuracy)} meter nauwkeurig. Toch vastleggen?`)) { km.textContent = ""; return; }
      await setDoc(doc(db, "instellingen", "kantoor"), { lat: c.latitude, lng: c.longitude, straalMeter: straal, door: mijnEmail(), sinds: Timestamp.now() });
      await laadDeurschermen(); toon();
    } catch (e) { km.textContent = e.message; }
  };
  box.querySelector("#kantoor-plak-zet").onclick = async () => {
    const straal = Math.max(50, Math.min(2000, Number(box.querySelector("#straal").value) || 150));
    const pos = leesCoordinaten(box.querySelector("#kantoor-plak").value);
    if (!pos) { km.textContent = "Geen coördinaten gevonden. Plak iets als 51.8853, 4.3108 of een Google Maps-link met een @ erin."; return; }
    try {
      await setDoc(doc(db, "instellingen", "kantoor"), { lat: pos.lat, lng: pos.lng, straalMeter: straal, door: mijnEmail(), sinds: Timestamp.now() });
      await laadDeurschermen(); toon();
    } catch (e) { km.textContent = e.message; }
  };
  box.querySelector("#kantoor-uit")?.addEventListener("click", async () => {
    if (!confirm("Locatiecheck uitzetten? Dan kan met een foto van de QR-code ook buiten kantoor geklokt worden.")) return;
    await deleteDoc(doc(db, "instellingen", "kantoor"));
    await laadDeurschermen(); toon();
  });
  toonTablet(box.querySelector("#tablet"));
}

function toonTablet(box) {
  const schermen = staat.deurschermen || [];
  const k = staat.deurKoppel;
  box.innerHTML = `
    <div>
      <p class="sub">Nog strenger dan papier: een tablet (of oude telefoon) bij de deur toont een QR-code die elke 30 seconden wisselt,
        dus een foto of bewaarde link werkt na een minuut niet meer. De papieren QR blijft daarnaast werken. Hang de tablet aan de oplader en laat <b>deur.html</b> openstaan.</p>
      ${schermen.length ? `<div class="tabel-wrap"><table>
        <thead><tr><th>Naam</th><th>Gekoppeld sinds</th><th>Status</th><th></th></tr></thead>
        <tbody>${schermen.map((d) => `<tr><td>${esc(d.naam)}</td><td>${d.sinds ? nlDatum(datumVan(d.sinds.toDate())) : ""}</td>
          <td>${d.laatst && Date.now() - d.laatst < 120000 ? "✓ aan" : `<span style="color:var(--uit)">uit${d.laatst ? ` sinds ${nlDatum(datumVan(d.laatst))} ${tijdTekst(d.laatst)}` : ""}</span>`}</td>
          <td><button class="link-knop" data-ontkoppel-deur="${esc(d.uid)}">ontkoppelen</button></td></tr>`).join("")}</tbody></table></div>`
        : `<p>Nog geen tablet gekoppeld.</p>`}
      <div class="rij">
        <label>Naam van het scherm <input id="deur-naam" value="${schermen.length ? "" : "Voordeur"}" placeholder="bijv. Voordeur"></label>
        <button class="knop knop-blauw knop-klein" id="deur-koppel">Deurscherm koppelen</button>
        <button class="knop knop-licht knop-klein" id="deur-ververs">Status verversen</button>
      </div>
      <p class="melding" id="deur-melding"></p>
    </div>
    ${k ? `<div style="text-align:center">
      <h1>Koppel ${esc(k.naam)}</h1>
      <p class="sub">Scan deze code met de camera van de <b>tablet</b> die bij de deur komt, of open de link daar in de browser.<br>
        Eenmalig te gebruiken en 7 dagen geldig.</p>
      ${qrSvg(k.url)}
      <div class="rij geen-print" style="justify-content:center">
        <button class="knop knop-licht knop-klein" id="deur-kopieer">Link kopiëren</button>
      </div>
    </div>` : ""}`;
  const melding = box.querySelector("#deur-melding");
  box.querySelector("#deur-koppel").onclick = async () => {
    const naam = box.querySelector("#deur-naam").value.trim();
    if (!naam) { melding.textContent = "Geef het scherm een naam."; return; }
    const code = nieuweCode();
    try {
      await setDoc(doc(db, "koppelcodes", code), { soort: "deur", email: "", naam, gebruikt: false, aangemaakt: Timestamp.now(), door: mijnEmail() });
      staat.deurKoppel = { naam, url: `${deurUrl()}?koppel=${code}` };
      toon();
    } catch (e) { melding.textContent = e.message; }
  };
  box.querySelector("#deur-ververs").onclick = async () => { staat.deurKoppel = null; await laadDeurschermen(); toon(); };
  box.querySelector("#deur-kopieer")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(k.url); melding.textContent = "Link gekopieerd."; }
    catch { prompt("Kopieer deze link:", k.url); }
  });
  box.querySelectorAll("[data-ontkoppel-deur]").forEach((b) => b.onclick = async () => {
    if (!confirm("Dit deurscherm ontkoppelen? De QR-code erop werkt dan niet meer.")) return;
    const uid = b.dataset.ontkoppelDeur;
    await Promise.all([deleteDoc(doc(db, "deurschermen", uid)), deleteDoc(doc(db, "deur", uid))]);
    await laadDeurschermen(); toon();
  });
}

function toon() {
  kader();
  const box = el.querySelector("#inhoud");
  if (staat.koppel) return toonKoppel(box);
  ({ uren: toonUren, registraties: toonRegistraties, werknemers: toonWerknemers, qr: toonQr })[staat.tab](box);
}

// ---------- start ----------
if (nietIngesteld) {
  el.innerHTML = `<div class="kaart smal"><h1>Nog niet ingesteld</h1><p class="sub">Vul eerst de Firebase-gegevens in <code>config.js</code> in (zie HANDLEIDING.md).</p></div>`;
} else {
  el.innerHTML = `<div class="kaart smal"><p>Laden…</p></div>`;
  rondEmailLinkAf().catch((e) => alert(e.message));
  onAuthStateChanged(auth, async (user) => {
    const wie = document.getElementById("wie");
    if (!user) { wie.textContent = ""; el.innerHTML = `<div class="smal" style="margin:0 auto"></div>`; return toonLogin(el.firstElementChild, "Alleen voor beheerders."); }
    wie.innerHTML = `${esc(user.email)} · <a href="#" id="uit">Uitloggen</a>`;
    document.getElementById("uit").onclick = (e) => { e.preventDefault(); uitloggen(); };
    try {
      const b = await getDoc(doc(db, "beheerders", mijnEmail()));
      if (!b.exists()) {
        el.innerHTML = `<div class="kaart smal"><h1>Geen toegang</h1><p class="sub">${esc(user.email)} is geen beheerder. Een bestaande beheerder kan je toevoegen bij Werknemers.</p></div>`;
        return;
      }
      standaardPeriode();
      await Promise.all([laadWerknemers(), laadRegistraties()]);
      toon();
    } catch (e) {
      el.innerHTML = `<div class="kaart smal"><h1>Er ging iets mis</h1><p class="sub">${esc(e.message)}</p></div>`;
    }
  });
}
