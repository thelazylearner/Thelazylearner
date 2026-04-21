import { useEffect, useMemo, useState } from "react";
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

  const [uses, setUses] = useLocalNumber(STORAGE.uses);
  const [sent, setSent] = useLocalNumber(STORAGE.sent);
  const [outstanding, setOutstanding] = useLocalNumber(STORAGE.outstanding);
  const [recovered] = useLocalNumber(STORAGE.recovered);

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
    return `You are an expert freelancer writing a ${toneLabel.toLowerCase()} follow-up email for an overdue invoice.

Details:
- Client name: ${form.clientName}
- Invoice number: ${form.invoiceNumber}
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
      form.invoiceNumber.trim() &&
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
      } catch { /* noop */ }
      setCounterFlash(true);
      setTimeout(() => setCounterFlash(false), 500);
    } catch (e) {
      setError("Something went wrong generating the email. Please try again.");
    } finally {
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
          <div className={`nav-pill ${counterFlash ? "flash" : ""}`} data-testid="nudge-counter">
            <span className={`nav-pill-dot ${uses >= FREE_LIMIT ? "red" : "green"}`} />
            <span>
              {uses} / {FREE_LIMIT} nudges used
            </span>
          </div>
        </div>
      </nav>

      <main className="container">
        <header className="hero">
          <h1>
            Get paid faster.<br />
            <span className="accent">Nudge overdue invoices</span> in seconds.
          </h1>
          <p>
            Used by 1,000+ freelancers worldwide. Free for your first 5 nudges — no credit card, no signup needed.
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
                <label>Invoice Number</label>
                <input className={invalidFields ? "invalid" : ""}
                  data-testid="input-invoice-number"
                  value={form.invoiceNumber}
                  onChange={(e) => onChange("invoiceNumber", e.target.value)}
                  placeholder="e.g. INV-2025-047"
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
              </div>
              <div className="field">
                <label>Your Name</label>
                <input className={invalidFields ? "invalid" : ""}
                  data-testid="input-your-name"
                  value={form.yourName}
                  onChange={(e) => onChange("yourName", e.target.value)}
                  placeholder="e.g. Sarah Chen – Freelance Designer"
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
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Generate follow-up email →</span>
                </>
              )}
            </button>

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
        <section style={{ marginTop: 20 }}>
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
            <div className="output-wrap ghost">
              <div className="output-inner">
                <div className="empty-output" data-testid="output-empty">
                  <div className="dot pulse"><Mail size={22} /></div>
                  <div style={{ color: "#E8E8F0", fontSize: 14, fontWeight: 500 }}>
                    Your professional follow-up is one click away
                  </div>
                  <div style={{ fontSize: 13 }}>
                    Fill in the details on the left, pick your tone, and generate. Takes 10 seconds.
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Stats */}
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

        {/* Pro Banner */}
        <div className="pro-banner" data-testid="pro-banner">
          <div className="pro-left">
            <div className="pro-title">Unlock Pro</div>
            <div className="pro-pills">
              <span className="pro-pill">Unlimited nudges</span>
              <span className="pro-pill">Auto-send</span>
              <span className="pro-pill">Payment tracker</span>
              <span className="pro-pill">WhatsApp templates</span>
            </div>
          </div>
          <button
            type="button"
            data-testid="upgrade-button"
            className="upgrade-btn"
            onClick={() => setShowPro(true)}
          >
            Upgrade — $7/mo
          </button>
        </div>
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
            <div className="modal-price">$7 <span style={{ fontSize: 16, color: "var(--label)", fontWeight: 500 }}>/ month</span></div>
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
              See Pro plans — $7/mo
            </button>
            <div className="modal-footnote">
              Free tier resets are coming soon — stay tuned.
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
