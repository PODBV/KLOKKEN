// Inloggen: Google, Microsoft (eigen organisatie) of een link per e-mail.
import {
  auth, GoogleAuthProvider, OAuthProvider, signInWithPopup, signOut,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
} from "./firebase.js";
import { MICROSOFT_TENANT, EMAIL_LINK_LOGIN } from "./config.js";
import { esc } from "./uren.js";

const MAIL_KEY = "klok-login-email";

/** Mailadres van de ingelogde gebruiker, in kleine letters. */
export const mijnEmail = () => (auth.currentUser?.email || "").trim().toLowerCase();

export const uitloggen = () => signOut(auth);

/** Rondt het inloggen af als de pagina is geopend via de link uit de e-mail. */
export async function rondEmailLinkAf() {
  if (!isSignInWithEmailLink(auth, location.href)) return;
  let email = null;
  try { email = localStorage.getItem(MAIL_KEY); } catch { /* */ }
  if (!email) email = prompt("Vul ter bevestiging je e-mailadres in:");
  if (!email) return;
  await signInWithEmailLink(auth, email.trim(), location.href);
  try { localStorage.removeItem(MAIL_KEY); } catch { /* */ }
  history.replaceState(null, "", location.pathname);
}

function foutTekst(e) {
  const code = e?.code || "";
  if (code.includes("popup-closed") || code.includes("cancelled-popup")) return "Inloggen afgebroken.";
  if (code.includes("popup-blocked")) return "De browser blokkeerde het inlogvenster. Sta pop-ups toe en probeer opnieuw.";
  if (code.includes("invalid-email")) return "Dat e-mailadres klopt niet.";
  if (code.includes("quota") || code.includes("too-many")) return "Er zijn vandaag te veel inlogmails verstuurd. Log in met Google of Microsoft, of probeer het morgen.";
  if (code.includes("account-exists-with-different-credential")) return "Dit e-mailadres is al gebruikt met een andere inlogmethode. Kies die methode.";
  return "Inloggen lukte niet (" + (code || e?.message || "onbekende fout") + ").";
}

/** Toont het inlogscherm in el. */
export function toonLogin(el, titel = "Log één keer in, daarna herkent de app je automatisch.") {
  el.innerHTML = `
    <div class="kaart">
      <h1>Inloggen</h1>
      <p class="sub">${esc(titel)}</p>
      <button class="knop knop-licht" id="btn-google"><span class="logo">G</span> Inloggen met Google</button>
      ${MICROSOFT_TENANT ? `<button class="knop knop-licht" id="btn-ms"><span class="logo">M</span> Inloggen met Microsoft</button>` : ""}
      ${EMAIL_LINK_LOGIN ? `
        <details class="mail-login">
          <summary>Of ontvang een inloglink per e-mail</summary>
          <form id="mail-form">
            <input type="email" id="mail" required placeholder="naam@voorbeeld.nl" autocomplete="email">
            <button class="knop knop-klein" type="submit">Stuur link</button>
          </form>
          <p class="klein">Open de link straks in dezelfde browser waarmee je de QR-code scant.</p>
        </details>` : ""}
      <p class="melding" id="login-melding" role="status"></p>
    </div>`;
  const melding = el.querySelector("#login-melding");
  const popup = async (provider) => {
    melding.textContent = "";
    try { await signInWithPopup(auth, provider); } catch (e) { melding.textContent = foutTekst(e); }
  };
  el.querySelector("#btn-google").onclick = () => {
    const p = new GoogleAuthProvider();
    p.setCustomParameters({ prompt: "select_account" });
    popup(p);
  };
  el.querySelector("#btn-ms")?.addEventListener("click", () => {
    const p = new OAuthProvider("microsoft.com");
    p.setCustomParameters({ tenant: MICROSOFT_TENANT, prompt: "select_account" });
    popup(p);
  });
  el.querySelector("#mail-form")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const email = el.querySelector("#mail").value.trim();
    try {
      await sendSignInLinkToEmail(auth, email, { url: location.origin + location.pathname, handleCodeInApp: true });
      try { localStorage.setItem(MAIL_KEY, email); } catch { /* */ }
      melding.textContent = `Link verstuurd naar ${email}. Kijk ook in je spam.`;
    } catch (e) { melding.textContent = foutTekst(e); }
  });
}
