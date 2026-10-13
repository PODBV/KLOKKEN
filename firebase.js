// Firebase laden en (alleen bij testen) koppelen aan de lokale emulators.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, connectAuthEmulator, onAuthStateChanged, signOut,
  GoogleAuthProvider, OAuthProvider, signInWithPopup,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, connectFirestoreEmulator, collection, doc, getDoc, getDocs,
  addDoc, setDoc, updateDoc, deleteDoc, query, where, serverTimestamp, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

let emulator = false;
try {
  if (new URLSearchParams(location.search).has("emulator")) sessionStorage.setItem("klok-emulator", "1");
  emulator = sessionStorage.getItem("klok-emulator") === "1";
} catch { /* geen opslag beschikbaar */ }

export const nietIngesteld = !emulator && firebaseConfig.apiKey === "VUL-IN";
export const app = initializeApp(emulator ? { ...firebaseConfig, apiKey: "demo-key", projectId: "demo-klok" } : firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
if (emulator) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

export {
  onAuthStateChanged, signOut, GoogleAuthProvider, OAuthProvider, signInWithPopup,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, serverTimestamp, Timestamp,
};
