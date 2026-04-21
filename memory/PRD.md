# InvoiceNudge — PRD

## Problem
Freelancers lose money chasing overdue invoices. InvoiceNudge generates AI follow-up emails tailored to tone, client & days overdue. Gated behind phone-OTP auth with lifetime quota.

## Architecture
- React frontend (CRA + craco). No backend changes.
- Firebase Phone Auth (invisible reCAPTCHA) + Firestore (`users/{uid}`) for per-user persistence.
- Gemini (`gemini-2.5-flash`) called directly from browser with embedded key.
- `onAuthStateChanged` + `onSnapshot` in `src/lib/auth.jsx` keeps `userDoc` live.

## Personas
- Freelance designer/developer who needs late-invoice follow-ups; signs in with phone.

## Implemented (Jan 2026)
- **Full Dark Professional redesign** (Linear/Vercel vibe): #0F0F12 bg, #1A1A24 cards, #7C6AF7 accents, Geist font, top gradient strip, staggered fade-in-up animations, animated gradient email border, shimmer loading, gradient Generate button.
- **Invoice Details** card with left purple accent + focus glow + placeholder examples.
- **Escalation Tone** card with 3 tones (Friendly / Firm / Final Notice) + active glow.
- **Generated Email** card: animated gradient border, subject pill, editable textarea, Copy → "✓ Copied!" 2s, shimmer placeholder while loading.
- **Stats** (Outstanding / Emails sent / Recovered) driven by Firestore doc.
- **Pro Banner** + **Pro Modal** ($7/mo, 6 ✓ features, "Join the Waitlist — It's Free" link to `forms.gle/...`, 50% off footnote).
- **Hero** "Get paid faster" + trust bar (No signup · Works in any language · 5 free nudges).
- **Empty-state** pulsing envelope with "one click away" copy.
- **Empty-form validation**: shake + red borders + top toast.
- **Counter flash** green on success; red dot at limit.
- **Footer** "InvoiceNudge © 2026".
- **Firebase Phone Auth (new)**:
  - Full-screen **SignIn** gate (`components/SignIn.jsx`) with country dropdown (12 countries, default +91 India), phone input, "Send OTP" + invisible `RecaptchaVerifier`.
  - **OTP screen**: 6 auto-advancing boxes, paste support, 4:59 countdown, 30-s "Resend", "Change number", auto-submit on fill.
  - **Firestore** `users/{uid}` seeded on sign-in via `setDoc(..., {merge:true})` with `{phoneNumber, nudgesUsed, nudgeHistory[], outstanding, recovered, isPro, createdAt}`.
  - **Lifetime quota** `nudgesUsed >= 5` blocks Generate; `nudgesUsed` only incremented, never decremented. Pro users unlimited.
  - **Navbar**: real-time count from Firestore + avatar circle (last 2 digits of phone) + dropdown "My account" / "Sign out".
  - **Account modal**: phone, lifetime nudges, outstanding, plan, upgrade CTA, sign out.

## Backlog (P1/P2)
- Replace `forms.gle/REPLACEWITHYOURGOOGLEFORMLINK` with real Google Form URL.
- Waitlist email capture (Resend / SendGrid).
- Real auto-send via Gmail OAuth.
- Payment tracking dashboard (mark invoice paid → increments `recovered`).
- WhatsApp share template.
- Late fee calculator.
- Move Gemini key to backend proxy.
- Server-side quota enforcement (Cloud Function) — currently client-enforced, which is fine for free tier but spoofable.

## Firebase console pre-reqs (already done by user)
- Auth → Phone provider enabled.
- Authorized domains include preview + localhost.
- Firestore rules: `allow read, write: if request.auth != null && request.auth.uid == userId;`
