// Beheerpagina: uren bekijken, Excel downloaden, werknemers en correcties beheren, QR-code printen.
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
const staat = { tab: "uren", werknemers: [], beheerders: new Set(), regs: [], van: null, tot: null };

// ---------- gegevens ----------
function standaardPeriode() {
  const nu = datumVan(new Date());
  staat.van = nu.slice(0, 8) + "01";
  const [j, m] = nu.split("-").map(Number);
  staat.tot = new Date(Date.UTC(j, m, 0)).toISOString().slice(0, 10);   // laatste dag van de maand
}

async function laadWerknemers() {
  const [w, b] = await Promise.all([getDocs(collection(db, "werknemers")), getDocs(collection(db, "beheerders"))]);
  staat.werknemers = w.docs.map((d) => ({ email: d.id, ...d.data() })).sort((a, b) => a.naam.localeCompare(b.naam));
  staat.beheerders = new Set(b.docs.map((d) => d.id));
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
      ${[["uren", "Uren"], ["registraties", "Registraties & correcties"], ["werknemers", "Werknemers"], ["qr", "QR-code"]]
        .map(([k, t]) => `<button class="tab ${staat.tab === k ? "actief" : ""}" data-tab="${k}">${t}</button>`).join("")}
    </nav>
    <div id="inhoud"></div>`;
  el.querySelectorAll(".tab").forEach((b) => b.onclick = () => { staat.tab = b.dataset.tab; toon(); });
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
  box.innerHTML = `
    <div class="kaart">
      <h2>Werknemer toevoegen</h2>
      <p class="klein">Gebruik het e-mailadres waarmee de werknemer inlogt (Google-, Microsoft- of ander adres).</p>
      <form class="rij" id="nieuw">
        <label>Naam <input id="n-naam" required placeholder="Jan de Vries"></label>
        <label>E-mailadres <input id="n-email" type="email" required placeholder="jan@gmail.com"></label>
        <button class="knop knop-blauw knop-klein" type="submit">Toevoegen</button>
      </form>
      <p class="melding" id="n-melding"></p>
    </div>
    <div class="kaart">
      <h2>Werknemers (${staat.werknemers.filter((w) => w.actief).length} actief)</h2>
      <div class="tabel-wrap"><table>
        <thead><tr><th>Naam</th><th>E-mailadres</th><th>Mag klokken</th><th>Beheerder</th></tr></thead>
        <tbody>${staat.werknemers.map((w) => `<tr>
          <td>${esc(w.naam)}</td><td>${esc(w.email)}</td>
          <td><input type="checkbox" data-actief="${esc(w.email)}" ${w.actief ? "checked" : ""}></td>
          <td><input type="checkbox" data-beheer="${esc(w.email)}" ${staat.beheerders.has(w.email) ? "checked" : ""} ${w.email === mijnEmail() ? "disabled" : ""}></td></tr>`).join("")
          || `<tr><td colspan="4">Nog geen werknemers.</td></tr>`}</tbody></table></div>
      <p class="klein">Gaat iemand uit dienst? Zet "Mag klokken" uit. De uren blijven bewaard.</p>
    </div>`;
  box.querySelector("#nieuw").onsubmit = async (ev) => {
    ev.preventDefault();
    const naam = box.querySelector("#n-naam").value.trim();
    const email = box.querySelector("#n-email").value.trim().toLowerCase();
    if (staat.werknemers.some((w) => w.email === email)) { box.querySelector("#n-melding").textContent = "Dit e-mailadres staat er al in."; return; }
    try {
      await setDoc(doc(db, "werknemers", email), { naam, actief: true });
      await laadWerknemers(); toon();
    } catch (e) { box.querySelector("#n-melding").textContent = e.message; }
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
}

function toonQr(box) {
  const url = new URL("index.html", location.href.split("?")[0].split("#")[0]).href;
  let svg = "<p>QR-module kon niet laden.</p>";
  if (window.qrcode) {
    const q = qrcode(0, "M"); q.addData(url); q.make();
    svg = q.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
  }
  box.innerHTML = `
    <div class="kaart" id="qr-print">
      <h1>Scan om in of uit te klokken</h1>
      <p class="sub">${esc(BEDRIJFSNAAM)}</p>
      ${svg}
      <p class="klein">${esc(url)}</p>
      <button class="knop knop-blauw geen-print" id="print" style="max-width:300px;margin:16px auto 0">Printen</button>
    </div>`;
  box.querySelector("#print").onclick = () => window.print();
}

function toon() {
  kader();
  const box = el.querySelector("#inhoud");
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
