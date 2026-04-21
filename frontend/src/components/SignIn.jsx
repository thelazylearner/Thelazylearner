import { useEffect, useMemo, useRef, useState } from "react";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

const COUNTRIES = [
  { code: "IN", dial: "+91", flag: "🇮🇳", name: "India" },
  { code: "US", dial: "+1", flag: "🇺🇸", name: "United States" },
  { code: "GB", dial: "+44", flag: "🇬🇧", name: "United Kingdom" },
  { code: "CA", dial: "+1", flag: "🇨🇦", name: "Canada" },
  { code: "AU", dial: "+61", flag: "🇦🇺", name: "Australia" },
  { code: "AE", dial: "+971", flag: "🇦🇪", name: "UAE" },
  { code: "SG", dial: "+65", flag: "🇸🇬", name: "Singapore" },
  { code: "DE", dial: "+49", flag: "🇩🇪", name: "Germany" },
  { code: "FR", dial: "+33", flag: "🇫🇷", name: "France" },
  { code: "BR", dial: "+55", flag: "🇧🇷", name: "Brazil" },
  { code: "NG", dial: "+234", flag: "🇳🇬", name: "Nigeria" },
  { code: "ZA", dial: "+27", flag: "🇿🇦", name: "South Africa" },
];

function BoltIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  );
}

