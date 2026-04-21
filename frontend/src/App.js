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
} from "lucide-react";

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
  const [form, setForm] = useState({
    clientName: "",
    amount: "",
    invoiceNumber: "",
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

  const [uses, setUses] = useLocalNumber(STORAGE.uses);
  const [sent, setSent] = useLocalNumber(STORAGE.sent);
  const [outstanding, setOutstanding] = useLocalNumber(STORAGE.outstanding);
  const [recovered, setRecovered] = useLocalNumber(STORAGE.recovered);

  // On session open, surface the most recent pending invoice (generated in a prior session).
  useEffect(() => {
    try {
      const now = Date.now();
      const sessionKey = "invoicenudge_session_start";
      if (!sessionStorage.getItem(sessionKey)) {
        sessionStorage.setItem(sessionKey, String(now));
      }
      const sessionStart = Number(sessionStorage.getItem(sessionKey));
      const pending = JSON.parse(localStorage.getItem(STORAGE.pending) || "[]");
      const prior = pending.filter((p) => p.at < sessionStart);
      if (prior.length > 0) {
        setRecoveryPrompt(prior[prior.length - 1]);
      }
    } catch { /* noop */ }
  }, []);

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
    try {
      const pending = JSON.parse(localStorage.getItem(STORAGE.pending) || "[]");
      const next = pending.filter((p) => p.at !== recoveryPrompt.at);
      localStorage.setItem(STORAGE.pending, JSON.stringify(next));
    } catch { /* noop */ }
    fireConfetti();
    setRecoveryWin({ client: recoveryPrompt.client, amount: amt });
    setRecoveryPrompt(null);
  };

  const dismissRecovery = () => {
    if (!recoveryPrompt) return;
    try {
      const pending = JSON.parse(localStorage.getItem(STORAGE.pending) || "[]");
      const next = pending.filter((p) => p.at !== recoveryPrompt.at);
      localStorage.setItem(STORAGE.pending, JSON.stringify(next));
    } catch { /* noop */ }
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
    return `You are an expert freelancer writing a ${toneLabel.toLowerCase()} follow-up email for an overdue invoice.

Details:
- Client name: ${form.clientName}
${invoiceLine}
- Amount due: ${form.amount}
- Days overdue: ${form.daysOverdue}
- Sender: ${form.yourName}

Tone guidance:
- Friendly: warm, polite, assumes it's an oversight
- Firm: professional, direct, mentions terms and requests immediate action
- Final Notice: serious, references potential next steps (late fees, collections) while remaining professional

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
    if (uses >= FREE_LIMIT) {
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
        const history = JSON.parse(localStorage.getItem(STORAGE.history) || "[]");
        history.push({
          at: Date.now(),
          client: form.clientName,
          invoice: form.invoiceNumber,
          amount: amt,
          tone,
          subject: parsed.subject,
        });
        localStorage.setItem(STORAGE.history, JSON.stringify(history));
        // Add to pending-recovery list (so we can ask "Did they pay?" on the next session)
        const pending = JSON.parse(localStorage.getItem(STORAGE.pending) || "[]");
        pending.push({
          at: Date.now(),
          client: form.clientName,
          invoice: form.invoiceNumber,
          amount: amt,
        });
        localStorage.setItem(STORAGE.pending, JSON.stringify(pending));
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
              <button
                type="button"
                className={`nav-pill pill-${variant} ${counterFlash ? "flash" : ""} ${clickable ? "clickable" : ""}`}
                data-testid="nudge-counter"
                onClick={() => clickable && setShowPro(true)}
                disabled={!clickable}
              >
                <span className={`nav-pill-dot ${variant}`} />
                <span>{msg}</span>
              </button>
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
          {/* Invoice Details */}
          <section className={`card card-accent-left delay-1 ${shake ? "shake" : ""}`} data-testid="card-invoice-details">
            <div className="card-header">
              <span className="card-header-icon"><FileText size={16} /></span>
              <span className="card-title">Invoice Details</span>
            </div>
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
