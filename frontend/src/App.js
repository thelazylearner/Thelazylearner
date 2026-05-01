import { useEffect, useMemo, useRef, useState } from "react";
import "@/App.css";
import {
  Zap,
  FileText,
  MessageSquare,
  Mail,
  Wallet,
  Send,
  CheckCircle2,
  Check,
  X,
  Sparkles,
  Lock,
  Clock,
  ChevronDown,
  LogOut,
  User as UserIcon,
} from "lucide-react";
import { useAuth, FREE_LIMIT as USER_FREE_LIMIT } from "@/lib/auth";
import SignIn from "@/components/SignIn";
import AuthGate from "@/components/AuthGate";

const GEMINI_API_KEY = "AIzaSyDec_AOK4e6xj30WQHgvpsldn68i_AEppg";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const FREE_LIMIT = 5;
const STORAGE = {
  uses: "invoicenudge_uses",
  sent: "invoicenudge_sent",
  outstanding: "invoicenudge_outstanding",
  recovered: "invoicenudge_recovered",
  history: "invoicenudge_history",
  pending: "invoicenudge_pending",
};

const TONES = [
  { id: "friendly", title: "Friendly", sub: "Polite reminder" },
  { id: "firm", title: "Firm", sub: "Professional & direct" },
  { id: "final", title: "Final Notice", sub: "Serious action required" },
];

const fmtMoney = (v) => {
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return isFinite(n) ? n : 0;
};

function useLocalNumber(key) {
  const [val, setVal] = useState(() => Number(localStorage.getItem(key) || 0));
  useEffect(() => {
    localStorage.setItem(key, String(val));
  }, [key, val]);
  return [val, setVal];
}

function BoltIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  );
}

