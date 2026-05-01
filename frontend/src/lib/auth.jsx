import { createContext, useContext, useEffect, useState } from "react";
import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  fbSignOut,
  onAuthStateChanged,
} from "@/lib/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp, increment } from "firebase/firestore";

const AuthContext = createContext(null);

const monthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const LS_KEYS = {
  uses: "invoicenudge_uses",
  outstanding: "invoicenudge_outstanding",
  recovered: "invoicenudge_recovered",
  history: "invoicenudge_history",
  pending: "invoicenudge_pending",
  isPro: "invoicenudge_is_pro",
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) { setProfile(null); setReady(true); return; }

      const ref = doc(db, "users", u.uid);
      // Migrate any localStorage state on first sign-in (idempotent merge).
      const localOutstanding = Number(localStorage.getItem(LS_KEYS.outstanding) || 0);
      const localRecovered = Number(localStorage.getItem(LS_KEYS.recovered) || 0);
      let localHistory = [];
      let localPending = [];
      try { localHistory = JSON.parse(localStorage.getItem(LS_KEYS.history) || "[]"); } catch { /* noop */ }
      try { localPending = JSON.parse(localStorage.getItem(LS_KEYS.pending) || "[]"); } catch { /* noop */ }

      try {
        await setDoc(ref, {
          uid: u.uid,
          email: u.email || null,
          displayName: u.displayName || null,
          photoURL: u.photoURL || null,
          createdAt: serverTimestamp(),
          monthKey: monthKey(),
          // merge:true means these defaults won't overwrite existing values
          nudgesUsed: 0,
          outstanding: localOutstanding,
          recovered: localRecovered,
          history: localHistory,
          pending: localPending,
          isPro: localStorage.getItem(LS_KEYS.isPro) === "true",
        }, { merge: true });
        // Clear local state after migration (keeps things tidy).
        Object.values(LS_KEYS).forEach((k) => localStorage.removeItem(k));
      } catch (e) { console.error("seed user doc failed", e); }

      const unsubDoc = onSnapshot(ref, async (snap) => {
        const data = snap.data() || {};
        // Monthly reset: if stored monthKey is older than current, zero out nudgesUsed.
        const cur = monthKey();
        if (data.monthKey && data.monthKey !== cur) {
          try { await setDoc(ref, { monthKey: cur, nudgesUsed: 0 }, { merge: true }); } catch { /* noop */ }
        }
        setProfile({
          email: data.email || null,
          displayName: data.displayName || null,
          photoURL: data.photoURL || null,
          nudgesUsed: data.monthKey === cur ? (data.nudgesUsed || 0) : 0,
          monthKey: data.monthKey || cur,
          outstanding: data.outstanding || 0,
          recovered: data.recovered || 0,
          history: data.history || [],
          pending: data.pending || [],
          isPro: !!data.isPro,
        });
        setReady(true);
      });
      return () => unsubDoc();
    });
    return () => unsub();
  }, []);

  const signInGoogle = async () => {
    try { await signInWithPopup(auth, googleProvider); }
    catch (e) {
      // Fall back to redirect when popup is blocked.
      if (String(e?.code).includes("popup-blocked") || String(e?.code).includes("popup-closed")) {
        await signInWithRedirect(auth, googleProvider);
      } else { throw e; }
    }
  };
  const signInEmail = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const signUpEmail = (email, password) => createUserWithEmailAndPassword(auth, email, password);
  const signOut = () => fbSignOut(auth);

  // Atomic update for the user's document.
  const updateProfile = async (patch) => {
    if (!user) return;
    await setDoc(doc(db, "users", user.uid), patch, { merge: true });
  };

  // Increment nudgesUsed safely (Firestore atomic).
  const recordNudge = async () => {
    if (!user) return;
    await setDoc(
      doc(db, "users", user.uid),
      { nudgesUsed: increment(1), monthKey: monthKey() },
      { merge: true }
    );
  };

  return (
    <AuthContext.Provider
      value={{ user, profile, ready, signInGoogle, signInEmail, signUpEmail, signOut, updateProfile, recordNudge }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export const FREE_LIMIT = 5;
