# Le Refuge Sauvage — Holiday Rental Website

Demo website for a Belgian chalet rental property (Ardennes). Built as a client demonstration for a "semi-direct booking" strategy — guests discover the property online and book directly, bypassing Airbnb fees.

---

## Tech Stack

| Layer | Choice |
|---|---|
| SSG | Jekyll ~4.3 |
| Styling | Tailwind CSS (CDN) |
| Icons | Lucide Icons (CDN) |
| Hosting | Cloudflare Pages |
| Backend functions | Cloudflare Pages Functions |
| Database | Cloudflare D1 (SQLite, multi-tenant) |
| Payments | Stripe Checkout + Stripe Connect (or Mollie) |
| Calendar sync | Airbnb iCal feed |

---

## Project Status

| Phase | Description | Status |
|---|---|---|
| 1 | Static HTML rework — all sections, visual design | ✅ Done |
| 2 | Jekyll structure — `_data`, `_layouts`, `_includes` | ✅ Done |
| 3 | Cloudflare Pages Functions + D1 database (booking inquiry backend) | ✅ Done |
| 4 | iCal calendar integration (Airbnb availability sync) | ✅ Done |
| 5 | Stripe/Mollie payment flow + webhooks | ✅ Done |

---

## File Structure

```
holiday-rental-template/
├── _config.yml              # Jekyll config (site URL, build settings)
├── _data/
│   └── property.yml         # ← ALL content lives here. Edit to update the site.
├── _layouts/
│   └── default.html         # HTML shell: <!DOCTYPE>, <html>, <body>
├── _includes/
│   ├── head.html            # <head>: meta, fonts, Tailwind config, custom CSS
│   ├── nav.html             # Fixed nav + mobile menu overlay
│   ├── hero.html            # Full-screen hero section
│   ├── booking.html         # Booking inquiry form + success state
│   ├── footer.html          # Footer: address, contact, social, legal links
│   └── scripts.html         # All JavaScript (mobile menu, calendar, form, gallery)
├── functions/
│   ├── _shared/
│   │   └── utils.js         # Shared helpers: signHmac, sendEmail, calcTotal, jsonError, escapeHtml
│   └── api/
│       ├── booking.js       # POST /api/booking — save to D1, email owner
│       ├── approve.js       # GET  /api/approve — validate token, Stripe session, email guest
│       └── webhook/
│           └── stripe.js    # POST /api/webhook/stripe — verify sig, update D1, confirm emails
├── index.html               # Page: front matter + include calls
├── cgv.md                   # CGV legal page
├── confidentialite.md       # Privacy policy page
├── cookies.md               # Cookie policy page
├── wrangler.toml            # Cloudflare config: non-secret vars + D1 binding
├── schema.sql               # D1 migration — run once per account
├── .dev.vars.example        # Template for local secrets (copy to .dev.vars)
├── package.json             # wrangler dev dependency + deploy:secrets script
├── Gemfile / Gemfile.lock   # Ruby dependencies (Gemfile.lock committed intentionally)
├── .gitignore
└── instructions.txt         # Original client brief (reference only)
```

---

## Running Locally

```bash
# Install Ruby dependencies
bundle install

# Serve with live reload
bundle exec jekyll serve --livereload

# Build for production
bundle exec jekyll build
# Output → _site/
```

---

## Editing Content

All content is in **`_data/property.yml`** — no HTML editing needed for:

- Property name, tagline, description
- Capacity (guests, bedrooms, m², land)
- Pricing (per night)
- Address and contact details
- Social media links
- Belgian compliance info (registration number, insurance)
- Concept section text and images
- Amenities list
- Gallery images
- Testimonials

---

## Design System

**Color palette:**

| Token | Hex | Usage |
|---|---|---|
| `earth` | `#2C2520` | Dark brown — text, backgrounds |
| `clay` | `#D6A87C` | Terracotta — accents, CTAs |
| `leaf` | `#4A5D44` | Forest green — testimonial bg, feature text |
| `paper` | `#F2F0E9` | Off-white — page background |
| `stone` | `#E5E2D9` | Beige — alternate section background |
| `cream` | `#FAF8F3` | Near-white — form background |

**Fonts:**
- Headings: Cormorant Garamond (serif, elegant)
- Body: Montserrat (sans-serif, clean)

---

## Cloudflare Pages — Deployment

| Setting | Value |
|---|---|
| Framework preset | Jekyll |
| Build command | `bundle exec jekyll build` |
| Build output directory | `_site` |
| Environment variable | `RUBY_VERSION=3.4.4` |

`Gemfile.lock` is committed intentionally — Cloudflare Pages uses it to pin gem versions and ensure reproducible builds. Do not add it back to `.gitignore`.

---

## Phase 3 — Cloudflare Backend ✅

### What's built

| Endpoint | File | Purpose |
|---|---|---|
| `POST /api/booking` | `functions/api/booking.js` | Validate form, save to D1, email owner approval link |
| `GET /api/approve` | `functions/api/approve.js` | Verify HMAC token, show owner action form |
| `POST /api/approve` | `functions/api/approve.js` | Process approve/refuse decision, create Stripe session, email guest |
| `POST /api/webhook/stripe` | `functions/api/webhook/stripe.js` | Verify signature, mark booking paid, send confirmation emails |
| `GET /api/admin/bookings` | `functions/api/admin/bookings.js` | Owner dashboard — list all bookings; token = HMAC("admin-bookings", APPROVE_SECRET) — generate with `npm run admin-url` |

