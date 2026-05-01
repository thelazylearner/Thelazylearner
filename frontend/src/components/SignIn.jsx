import { useState } from "react";
import { X, Mail, Lock, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

function BoltIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  );
}

const GoogleIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C33.7 6.1 29 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"/>
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3l5.7-5.7C33.7 6.1 29 4 24 4 16.3 4 9.6 8.4 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 44c5 0 9.5-1.9 12.9-5.1l-6-5C29 35.5 26.6 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.6 5.1C9.5 39.6 16.2 44 24 44z"/>
    <path fill="#1976D2" d="M43.6 20.5H24v8h11.3c-.8 2.3-2.3 4.3-4.4 5.9l6 5C40.7 36.6 44 31.1 44 24c0-1.2-.2-2.4-.4-3.5z"/>
  </svg>
);

export default function SignIn({ onClose, mode: initialMode = "signin" }) {
  const { signInGoogle, signInEmail, signUpEmail } = useAuth();
  const [mode, setMode] = useState(initialMode); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(null); // null | google | email
  const [error, setError] = useState("");

  const onGoogle = async () => {
    setError(""); setBusy("google");
    try { await signInGoogle(); onClose?.(); }
    catch (e) { setError(prettyErr(e)); }
    finally { setBusy(null); }
  };
  const onEmail = async (e) => {
    e.preventDefault();
    setError("");
    if (!email || !password) { setError("Enter your email and password."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setBusy("email");
    try {
      if (mode === "signin") await signInEmail(email, password);
      else await signUpEmail(email, password);
      onClose?.();
    } catch (e) { setError(prettyErr(e)); }
    finally { setBusy(null); }
  };

  return (
    <div className="signin-shell" data-testid="signin-shell">
      <div className="top-gradient" />
      <div className="bg-glow" />
      <div className="signin-card" data-testid="signin-card">
        {onClose && (
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close" data-testid="signin-close">
            <X size={20} />
          </button>
        )}
        <div className="signin-logo">
          <span className="nav-bolt"><BoltIcon size={18} /></span>
          <span>InvoiceNudge</span>
        </div>

        <h1 className="signin-title">
          {mode === "signin" ? "Sign in to track your nudges" : "Create your account"}
        </h1>
        <p className="signin-sub">
          {mode === "signin"
            ? "Save your history, track payments, access from any device."
            : "Free forever — 5 nudges every month, no credit card."}
        </p>

        <button type="button" className="google-btn" data-testid="google-signin" onClick={onGoogle} disabled={!!busy}>
          {busy === "google" ? <Loader2 size={16} className="spin" /> : <GoogleIcon size={18} />}
          <span>Continue with Google</span>
        </button>

        <div className="signin-divider"><span>or continue with email</span></div>

        <form onSubmit={onEmail} className="signin-form">
          <div className="signin-input">
            <Mail size={14} />
            <input
              data-testid="email-input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="signin-input">
            <Lock size={14} />
            <input
              data-testid="password-input"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="Password (6+ characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary signin-cta" data-testid="email-submit" disabled={!!busy}>
            {busy === "email" ? (<><span className="spinner" /> {mode === "signin" ? "Signing in..." : "Creating account..."}</>) : (mode === "signin" ? "Sign In" : "Create account")}
          </button>
        </form>

        {error && <div className="signin-error" data-testid="signin-error">{error}</div>}

        <div className="signin-switch">
          {mode === "signin" ? (
            <>Don't have an account? <button type="button" className="link-btn" data-testid="switch-signup" onClick={() => { setMode("signup"); setError(""); }}>Sign Up</button></>
          ) : (
            <>Already have an account? <button type="button" className="link-btn" data-testid="switch-signin" onClick={() => { setMode("signin"); setError(""); }}>Sign In</button></>
          )}
        </div>
      </div>
    </div>
  );
}

function prettyErr(e) {
  const code = e?.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
    return "Invalid email or password.";
  if (code.includes("email-already-in-use")) return "An account with this email already exists. Try signing in.";
  if (code.includes("invalid-email")) return "That email address looks invalid.";
  if (code.includes("weak-password")) return "Password is too weak. Use at least 6 characters.";
  if (code.includes("popup-closed")) return "Sign-in window was closed before completing.";
  if (code.includes("unauthorized-domain")) return "This domain isn't authorized in Firebase. Add it in Auth → Settings → Authorized domains.";
  if (code.includes("network-request-failed")) return "Network problem — check your connection and try again.";
  return e?.message?.replace("Firebase: ", "") || "Something went wrong. Please try again.";
}
