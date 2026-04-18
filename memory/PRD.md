# InvoiceNudge — PRD

## Problem
Freelancers lose money chasing overdue invoices. InvoiceNudge is a fast, premium-feeling tool that generates AI follow-up emails tailored to tone, client and days overdue.

## Architecture
- Frontend-only React (CRA + craco). Tailwind base + custom dark theme in App.css.
- Direct Gemini API call from browser (gemini-2.5-flash) using key embedded in App.js per user instruction.
- localStorage persists rate-limit (`invoicenudge_uses`, max 5), `invoicenudge_sent`, `invoicenudge_outstanding`, `invoicenudge_recovered`.

## Personas
- Freelance designer/developer needing late-invoice follow-ups.

## Implemented (Jan 2026)
- Full Dark Professional redesign (Linear/Vercel vibe): #0F0F12 bg, #1A1A24 cards, #7C6AF7 accents, Geist font, top gradient strip, staggered fade-in-up card animations.
- Navbar: lightning bolt logo + `X / 5 nudges used` pill.
- Invoice Details card with left purple accent border, placeholder examples, focus glow.
- Escalation Tone card with Friendly / Firm / Final Notice buttons (active state with gradient + glow).
- Gradient Generate button with spinner + "Generating..." loading state.
- Generated Email card with animated gradient border, subject pill, editable textarea, Copy → "✓ Copied!" for 2s, shimmer placeholder while loading.
- Stats row (Outstanding purple / Emails sent white / Recovered green) with Wallet/Send/Check icons.
- Pro Banner with 4 feature pills + Upgrade → $7/mo button.
- Pro modal: $7/month, 6 feature list, "Coming Soon — Join Waitlist" CTA.
- Rate-limit modal after 5 uses, routes to Pro modal.
- All `data-testid` attributes for testing.

## Backlog (P1/P2)
- Waitlist email capture (Resend / SendGrid).
- Real auto-send via Gmail OAuth.
- Payment tracking dashboard (mark invoices paid → Recovered stat).
- WhatsApp share template.
- Late fee calculator.
- Move Gemini key to backend proxy.

## Next enhancement suggestion
Why don't you wire the "Join Waitlist" button to capture emails via Resend — it'll convert free users into warm leads the moment Pro launches.