### Infrastructure (already provisioned)

- **D1 database:** `holiday-rentals-db` (id: `febe74a2-262a-41ef-a6a5-446ae0d488f8`) — shared across all client projects, multi-tenant via `property_id`
- **Email:** Resend API — `FROM_EMAIL=onboarding@resend.dev` until client domain verified
- **Secrets:** managed via `secrets.json` (gitignored) → `npm run deploy:secrets`
- **D1 binding:** set in Cloudflare Pages dashboard → Settings → Bindings → variable name `DB`

### Per-project setup (new client)

1. Duplicate this repo
2. Update `wrangler.toml`: `PROPERTY_ID`, `PROPERTY_NAME`, `OWNER_EMAIL`, `FROM_EMAIL`, `SITE_URL`, `ICAL_URL` (from Airbnb export), `PRICE_PER_NIGHT`, `RESPONSE_HOURS`, `MAX_GUESTS`
3. Copy `.dev.vars.example` → `.dev.vars`, fill in secrets
4. Create `secrets.json` with secret values, run `npm run deploy:secrets`
5. In Cloudflare Pages dashboard, bind D1 database (`DB` → `holiday-rentals-db`)
6. Register Stripe webhook URL (see Phase 5)

### Local development

```bash
bundle exec jekyll build        # build static site first
npm run dev                     # wrangler pages dev on :8788
```

### Environment variables

| Variable | Where | Notes |
|---|---|---|
| `PROPERTY_ID` | `wrangler.toml` | Unique key per client (e.g. `refuge-sauvage-001`) |
| `PROPERTY_NAME` | `wrangler.toml` | Property display name — used in all transactional emails |
| `OWNER_EMAIL` | `wrangler.toml` | Property owner's inbox for booking notifications |
| `FROM_EMAIL` | `wrangler.toml` | Sender address — `onboarding@resend.dev` until domain verified |
| `ICAL_URL` | `wrangler.toml` | Airbnb iCal export URL — Airbnb › Listing › Availability › Export Calendar |
| `PRICE_PER_NIGHT` | `wrangler.toml` | Nightly rate — used server-side to calculate Stripe amount |
| `RESPONSE_HOURS` | `wrangler.toml` | Hours owner has to respond — must match `booking.response_hours` in `property.yml` |
| `MAX_GUESTS` | `wrangler.toml` | Max guests allowed — must match `capacity.guests` in `property.yml` |
| `SITE_URL` | `wrangler.toml` | Base URL for approve links and Stripe redirects |
| `RESEND_API_KEY` | `secrets.json` | Resend transactional email API key |
| `STRIPE_SECRET_KEY` | `secrets.json` | `sk_test_...` for dev, `sk_live_...` for production |
| `STRIPE_WEBHOOK_SECRET` | `secrets.json` | From Stripe dashboard after registering webhook URL |
| `APPROVE_SECRET` | `secrets.json` | Long random string — signs owner approval links (HMAC-SHA256) |

---

## Phase 4 — iCal Calendar Integration ✅

### What's built

| Endpoint | File | Purpose |
|---|---|---|
| `GET /api/availability` | `functions/api/availability.js` | Fetch + parse Airbnb iCal feed, return `{ booked: ['YYYY-MM-DD', …] }` |

- `ICAL_URL` env var read from `wrangler.toml` — returns `[]` gracefully when not set
- Frontend calendar fetches `/api/availability` on load; renders immediately (empty), updates once API responds
- 1-hour `Cache-Control` to avoid hammering the iCal feed on every page visit
- iCal parser handles both `DATE` and `DATE-TIME` formats; DTEND treated as exclusive (checkout day)

### Per-project setup (new client)
Set `ICAL_URL` in `wrangler.toml` — get URL from Airbnb › Listing › Availability › Export Calendar.

---

## Phase 5 — Payment Flow ✅

Full booking → approval → payment → confirmation flow is working end-to-end in test mode.

- Stripe Checkout session created in `approve.js` (card + Bancontact)
- Webhook registered in Stripe Workbench: event `checkout.session.completed`
- `STRIPE_WEBHOOK_SECRET` deployed via `npm run deploy:secrets`
- `/reservation-confirmee` success page added (Jekyll, design-system styled)
- **Stripe Connect** for platform fee: collect X% on each transaction (future — Phase 6)

### Per-project setup reminder
- Register webhook in Stripe Workbench → Destinations: `https://<site>.pages.dev/api/webhook/stripe`
- Event: `checkout.session.completed` → Your account only
- Copy `whsec_...` signing secret → `secrets.json` → `npm run deploy:secrets`

### Resend sandbox limitation
`FROM_EMAIL=onboarding@resend.dev` can only deliver to the Resend account's own verified email.
For production: verify the client's domain in Resend and update `FROM_EMAIL` in `wrangler.toml`.

---

## Belgian Compliance Checklist

- [x] Walloon registration number displayed (N° ETA-XXXX-XXXX)
- [x] Insurance info displayed (Lodge Protect / abandon de recours)
- [x] CGV checkbox on booking form (mandatory)
- [x] Politique de confidentialité link
- [x] CGV page (`cgv.md` → `/cgv/`)
- [x] Politique de confidentialité page (`confidentialite.md` → `/confidentialite/`)
- [x] Cookies page + GDPR consent banner (`cookies.md` → `/cookies/`)
- [ ] GDPR: no sensitive financial data stored in D1 ✓ (handled by Stripe)
