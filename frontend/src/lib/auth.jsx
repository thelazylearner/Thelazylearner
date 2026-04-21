import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut as fbSignOut } from "firebase/auth";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setUserDoc(null);
        setReady(true);
        return;
      }
      const ref = doc(db, "users", u.uid);
      // Seed doc if not exists (idempotent merge)
      try {
        await setDoc(
          ref,
          {
            phoneNumber: u.phoneNumber || null,
            uid: u.uid,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (e) {
        console.error("seed user doc failed", e);
      }
      // Live subscribe
      const unsubDoc = onSnapshot(ref, (snap) => {
        const data = snap.data() || {};
        setUserDoc({
          nudgesUsed: data.nudgesUsed || 0,
          nudgeHistory: data.nudgeHistory || [],
          outstanding: data.outstanding || 0,
          recovered: data.recovered || 0,
          isPro: !!data.isPro,
          phoneNumber: data.phoneNumber || u.phoneNumber || null,
        });
        setReady(true);
      });
      return () => unsubDoc();
    });
    return () => unsub();
  }, []);

  const updateUser = async (patch) => {
    if (!user) return;
    const ref = doc(db, "users", user.uid);
    await setDoc(ref, patch, { merge: true });
  };

  const signOut = async () => {
    try { await fbSignOut(auth); } catch { /* noop */ }
  };

  return (
    <AuthContext.Provider value={{ user, userDoc, ready, updateUser, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
