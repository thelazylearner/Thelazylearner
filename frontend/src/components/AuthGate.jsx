import { Check, X, Mail } from "lucide-react";

const GoogleIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C33.7 6.1 29 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"/>
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3l5.7-5.7C33.7 6.1 29 4 24 4 16.3 4 9.6 8.4 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 44c5 0 9.5-1.9 12.9-5.1l-6-5C29 35.5 26.6 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.6 5.1C9.5 39.6 16.2 44 24 44z"/>
    <path fill="#1976D2" d="M43.6 20.5H24v8h11.3c-.8 2.3-2.3 4.3-4.4 5.9l6 5C40.7 36.6 44 31.1 44 24c0-1.2-.2-2.4-.4-3.5z"/>
  </svg>
);

export default function AuthGate({ onClose, onGoogle, onEmail }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" data-testid="auth-gate" onClick={(e) => e.stopPropagation()}>
        <button type="button" data-testid="auth-gate-close" className="modal-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
        <h3 className="modal-title">Sign in to save your nudges</h3>
        <div style={{ color: "var(--label)", fontSize: 14, marginBottom: 18, marginTop: 2 }}>It's completely free</div>
        <ul className="modal-features">
          <li><Check size={16} /> Save all your nudge history</li>
          <li><Check size={16} /> Track which clients have paid</li>
          <li><Check size={16} /> Access from any device</li>
        </ul>
        <button type="button" className="google-btn" data-testid="gate-google" onClick={onGoogle}>
          <GoogleIcon size={18} /> <span>Continue with Google</span>
        </button>
        <button type="button" className="modal-cta" data-testid="gate-email" onClick={onEmail} style={{ marginTop: 10 }}>
          <Mail size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} /> Continue with Email
        </button>
      </div>
    </div>
  );
}
