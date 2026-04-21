# InvoiceNudge — PRD

## Problem
Freelancers lose money chasing overdue invoices. InvoiceNudge generates AI follow-up emails tailored to tone, client, and days overdue. Free for first 5 nudges per browser, no signup.

## Architecture
- React frontend (CRA + craco). No backend changes.
- Gemini (`gemini-2.5-flash`) called directly from browser.
- `localStorage` persists `nudgesUsed`, `sent`, `outstanding`, `recovered`, `history` per browser — no account required.
- Firebase SDK + `src/lib/firebase.js` (Firestore) remain installed for future features (history sync, Pro billing, team collab, etc.). **No Auth in use.**

## Personas
- Freelance designer/developer needing late-invoice follow-ups. Opens the app and starts using it immediately.

## Implemented (Jan 2026)
- **Dark Professional redesign** (Linear/Vercel vibe): #0F0F12 bg, #1A1A24 cards, #7C6AF7 accents, Geist font, top gradient strip, staggered fade-in-up animations, animated gradient email border, shimmer loading, gradient Generate button.
- **Invoice Details** card with left purple accent + focus glow + placeholder examples.
- **Escalation Tone**: 3 tones (Friendly / Firm / Final Notice) with active glow.
- **Generated Email**: animated gradient border, subject pill, editable textarea, Copy → "✓ Copied!" for 2s, shimmer placeholder while loading.
- **Stats** (Outstanding / Emails sent / Recovered) backed by localStorage.
- **Pro Banner** + **Pro Modal** ($7/mo, 6 ✓ features, "Join the Waitlist — It's Free" link to `forms.gle/...`, 50% off footnote).
- **Hero** + **Trust bar** (No signup · Works in any language · 5 free nudges).
- **Empty-state** pulsing envelope with "one click away" copy.
- **Empty-form validation**: shake + red borders + top toast.
- **Counter flash** green on success; red dot at 5/5.
- **Footer** "InvoiceNudge © 2026".
- **Nudge counter** pill in navbar driven by `localStorage.invoicenudge_uses` — 5 lifetime nudges per browser, never resets, never decrements.

## Removed
- Firebase Phone Auth (SignIn screen, OTP flow, avatar dropdown, My Account modal, `useAuth`, `auth.jsx`, `SignIn.jsx`) — user requested removal; app now opens instantly to the form.

## Backlog
- Replace `forms.gle/REPLACEWITHYOURGOOGLEFORMLINK` with real Google Form.
- Waitlist email capture (Resend).
- Real auto-send via Gmail OAuth.
- Payment tracking → `recovered` stat.
- WhatsApp share template.
- Late-fee calculator.
- Move Gemini key behind backend proxy.
- (Later) re-introduce optional auth with Firebase Blaze plan for cross-device sync & Pro billing.