export default function SignIn() {
  const [step, setStep] = useState("phone"); // phone | otp
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [showCountries, setShowCountries] = useState(false);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(Array(6).fill(""));
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(299);
  const [canResend, setCanResend] = useState(false);

  const otpRefs = useRef([]);

  // Countdown
  useEffect(() => {
    if (step !== "otp") return;
    setSecondsLeft(299);
    setCanResend(false);
    const t0 = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - t0) / 1000);
      const left = Math.max(0, 299 - elapsed);
      setSecondsLeft(left);
      if (elapsed >= 30) setCanResend(true);
      if (left === 0) clearInterval(interval);
    }, 500);
    return () => clearInterval(interval);
  }, [step, confirmation]);

  const ensureRecaptcha = async () => {
    // Singleton on window so React re-renders / StrictMode never double-create it.
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
        size: "invisible",
      });
      // Eager render so the widget is ready the moment the user clicks Send OTP.
      try { await window.recaptchaVerifier.render(); } catch (e) { console.error("recaptcha render", e); }
    }
    return window.recaptchaVerifier;
  };

  const resetRecaptcha = () => {
    try { window.recaptchaVerifier?.clear(); } catch { /* noop */ }
    const el = document.getElementById("recaptcha-container");
    if (el) el.innerHTML = "";
    window.recaptchaVerifier = null;
  };

  // Initialize recaptcha verifier ONCE on mount.
  useEffect(() => {
    ensureRecaptcha();
    return () => {
      // Keep the verifier alive across step changes; only nuke on unmount.
      resetRecaptcha();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fullPhone = useMemo(
    () => `${country.dial}${phone.replace(/[^0-9]/g, "")}`,
    [country, phone]
  );

  const sendOtp = async () => {
    setError("");
    const cleaned = phone.replace(/[^0-9]/g, "");
    if (cleaned.length < 6) {
      setError("Please enter a valid phone number.");
      return;
    }
    setSending(true);
    try {
      const verifier = await ensureRecaptcha();
      const result = await signInWithPhoneNumber(auth, fullPhone, verifier);
      setConfirmation(result);
      setStep("otp");
      setOtp(Array(6).fill(""));
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (e) {
      console.error("signInWithPhoneNumber failed", e);
      // Show exact Firebase error code + message so the user can act on it.
      const code = e?.code ? `[${e.code}] ` : "";
      const msg = e?.message ? e.message.replace("Firebase: ", "") : "Could not send OTP.";
      const host = typeof window !== "undefined" ? window.location.hostname : "";
      setError(`${code}${msg}${host ? ` · origin: ${host}` : ""}`);
      // Recreate the verifier for the next attempt (required after a failure).
      resetRecaptcha();
      await ensureRecaptcha();
    } finally {
      setSending(false);
    }
  };

  const resendOtp = async () => {
    if (!canResend) return;
    setConfirmation(null);
    resetRecaptcha();
    await ensureRecaptcha();
    setStep("phone");
    setTimeout(sendOtp, 50);
  };

  const verifyOtp = async (code) => {
    if (!confirmation) return;
    setVerifying(true);
    setError("");
    try {
      await confirmation.confirm(code);
      // onAuthStateChanged in App will take over from here.
    } catch (e) {
      console.error(e);
      setError("Invalid code. Please try again.");
      setOtp(Array(6).fill(""));
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } finally {
      setVerifying(false);
    }
  };

  const onOtpChange = (idx, value) => {
    const v = value.replace(/[^0-9]/g, "").slice(-1);
    const next = [...otp];
    next[idx] = v;
    setOtp(next);
    if (v && idx < 5) otpRefs.current[idx + 1]?.focus();
    if (next.every((d) => d !== "") && next.join("").length === 6) {
      verifyOtp(next.join(""));
    }
  };

  const onOtpKey = (idx, e) => {
    if (e.key === "Backspace" && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && idx > 0) otpRefs.current[idx - 1]?.focus();
    if (e.key === "ArrowRight" && idx < 5) otpRefs.current[idx + 1]?.focus();
  };

  const onOtpPaste = (e) => {
    const text = (e.clipboardData.getData("text") || "").replace(/[^0-9]/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = text.split("").concat(Array(6).fill("")).slice(0, 6);
    setOtp(next);
    if (next.every((d) => d !== "")) verifyOtp(next.join(""));
    else otpRefs.current[Math.min(text.length, 5)]?.focus();
  };

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="signin-shell" data-testid="signin-shell">
      <div className="top-gradient" />
      <div className="bg-glow" />

      <div className="signin-card" data-testid="signin-card">
        <div className="signin-logo">
          <span className="nav-bolt"><BoltIcon size={18} /></span>
          <span>InvoiceNudge</span>
        </div>

        {step === "phone" && (
          <>
            <h1 className="signin-title">Sign in to get started</h1>
            <p className="signin-sub">
              We'll send a one-time code to your number. No password needed.
            </p>

            <div className="phone-row">
              <div className="country-picker-wrap">
                <button
                  type="button"
                  className="country-btn"
                  data-testid="country-button"
                  onClick={() => setShowCountries((s) => !s)}
                >
                  <span className="flag">{country.flag}</span>
                  <span>{country.dial}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {showCountries && (
                  <div className="country-menu" data-testid="country-menu">
                    {COUNTRIES.map((c) => (
                      <button
                        type="button"
                        key={c.code}
                        className="country-item"
                        data-testid={`country-${c.code}`}
                        onClick={() => { setCountry(c); setShowCountries(false); }}
                      >
                        <span className="flag">{c.flag}</span>
                        <span className="country-name">{c.name}</span>
                        <span className="country-dial">{c.dial}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                className="phone-input"
                data-testid="phone-input"
                type="tel"
                inputMode="numeric"
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendOtp()}
              />
            </div>

            <button
              type="button"
              className="btn-primary signin-cta"
              data-testid="send-otp-button"
              onClick={sendOtp}
              disabled={sending}
            >
              {sending ? (<><span className="spinner" /><span>Sending...</span></>) : "Send OTP"}
            </button>
            {error && <div className="signin-error" data-testid="signin-error">{error}</div>}
            <div className="signin-privacy">We never share your number. Ever.</div>

            <div className="demo-hint" data-testid="demo-hint">
              <div className="demo-hint-label">Demo / testing number</div>
              <div className="demo-hint-body">
                Phone <code>+91 9999999999</code> · OTP <code>123456</code>
              </div>
            </div>
          </>
        )}

        {step === "otp" && (
          <>
            <h1 className="signin-title">Enter the 6-digit code</h1>
            <p className="signin-sub">
              Sent to <span style={{ color: "#A78BFA" }}>{fullPhone}</span>
            </p>

            <div className="otp-row" onPaste={onOtpPaste} data-testid="otp-row">
              {otp.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => (otpRefs.current[i] = el)}
                  className="otp-box"
                  data-testid={`otp-${i}`}
                  value={d}
                  inputMode="numeric"
                  maxLength={1}
                  onChange={(e) => onOtpChange(i, e.target.value)}
                  onKeyDown={(e) => onOtpKey(i, e)}
                  disabled={verifying}
                />
              ))}
            </div>

            {secondsLeft > 0 ? (
              <div className="signin-meta" data-testid="otp-timer">
                Code expires in {mm}:{ss}
              </div>
            ) : (
              <div className="signin-meta" style={{ color: "#EF4444" }}>Code expired. Please resend.</div>
            )}

            <div className="signin-links">
              <button
                type="button"
                className="link-btn"
                data-testid="change-number"
                onClick={() => { setStep("phone"); setError(""); }}
              >
                ← Change number
              </button>
              <button
                type="button"
                className="link-btn"
                data-testid="resend-code"
                onClick={resendOtp}
                disabled={!canResend}
                style={{ opacity: canResend ? 1 : 0.4, cursor: canResend ? "pointer" : "not-allowed" }}
              >
                Resend code
              </button>
            </div>

            {verifying && <div className="signin-meta"><span className="spinner" /> Verifying...</div>}
            {error && <div className="signin-error" data-testid="signin-error">{error}</div>}
          </>
        )}

        <div id="recaptcha-container" style={{ display: "none" }} />
      </div>
    </div>
  );
}
