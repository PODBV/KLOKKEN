// Rekenregels voor de uren. Geen afhankelijkheden, zodat dit ook los te testen is.
import { TIJDZONE } from "./config.js";

const datumFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: TIJDZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const tijdFmt = new Intl.DateTimeFormat("nl-NL", { timeZone: TIJDZONE, hour: "2-digit", minute: "2-digit" });

/** Kalenderdatum in Nederlandse tijd, als "2026-10-13". */
export const datumVan = (d) => datumFmt.format(d);
/** Kloktijd in Nederlandse tijd, als "08:05". */
export const tijdTekst = (d) => tijdFmt.format(d);
/** Uren als "7,50". */
export const urenTekst = (u) => (u || 0).toFixed(2).replace(".", ",");

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/**
 * Rekent één werkdag van één werknemer door. Elke "Uit" sluit de laatste "In"
 * daarvoor af; meerdere keren in/uit op een dag (lunch) telt dus op.
 * @param regs registraties van één persoon op één dag: { actie: "In"|"Uit", tijd: Date }
 */
export function berekenDag(regs) {
  const lijst = [...regs].filter((r) => r.tijd).sort((a, b) => a.tijd - b.tijd);
  let open = null, uren = 0, eersteIn = null, laatsteUit = null;
  const problemen = [];
  for (const r of lijst) {
    if (r.actie === "In") {
      open = r.tijd;
      if (!eersteIn) eersteIn = r.tijd;
    } else if (r.actie === "Uit") {
      if (open) { uren += (r.tijd - open) / 3600000; open = null; }
      else problemen.push(`Uit zonder in om ${tijdTekst(r.tijd)}`);
      laatsteUit = r.tijd;
    }
  }
  if (open) problemen.push(`Geen uitklok na ${tijdTekst(open)}`);
  return { uren, eersteIn, laatsteUit, ingeklokt: !!open, ingekloktSinds: open, laatste: lijst.at(-1) || null, problemen };
}

/** Groepeert registraties per werknemer per dag en rekent elke dag door. */
export function berekenDagen(regs) {
  const groepen = new Map();
  for (const r of regs) {
    const k = `${r.email}|${r.datum}`;
    if (!groepen.has(k)) groepen.set(k, []);
    groepen.get(k).push(r);
  }
  return [...groepen.entries()].map(([k, lijst]) => {
    const [email, datum] = k.split("|");
    return { email, datum, naam: lijst[0].naam, ...berekenDag(lijst) };
  }).sort((a, b) => a.datum.localeCompare(b.datum) || a.naam.localeCompare(b.naam));
}

/** ISO-week van "2026-10-13" als { jaar, week }. */
export function isoWeek(datum) {
  const d = new Date(datum + "T00:00:00Z");
  const dag = (d.getUTCDay() + 6) % 7;            // ma = 0
  d.setUTCDate(d.getUTCDate() - dag + 3);          // donderdag van deze week
  const jaar = d.getUTCFullYear();
  const week = Math.ceil(((d - Date.UTC(jaar, 0, 1)) / 86400000 + 1) / 7);
  return { jaar, week };
}

/** Alle datums van van t/m tot ("YYYY-MM-DD"). */
export function datumsTussen(van, tot) {
  const uit = [];
  for (let d = new Date(van + "T00:00:00Z"); d <= new Date(tot + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
    uit.push(d.toISOString().slice(0, 10));
  }
  return uit;
}

/** Afstand in meters tussen twee coördinaten. */
export function afstandMeter(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