function App() {
  const { user, profile, ready, signInGoogle, signOut, recordNudge, updateProfile } = useAuth();
  const [showSignIn, setShowSignIn] = useState(false);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    const onClickOutside = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const [form, setForm] = useState({
    clientName: "",
    amount: "",
    invoiceNumber: "",
    workDone: "",
    daysOverdue: "",
    yourName: "",
  });
  const [tone, setTone] = useState("friendly");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState({ subject: "", body: "" });
  const [copied, setCopied] = useState(false);
  const [showPro, setShowPro] = useState(false);
  const [showLimit, setShowLimit] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [invalidFields, setInvalidFields] = useState(false);
  const [toast, setToast] = useState("");
  const [counterFlash, setCounterFlash] = useState(false);
  const [slowHint, setSlowHint] = useState(false);
  const slowTimerRef = useRef(null);
  const outputRef = useRef(null);
  const [recoveryPrompt, setRecoveryPrompt] = useState(null); // { client, amount, invoice }
  const [recoveryWin, setRecoveryWin] = useState(null); // { client, amount } after mark-paid

  // A/B price test — assigned once per browser, 50/50 split.
  const [priceVariant] = useState(() => {
    let v = localStorage.getItem("invoicenudge_price_variant");
    if (v !== "a" && v !== "b") {
      v = Math.random() < 0.5 ? "a" : "b";
      localStorage.setItem("invoicenudge_price_variant", v);
    }
    return v;
  });
  const priceLabel = priceVariant === "b" ? "$12" : "$7";
  // Log impression once per session per variant.
  useEffect(() => {
    const k = `invoicenudge_imp_${priceVariant}`;
    if (!sessionStorage.getItem(k)) {
      sessionStorage.setItem(k, "1");
      const n = Number(localStorage.getItem(k) || 0) + 1;
      localStorage.setItem(k, String(n));
    }
  }, [priceVariant]);
  const trackUpgradeClick = () => {
    const k = `invoicenudge_click_${priceVariant}`;
    const n = Number(localStorage.getItem(k) || 0) + 1;
    localStorage.setItem(k, String(n));
  };

  // ===== Recovery Sequence (Pro-tier) =====
  const [leftTab, setLeftTab] = useState("details"); // "details" | "sequence"
  const [isPro, setIsPro] = useState(() => localStorage.getItem("invoicenudge_is_pro") === "true");
  useEffect(() => {
    if (user) setIsPro(!!profile?.isPro);
    else setIsPro(localStorage.getItem("invoicenudge_is_pro") === "true");
  }, [user, profile]);
  useEffect(() => {
    if (user) return; // Only listen to LS changes when signed-out
    const h = () => setIsPro(localStorage.getItem("invoicenudge_is_pro") === "true");
    window.addEventListener("storage", h);
    return () => window.removeEventListener("storage", h);
  }, [user]);
  const SEQUENCE_DEFAULTS = [
    { day: 1, tone: "friendly" },
    { day: 7, tone: "firm" },
    { day: 14, tone: "final" },
  ];
  const [sequence, setSequence] = useState(() =>
    SEQUENCE_DEFAULTS.map((s) => ({ ...s, loading: false, error: "", output: null }))
  );
  const DAY_OPTIONS = [1, 3, 5, 7, 10, 14, 21];
  const TONE_META = {
    friendly: { label: "Friendly", color: "green" },
    firm: { label: "Firm", color: "amber" },
    final: { label: "Final Notice", color: "red" },
  };

  const buildSequencePrompt = (idx) => {
    const step = sequence[idx];
    const toneLabel = TONE_META[step.tone].label;
    const attemptOrdinal = ["1st", "2nd", "3rd"][idx];
    const prev = idx > 0 ? sequence[idx - 1] : null;
    const prevNote = prev?.output
      ? `Previous email subject: "${prev.output.subject}" (sent ${sequence[idx].day - prev.day} days before this one). Subtly acknowledge it — e.g. "Following up on my previous email" — without quoting it verbatim.`
      : "This is the first email in the sequence.";
    const invoiceLine = form.invoiceNumber.trim()
      ? `- Invoice number: ${form.invoiceNumber}`
      : `- Invoice number: (not provided — refer generically, do NOT invent a number)`;
    const workLine = form.workDone.trim()
      ? `- Work done / service description: ${form.workDone.trim()}`
      : `- Work done: (not provided — do NOT invent services, never leave [service] placeholder)`;
    return `You are writing the ${attemptOrdinal} email in a 3-email follow-up sequence for an overdue invoice.

Invoice context:
- Client name: ${form.clientName}
${invoiceLine}
${workLine}
- Amount due: ${form.amount}
- Original days overdue (at start of sequence): ${form.daysOverdue}
- Sender: ${form.yourName}

This is email #${idx + 1} — tone: ${toneLabel}.
${prevNote}

Tone guidance:
- Friendly: warm, polite, assumes it's an oversight
- Firm: professional, direct, mentions terms and requests immediate action
- Final Notice: serious, references potential next steps (late fees, collections) while remaining professional

If a work/service description is provided, weave it naturally into the body to remind the client of the value they received. Do not just append it — integrate it as a core part of the narrative. Never leave a placeholder like [service] in the email.

Output format (strict):
Subject: <one concise subject line>
<blank line, then body. Natural line breaks. Sign off with "Best," and the sender's name.>
Do not include markdown or explanations — only the subject line and body.`;
  };

  const generateSequenceStep = async (idx) => {
    if (!user) {
      setShowAuthGate(true);
      return;
    }
    if (idx > 0 && !isPro) {
      trackUpgradeClick();
      setShowPro(true);
      return;
    }
    if (!canGenerate) {
      setLeftTab("details");
      setShake(true);
      setInvalidFields(true);
      setToast("Fill in the invoice details first");
      setTimeout(() => setShake(false), 600);
      setTimeout(() => setInvalidFields(false), 2000);
      setTimeout(() => setToast(""), 3000);
      return;
    }
    if (!isPro && uses >= FREE_LIMIT) {
      setShowLimit(true);
      return;
    }
    setSequence((s) => s.map((st, i) => i === idx ? { ...st, loading: true, error: "" } : st));
    try {
      const res = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: buildSequencePrompt(idx) }] }] }),
      });
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!text) throw new Error("empty");
      const parsed = parseEmail(text);
      setSequence((s) => s.map((st, i) => i === idx ? { ...st, loading: false, output: parsed } : st));
      if (idx === 0 && !isPro) {
        setUses(uses + 1);
        setSent(sent + 1);
      }
    } catch {
      setSequence((s) => s.map((st, i) => i === idx ? { ...st, loading: false, error: "Could not generate. Try again." } : st));
    }
  };

  const updateStepDay = (idx, day) => setSequence((s) => s.map((st, i) => i === idx ? { ...st, day } : st));

  const scheduleSequence = () => {
    if (!isPro) { trackUpgradeClick(); setShowPro(true); return; }
    setToast("Sequence scheduled! We'll send each email automatically.");
    setTimeout(() => setToast(""), 3500);
  };

  const [usesLocal, setUsesLocal] = useLocalNumber(STORAGE.uses);
  const [sentLocal, setSentLocal] = useLocalNumber(STORAGE.sent);
  const [outstandingLocal, setOutstandingLocal] = useLocalNumber(STORAGE.outstanding);
  const [recoveredLocal, setRecoveredLocal] = useLocalNumber(STORAGE.recovered);

  // Effective values: Firestore profile when signed in, localStorage otherwise.
  const uses = user ? (profile?.nudgesUsed || 0) : usesLocal;
  const sent = user ? (profile?.nudgesUsed || 0) : sentLocal;
  const outstanding = user ? (profile?.outstanding || 0) : outstandingLocal;
  const recovered = user ? (profile?.recovered || 0) : recoveredLocal;
  const setUses = (v) => user ? recordNudge() : setUsesLocal(v);
  const setSent = (v) => user ? null : setSentLocal(v);
  const setOutstanding = (v) => user ? updateProfile({ outstanding: v }) : setOutstandingLocal(v);
  const setRecovered = (v) => user ? updateProfile({ recovered: v }) : setRecoveredLocal(v);

  // On session open, surface the most recent pending invoice (generated in a prior session).
  useEffect(() => {
    if (!ready) return;
    try {
      const now = Date.now();
      const sessionKey = "invoicenudge_session_start";
      if (!sessionStorage.getItem(sessionKey)) {
        sessionStorage.setItem(sessionKey, String(now));
      }
      const sessionStart = Number(sessionStorage.getItem(sessionKey));
      const pending = user ? (profile?.pending || []) : (() => {
        try { return JSON.parse(localStorage.getItem(STORAGE.pending) || "[]"); } catch { return []; }
      })();
      const prior = pending.filter((p) => p.at < sessionStart);
      if (prior.length > 0) setRecoveryPrompt(prior[prior.length - 1]);
      else setRecoveryPrompt(null);
    } catch { /* noop */ }
  }, [ready, user, profile]);

  const fireConfetti = () => {
    const run = () => {
      const confetti = window.confetti;
      if (!confetti) return;
      confetti({
        particleCount: 120,
        spread: 75,
        startVelocity: 45,
        origin: { y: 0.6 },
        colors: ["#7C6AF7", "#A78BFA", "#34D399", "#FFFFFF"],
      });
      setTimeout(() => confetti({
        particleCount: 80, spread: 100, startVelocity: 30,
        origin: { x: 0.2, y: 0.7 }, colors: ["#7C6AF7", "#A78BFA"],
      }), 220);
      setTimeout(() => confetti({
        particleCount: 80, spread: 100, startVelocity: 30,
        origin: { x: 0.8, y: 0.7 }, colors: ["#34D399", "#A78BFA"],
      }), 420);
    };
    if (window.confetti) run();
    else {
      // wait up to ~800ms for the CDN script to load
      let tries = 0;
      const iv = setInterval(() => {
        tries++;
        if (window.confetti) { clearInterval(iv); run(); }
        else if (tries > 16) clearInterval(iv);
      }, 50);
    }
  };

  const markRecovered = () => {
    if (!recoveryPrompt) return;
    const amt = Number(recoveryPrompt.amount) || 0;
    setRecovered(recovered + amt);
    setOutstanding(Math.max(0, outstanding - amt));
    if (user) {
      const next = (profile?.pending || []).filter((p) => p.at !== recoveryPrompt.at);
      updateProfile({ pending: next });
    } else {
      try {
        const pending = JSON.parse(localStorage.getItem(STORAGE.pending) || "[]");
        const next = pending.filter((p) => p.at !== recoveryPrompt.at);
        localStorage.setItem(STORAGE.pending, JSON.stringify(next));
      } catch { /* noop */ }
    }
    fireConfetti();
    setRecoveryWin({ client: recoveryPrompt.client, amount: amt });
    setRecoveryPrompt(null);
  };

  const dismissRecovery = () => {
    if (!recoveryPrompt) return;
    if (user) {
      const next = (profile?.pending || []).filter((p) => p.at !== recoveryPrompt.at);
      updateProfile({ pending: next });
    } else {
      try {
        const pending = JSON.parse(localStorage.getItem(STORAGE.pending) || "[]");
        const next = pending.filter((p) => p.at !== recoveryPrompt.at);
        localStorage.setItem(STORAGE.pending, JSON.stringify(next));
      } catch { /* noop */ }
    }
    setRecoveryPrompt(null);
  };

  const shareWin = async () => {
    if (!recoveryWin) return;
    const text = `I just recovered $${recoveryWin.amount.toLocaleString()} from an overdue invoice using InvoiceNudge. Get paid faster 👉`;
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ title: "I got paid!", text, url });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
      }
    } catch { /* noop */ }
  };

  const onChange = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const parseEmail = (text) => {
    const subjMatch = text.match(/^\s*Subject:\s*(.+)$/im);
    const subject = subjMatch ? subjMatch[1].trim() : "Follow-up on overdue invoice";
    let body = text.replace(/^\s*Subject:.*$/im, "").trim();
    body = body.replace(/^\s*Body:\s*/i, "").trim();
    return { subject, body };
  };

  const buildPrompt = () => {
    const toneLabel = TONES.find((t) => t.id === tone)?.title || "Friendly";
    const invoiceLine = form.invoiceNumber.trim()
      ? `- Invoice number: ${form.invoiceNumber}`
      : `- Invoice number: (not provided — refer to the invoice generically, e.g. "your recent invoice" or "the outstanding invoice"; do NOT invent a number)`;
    const workLine = form.workDone.trim()
      ? `- Work done / service description: ${form.workDone.trim()}`
      : `- Work done: (not provided — do NOT invent specific services, and never leave a placeholder like [service] in the email)`;
    return `You are an expert freelancer writing a ${toneLabel.toLowerCase()} follow-up email for an overdue invoice.

Details:
- Client name: ${form.clientName}
${invoiceLine}
${workLine}
- Amount due: ${form.amount}
- Days overdue: ${form.daysOverdue}
- Sender: ${form.yourName}

Tone guidance:
- Friendly: warm, polite, assumes it's an oversight
- Firm: professional, direct, mentions terms and requests immediate action
- Final Notice: serious, references potential next steps (late fees, collections) while remaining professional

If a work/service description is provided, weave it naturally into the email body in a way that reminds the client of the value they received. Do not just append it — integrate it as a core part of the narrative. The goal is to trigger the client's memory of the work and create a sense of reciprocal obligation to pay. If not provided, reference only the invoice number and amount. Never leave a blank placeholder like [service] in the email.

Output format (strict):
Subject: <one concise subject line>
<then a blank line, then the email body. Use natural line breaks. Sign off with "Best," and the sender's name.>
Do not include any markdown or explanations—only the subject line and body.`;
  };

  const canGenerate = useMemo(
    () =>
      form.clientName.trim() &&
      form.amount.toString().trim() &&
      form.daysOverdue.toString().trim() &&
      form.yourName.trim(),
    [form]
  );

  const handleGenerate = async () => {
    setError("");
    if (!canGenerate) {
      setShake(true);
      setInvalidFields(true);
      setToast("Please fill in all fields before generating");
      setTimeout(() => setShake(false), 600);
      setTimeout(() => setInvalidFields(false), 2000);
      setTimeout(() => setToast(""), 3000);
      return;
    }
    if (!user) {
      setShowAuthGate(true);
      return;
    }
    if (uses >= FREE_LIMIT && !isPro) {
      setShowLimit(true);
      return;
    }
    setLoading(true);
    setSlowHint(false);
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    slowTimerRef.current = setTimeout(() => setSlowHint(true), 3000);
    setOutput({ subject: "", body: "" });
    try {
      const res = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt() }] }],
        }),
      });
      const data = await res.json();
      const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        data?.candidates?.[0]?.content?.parts?.[0]?.Text ||
        "";
      if (!text) throw new Error("No response from Gemini");
      const parsed = parseEmail(text);
      setOutput(parsed);

      // Update counters (localStorage)
      const amt = fmtMoney(form.amount);
      setUses(uses + 1);
      setSent(sent + 1);
      setOutstanding(outstanding + amt);
      try {
        if (user) {
          // Append to Firestore arrays (read current then write back via merge).
          const histEntry = {
            at: Date.now(),
            client: form.clientName,
            invoice: form.invoiceNumber,
            amount: amt,
            tone,
            subject: parsed.subject,
          };
          await updateProfile({
            history: [...(profile?.history || []), histEntry],
            pending: [...(profile?.pending || []), {
              at: Date.now(),
              client: form.clientName,
              invoice: form.invoiceNumber,
              amount: amt,
            }],
          });
        } else {
          const history = JSON.parse(localStorage.getItem(STORAGE.history) || "[]");
          history.push({ at: Date.now(), client: form.clientName, invoice: form.invoiceNumber, amount: amt, tone, subject: parsed.subject });
          localStorage.setItem(STORAGE.history, JSON.stringify(history));
          const pending = JSON.parse(localStorage.getItem(STORAGE.pending) || "[]");
          pending.push({ at: Date.now(), client: form.clientName, invoice: form.invoiceNumber, amount: amt });
          localStorage.setItem(STORAGE.pending, JSON.stringify(pending));
        }
      } catch { /* noop */ }
      setCounterFlash(true);
      setTimeout(() => setCounterFlash(false), 500);
      // Smooth-scroll to the generated email
      setTimeout(() => {
        outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
    } catch (e) {
      setError("Something went wrong generating the email. Please try again.");
    } finally {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setSlowHint(false);
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    const text = `Subject: ${output.subject}\n\n${output.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="app-shell">
      <div className="top-gradient" />
      <div className="bg-glow" />

      {/* Navbar */}
      <nav className="nav" data-testid="navbar">
        <div className="nav-inner">
          <div className="nav-logo" data-testid="nav-logo">
            <span className="nav-bolt">
              <BoltIcon size={16} />
            </span>
            <span>InvoiceNudge</span>
          </div>
          {(() => {
            const remaining = Math.max(0, FREE_LIMIT - uses);
            let variant = "green";
            let msg = `${remaining} free nudges remaining`;
            let clickable = false;
            if (uses === 3) { variant = "amber"; msg = "Warning: 2 nudges remaining"; }
            else if (uses === 4) { variant = "orange"; msg = "1 nudge remaining — Upgrade to keep going"; clickable = true; }
            else if (uses >= FREE_LIMIT) { variant = "red"; msg = "No nudges left — Upgrade for unlimited"; clickable = true; }
            return (
              <div className="nav-right">
                <button
                  type="button"
                  className={`nav-pill pill-${variant} ${counterFlash ? "flash" : ""} ${clickable ? "clickable" : ""}`}
                  data-testid="nudge-counter"
                  onClick={() => clickable && setShowPro(true)}
                  disabled={!clickable}
                >
                  <span className={`nav-pill-dot ${variant}`} />
                  <span>{user ? `${uses} / ${FREE_LIMIT} this month` : msg}</span>
                </button>
                {!user ? (
                  <button
                    type="button"
                    className="nav-signin"
                    data-testid="nav-signin"
                    onClick={() => setShowSignIn(true)}
                  >
                    Sign In
                  </button>
                ) : (
                  <div className="avatar-wrap" ref={menuRef}>
                    <button
                      type="button"
                      className="avatar-btn"
                      data-testid="avatar-button"
                      onClick={() => setMenuOpen((v) => !v)}
                      aria-label="Account menu"
                    >
                      {profile?.photoURL
                        ? <img src={profile.photoURL} alt="" className="avatar-img" />
                        : (profile?.displayName || profile?.email || "U").slice(0, 1).toUpperCase()}
                    </button>
                    {menuOpen && (
                      <div className="avatar-menu" data-testid="avatar-menu">
                        <div className="avatar-menu-head">
                          <div className="avatar-menu-phone">{profile?.displayName || "Welcome"}</div>
                          <div className="avatar-menu-sub">{profile?.email}</div>
                        </div>
                        <button
                          type="button"
                          className="avatar-menu-item danger"
                          data-testid="menu-signout"
                          onClick={() => { setMenuOpen(false); signOut(); }}
                        >
                          <LogOut size={14} /> Sign out
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </nav>

      <main className="container">
        <header className="hero">
          <h1>
            Get paid faster.<br />
            <span className="accent">Nudge overdue invoices</span> in seconds.
          </h1>
          <p>
            Free for your first 5 nudges — no credit card, no signup needed.
          </p>
        </header>

        <div className="trust-bar" data-testid="trust-bar">
          <span>✦ No signup required</span>
          <span className="trust-dot">·</span>
          <span>✦ Works in any language</span>
          <span className="trust-dot">·</span>
          <span>✦ 5 free nudges every month</span>
        </div>

        <div className="grid">
          {/* Invoice Details / Recovery Sequence */}
          <section className={`card card-accent-left delay-1 ${shake ? "shake" : ""}`} data-testid="card-invoice-details">
            <div className="tab-bar" data-testid="tab-bar">
              <button
                type="button"
                className={`tab-btn ${leftTab === "details" ? "active" : ""}`}
                data-testid="tab-details"
                onClick={() => setLeftTab("details")}
              >
                <FileText size={14} /> Invoice Details
              </button>
              <button
                type="button"
                className={`tab-btn ${leftTab === "sequence" ? "active" : ""}`}
                data-testid="tab-sequence"
                onClick={() => setLeftTab("sequence")}
              >
                <Clock size={14} /> Recovery Sequence
                <span className="tab-pro-badge">PRO</span>
              </button>
            </div>

            {leftTab === "details" ? (
              <div className="form-grid">
                <div className="field full">
                  <label>Client Name</label>
                  <input className={invalidFields ? "invalid" : ""}
                    data-testid="input-client-name"
                    value={form.clientName}
                    onChange={(e) => onChange("clientName", e.target.value)}
                    placeholder="e.g. Acme Studios"
                  />
                </div>
                <div className="field">
                  <label>Invoice Amount</label>
                  <input className={invalidFields ? "invalid" : ""}
                    data-testid="input-amount"
                    value={form.amount}
                    onChange={(e) => onChange("amount", e.target.value)}
                    placeholder="e.g. $2,400.00"
                  />
                </div>
                <div className="field">
                  <label>
                    Invoice Number <span className="label-optional">(optional)</span>
                  </label>
                  <input
                    data-testid="input-invoice-number"
                    value={form.invoiceNumber}
                    onChange={(e) => onChange("invoiceNumber", e.target.value)}
                    placeholder="e.g. INV-047  (leave blank if unknown)"
                  />
                </div>
                <div className="field full">
                  <label>
                    Work Done <span className="label-optional">(optional)</span>
                  </label>
                  <div className="input-wrap">
                    <input
                      data-testid="input-work-done"
                      value={form.workDone}
                      maxLength={120}
                      onChange={(e) => onChange("workDone", e.target.value.slice(0, 120))}
                      placeholder="e.g. Logo design, website redesign, 3 social media templates"
                    />
                    {form.workDone.length > 0 && (
                      <span
                        className={`char-counter ${form.workDone.length >= 120 ? "red" : form.workDone.length > 100 ? "amber" : ""}`}
                        data-testid="work-done-counter"
                      >
                        {form.workDone.length} / 120
                      </span>
                    )}
                  </div>
                  <div className="field-help">
                    Mentioning your work makes clients 3x more likely to pay promptly.
                  </div>
                </div>
                <div className="field">
                  <label>Days Overdue</label>
                  <input className={invalidFields ? "invalid" : ""}
                    data-testid="input-days-overdue"
                    value={form.daysOverdue}
                    onChange={(e) => onChange("daysOverdue", e.target.value)}
                    placeholder="e.g. 14"
                  />
                  <div className="field-help">Not sure? Count days since the invoice due date.</div>
                </div>
                <div className="field">
                  <label>Your Name</label>
                  <input className={invalidFields ? "invalid" : ""}
                    data-testid="input-your-name"
                    value={form.yourName}
                    onChange={(e) => onChange("yourName", e.target.value)}
                    placeholder="e.g. Sarah Chen"
                  />
                </div>
              </div>
            ) : (
              <div className="sequence" data-testid="sequence">
                {sequence.map((step, idx) => {
                  const tone = TONE_META[step.tone];
                  const locked = idx > 0 && !isPro;
                  return (
                    <div
                      key={idx}
                      className={`seq-step ${locked ? "locked" : ""}`}
                      data-testid={`seq-step-${idx}`}
                    >
                      <div className="seq-rail">
                        <div className={`seq-dot ${tone.color}`} />
                        {idx < sequence.length - 1 && <div className="seq-line" />}
                      </div>
                      <div className="seq-body">
                        <div className="seq-head">
                          <div className="seq-title-row">
                            <select
                              className="seq-day"
                              data-testid={`seq-day-${idx}`}
                              value={step.day}
                              onChange={(e) => updateStepDay(idx, Number(e.target.value))}
                              disabled={locked}
                            >
                              {DAY_OPTIONS.map((d) => (
                                <option key={d} value={d}>Day {d}</option>
                              ))}
                            </select>
                            <span className={`seq-tone-badge tone-${tone.color}`}>{tone.label}</span>
                            {locked && <span className="seq-lock-badge"><Lock size={10} /> PRO</span>}
                          </div>
                          <button
                            type="button"
                            className={`seq-generate-btn ${locked ? "locked" : ""}`}
                            data-testid={`seq-generate-${idx}`}
                            onClick={() => generateSequenceStep(idx)}
                            disabled={step.loading}
                          >
                            {step.loading ? (
                              <><span className="spinner" /> Generating...</>
                            ) : locked ? (
                              <><Lock size={13} /> Unlock Email {idx + 1}</>
                            ) : (
                              <>Generate Email {idx + 1}</>
                            )}
                          </button>
                        </div>

                        {step.output && !locked && (
                          <div className="seq-preview" data-testid={`seq-preview-${idx}`}>
                            <div className="seq-preview-subject">
                              <span>Subject:</span> {step.output.subject}
                            </div>
                            <div className="seq-preview-body">{step.output.body}</div>
                          </div>
                        )}
                        {locked && (
                          <div className="seq-preview seq-preview-locked" data-testid={`seq-locked-${idx}`}>
                            <div className="seq-preview-subject" style={{ filter: "blur(4px)" }}>
                              <span>Subject:</span> [Locked — Pro only]
                            </div>
                            <div className="seq-preview-body" style={{ filter: "blur(4px)" }}>
                              Upgrade to Pro to unlock automated {tone.label.toLowerCase()} follow-up #{idx + 1}. Each email references the prior one and escalates naturally...
                            </div>
                            <div className="seq-locked-overlay">
                              <Lock size={18} />
                              <span>Unlock with Pro</span>
                            </div>
                          </div>
                        )}
                        {step.error && <div className="signin-error" style={{ marginTop: 10 }}>{step.error}</div>}
                      </div>
                    </div>
                  );
                })}

                <div className="seq-schedule-row">
                  <button
                    type="button"
                    className="btn-primary"
                    data-testid="schedule-sequence"
                    onClick={scheduleSequence}
                  >
                    {isPro ? "Schedule entire sequence" : (<><Lock size={14} /> Schedule entire sequence — Upgrade to Pro</>)}
                  </button>
                  <div className="seq-schedule-hint">
                    {isPro
                      ? "We'll auto-send each email on its scheduled day via your connected inbox."
                      : `Pro users auto-send all 3 emails on schedule. Upgrade for ${priceLabel}/mo.`}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Escalation Tone */}
          <section className="card card-accent-left delay-2" data-testid="card-tone">
            <div className="card-header">
              <span className="card-header-icon"><MessageSquare size={16} /></span>
              <span className="card-title">Escalation Tone</span>
            </div>
            <div className="tones">
              {TONES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  data-testid={`tone-${t.id}`}
                  className={`tone ${tone === t.id ? "active" : ""}`}
                  onClick={() => setTone(t.id)}
                >
                  <div className="tone-title">{t.title}</div>
                  <div className="tone-sub">{t.sub}</div>
                </button>
              ))}
            </div>

            <button
              type="button"
              data-testid="generate-button"
              className="btn-primary"
              onClick={handleGenerate}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  <span>Generating your email...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Generate follow-up email →</span>
                </>
              )}
            </button>

            {loading && slowHint && (
              <div className="slow-hint" data-testid="slow-hint">
                Almost there — crafting the perfect tone for you...
              </div>
            )}

            {error && (
              <div
                data-testid="error-msg"
                style={{ color: "#F87171", fontSize: 13, marginTop: 12 }}
              >
                {error}
              </div>
            )}
          </section>
        </div>

        {/* Generated Email */}
        <section style={{ marginTop: 20 }} ref={outputRef}>
          {output.body || loading ? (
            <div className={`output-wrap ${loading ? "ghost" : ""}`} data-testid="output-card">
              <div className="output-inner">
                <div className="card-header" style={{ marginBottom: 16 }}>
                  <span className="card-header-icon"><Mail size={16} /></span>
                  <span className="card-title">Generated Email</span>
                  <span className="card-sub">{TONES.find((t) => t.id === tone)?.title} tone</span>
                </div>

                {loading ? (
                  <div className="shimmer-lines" data-testid="loading-shimmer">
                    <div className="shimmer w1" />
                    <div className="shimmer w2" />
                    <div className="shimmer w3" />
                    <div className="shimmer w1" />
                    <div className="shimmer w2" />
                  </div>
                ) : (
                  <>
                    <div className="subject-line">
                      <span className="subject-label">Subject:</span>
                      <span className="subject-text" data-testid="output-subject">{output.subject}</span>
                    </div>
                    <textarea
                      className="body-text"
                      data-testid="output-body"
                      value={output.body}
                      onChange={(e) => setOutput((o) => ({ ...o, body: e.target.value }))}
                    />
                    <div className="output-actions">
                      <span style={{ color: "var(--muted)", fontSize: 12 }}>
                        Edit before sending if needed
                      </span>
                      <button
                        type="button"
                        data-testid="copy-button"
                        className={`copy-btn ${copied ? "copied" : ""}`}
                        onClick={handleCopy}
                      >
                        {copied ? "✓ Copied!" : "Copy"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="sample-pill" data-testid="sample-pill">Sample output</div>
              <div className="output-wrap ghost sample" data-testid="output-empty">
                <div className="output-inner">
                  <div className="card-header" style={{ marginBottom: 16 }}>
                    <span className="card-header-icon"><Mail size={16} /></span>
                    <span className="card-title">Generated Email</span>
                    <span className="card-sub">Preview</span>
                  </div>
                  <div className="subject-line">
                    <span className="subject-label">Subject:</span>
                    <span className="subject-text">
                      Follow-up: Invoice #INV-2025-047 — Payment Overdue
                    </span>
                  </div>
                  <div className="body-text" aria-hidden="true" style={{ whiteSpace: "pre-wrap" }}>
{`Hi [Client Name],

I hope you're doing well. I wanted to follow up on Invoice #INV-2025-047 for $2,400.00, which was due 14 days ago.

Could you let me know when I can expect payment?

Thanks,
[Your Name]`}
                  </div>
                  <div className="output-actions">
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>
                      Fill in the form → your real email appears here
                    </span>
                    <button type="button" className="copy-btn" tabIndex={-1}>Copy email</button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Stats */}
        <div className="trust-row" data-testid="trust-row">
          <div className="trust-num">1,000+</div>
          <div className="trust-text">freelancers worldwide using InvoiceNudge to get paid faster</div>
        </div>
        {uses === 0 && sent === 0 ? (
          <div className="stats" data-testid="stats-global">
            <div className="stat">
              <div className="stat-num green">$847K</div>
              <div className="stat-label"><CheckCircle2 size={12} /> Recovered by users globally</div>
            </div>
            <div className="stat">
              <div className="stat-num purple">12,400</div>
              <div className="stat-label"><Send size={12} /> Nudges sent this month</div>
            </div>
            <div className="stat">
              <div className="stat-num white">4.2 <span style={{ fontSize: 14, color: "#8888A0", fontWeight: 500 }}>days</span></div>
              <div className="stat-label"><Wallet size={12} /> Avg. payment after nudge</div>
            </div>
          </div>
        ) : (
          <div className="stats" data-testid="stats">
            <div className="stat">
              <div className="stat-num purple" data-testid="stat-outstanding">
                ${outstanding.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
              <div className="stat-label"><Wallet size={12} /> Outstanding</div>
            </div>
            <div className="stat">
              <div className="stat-num white" data-testid="stat-sent">{sent}</div>
              <div className="stat-label"><Send size={12} /> Emails sent</div>
            </div>
            <div className="stat">
              <div className="stat-num green" data-testid="stat-recovered">
                ${recovered.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
              <div className="stat-label"><CheckCircle2 size={12} /> Recovered</div>
            </div>
          </div>
        )}

        {/* Pro Banner */}
        <div className="pro-banner" data-testid="pro-banner" data-variant={priceVariant}>
          <div className="pro-content">
            <div className="pro-head">
              <div className="pro-headline">Stop losing money to ignored invoices.</div>
              <div className="pro-sub">Pro users recover an average of $1,840 in overdue payments.</div>
            </div>
            <div className="pro-grid">
              <div className="pro-value">
                <div className="pro-value-title">Auto-send sequences</div>
                <div className="pro-value-desc">Set a 3-email drip. We send it for you.</div>
              </div>
              <div className="pro-value">
                <div className="pro-value-title">Recovery dashboard</div>
                <div className="pro-value-desc">See every dollar you've chased and recovered.</div>
              </div>
              <div className="pro-value">
                <div className="pro-value-title">WhatsApp templates</div>
                <div className="pro-value-desc">Follow up where clients actually respond.</div>
              </div>
            </div>
            <button
              type="button"
              data-testid="upgrade-button"
              className="upgrade-btn pro-cta"
              onClick={() => { trackUpgradeClick(); setShowPro(true); }}
            >
              Start recovering more — {priceLabel}/mo
            </button>
            <div className="pro-trust" data-testid="pro-trust">
              Cancel anytime · No contract · 14-day money-back guarantee
            </div>
          </div>
        </div>

        {recoveryPrompt && (
          <div className="recovery-card" data-testid="recovery-card">
            <div className="recovery-left">
              <div className="recovery-icon">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <div className="recovery-title">
                  Did <span className="recovery-client">{recoveryPrompt.client}</span> pay?
                </div>
                <div className="recovery-sub">
                  Mark ${Number(recoveryPrompt.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} invoice as recovered
                </div>
              </div>
            </div>
            <div className="recovery-actions">
              <button
                type="button"
                className="recovery-dismiss"
                data-testid="recovery-dismiss"
                onClick={dismissRecovery}
              >
                Not yet
              </button>
              <button
                type="button"
                className="recovery-confirm"
                data-testid="recovery-confirm"
                onClick={markRecovered}
              >
                <CheckCircle2 size={14} /> Mark as recovered
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Pro Modal */}
      {showPro && (
        <div className="modal-overlay" onClick={() => setShowPro(false)}>
          <div className="modal" data-testid="pro-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              data-testid="pro-modal-close"
              className="modal-close"
              onClick={() => setShowPro(false)}
              aria-label="Close"
            >
              <X size={20} />
            </button>
            <div className="modal-bolt">
              <BoltIcon size={24} />
            </div>
            <h3 className="modal-title">InvoiceNudge Pro</h3>
            <div className="modal-price">{priceLabel} <span style={{ fontSize: 16, color: "var(--label)", fontWeight: 500 }}>/ month</span></div>
            <div className="modal-cancel">Cancel anytime · No hidden fees</div>
            <ul className="modal-features">
              <li><Check size={16} /> Unlimited email generations</li>
              <li><Check size={16} /> Auto-send scheduling via Gmail</li>
              <li><Check size={16} /> Full payment tracking dashboard</li>
              <li><Check size={16} /> WhatsApp follow-up templates</li>
              <li><Check size={16} /> Late fee calculator</li>
              <li><Check size={16} /> Client history & notes</li>
            </ul>
            <a
              href="https://forms.gle/REPLACEWITHYOURGOOGLEFORMLINK"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="waitlist-button"
              className="modal-cta"
              style={{ display: "block", textAlign: "center", textDecoration: "none" }}
            >
              Join the Waitlist — It's Free
            </a>
            <div className="modal-footnote">
              Pro launches soon. Waitlist members get 50% off forever.
            </div>
          </div>
        </div>
      )}

      {/* Limit reached modal */}
      {showLimit && (
        <div className="modal-overlay" onClick={() => setShowLimit(false)}>
          <div className="modal modal-limit" data-testid="limit-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              data-testid="limit-modal-close"
              className="modal-close"
              onClick={() => setShowLimit(false)}
              aria-label="Close"
            >
              <X size={20} />
            </button>
            <div className="big-icon"><Lock size={24} /></div>
            <h3 className="modal-title">You've used your {FREE_LIMIT} free nudges</h3>
            <div style={{ color: "var(--label)", fontSize: 14, marginBottom: 18, marginTop: 4 }}>
              Upgrade to Pro for unlimited generations, auto-send, and the full payment dashboard.
            </div>
            <ul className="modal-features">
              <li><Check size={16} /> Unlimited email generations</li>
              <li><Check size={16} /> Auto-send scheduling via Gmail</li>
              <li><Check size={16} /> Full payment tracking dashboard</li>
              <li><Check size={16} /> WhatsApp follow-up templates</li>
            </ul>
            <button
              type="button"
              data-testid="limit-upgrade-button"
              className="modal-cta"
              onClick={() => { setShowLimit(false); setShowPro(true); }}
            >
              See Pro plans — {priceLabel}/mo
            </button>
            <div className="modal-footnote">
              Free tier resets are coming soon — stay tuned.
            </div>
          </div>
        </div>
      )}

      {recoveryWin && (
        <div className="modal-overlay" onClick={() => setRecoveryWin(null)}>
          <div className="modal" data-testid="win-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              data-testid="win-modal-close"
              className="modal-close"
              onClick={() => setRecoveryWin(null)}
              aria-label="Close"
            >
              <X size={20} />
            </button>
            <div className="modal-bolt" style={{ background: "rgba(52,211,153,0.12)", borderColor: "rgba(52,211,153,0.3)", color: "#34D399", boxShadow: "0 0 24px rgba(52,211,153,0.2)" }}>
              <CheckCircle2 size={24} />
            </div>
            <h3 className="modal-title">You got paid! 🎉</h3>
            <div className="modal-price" style={{ color: "#34D399" }}>
              +${recoveryWin.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <div className="modal-cancel">recovered from {recoveryWin.client}</div>
            <div style={{ color: "var(--label)", fontSize: 14, marginBottom: 22, lineHeight: 1.5 }}>
              Your follow-up worked. Share your win and help another freelancer get paid too.
            </div>
            <button
              type="button"
              data-testid="share-win"
              className="modal-cta"
              onClick={shareWin}
            >
              Share your win
            </button>
            <div className="modal-footnote">
              Every recovered invoice helps our live "recovered globally" counter grow.
            </div>
          </div>
        </div>
      )}

      {showSignIn && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "var(--bg)", overflow: "auto" }}>
          <SignIn onClose={() => setShowSignIn(false)} />
        </div>
      )}

      {showAuthGate && (
        <AuthGate
          onClose={() => setShowAuthGate(false)}
          onGoogle={async () => {
            try { await signInGoogle(); setShowAuthGate(false); }
            catch (e) { console.error(e); }
          }}
          onEmail={() => { setShowAuthGate(false); setShowSignIn(true); }}
        />
      )}

      {toast && (
        <div className="toast" data-testid="toast">{toast}</div>
      )}

      <footer className="footer" data-testid="footer">
        InvoiceNudge © 2026 · Built for freelancers worldwide
      </footer>
    </div>
  );
}

export default App;
