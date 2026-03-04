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
| Payments | Bank transfer (IBAN) — no payment gateway |
| Calendar sync | Airbnb iCal feed |

---

## Project Status

| Phase | Description | Status |
|---|---|---|
| 1 | Static HTML rework — all sections, visual design | ✅ Done |
| 2 | Jekyll structure — `_data`, `_layouts`, `_includes` | ✅ Done |
| 3 | Cloudflare Pages Functions + D1 database (booking inquiry backend) | ✅ Done |
| 4 | iCal calendar integration (Airbnb availability sync) | ✅ Done |
| 5 | Bank transfer payment flow (no payment gateway) | ✅ Done |

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
│       ├── approve.js       # GET/POST /api/approve — validate token, email guest bank details
│       └── confirm.js       # GET/POST /api/confirm — owner confirms payment receipt, confirm emails
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

### Prerequisites
- **Node.js** (any recent LTS — v20 or v22 recommended; v25 works with the flag below)
- **Ruby** + **Bundler** (`gem install bundler`)

### First-time setup

```bash
# Install Ruby gems (Jekyll, plugins)
bundle install

# Install Node.js packages — use --ignore-scripts to skip native binary builds
# (avoids a sharp/node-gyp compilation error on newer Node versions)
npm install --ignore-scripts
```

> **Note:** Never use `npm ci` locally — it wipes `node_modules` and may fail on `sharp`
> (a transitive Wrangler dependency that requires native compilation). Always use `npm install --ignore-scripts`.

### Daily development workflow

```bash
# 1. Build Tailwind CSS (required once before serving, and after any template change)
npm run build:css

# 2a. Frontend only — Jekyll dev server with live reload (no backend)
bundle exec jekyll serve --livereload
# → http://localhost:4000

# 2b. Full stack — Jekyll build + Wrangler Pages dev (backend functions + D1)
npm run build:css && bundle exec jekyll build
npx wrangler pages dev _site
# → http://localhost:8788
# Requires .dev.vars (copy from .dev.vars.example and fill in secrets)
```

### Watching CSS changes

Open two terminal tabs:
```bash
# Tab 1: auto-rebuild CSS on every template save
npm run watch:css

# Tab 2: Jekyll dev server
bundle exec jekyll serve --livereload
```

### Production build (mirrors Cloudflare Pages CI)

```bash
npm ci && npm run build:css && bundle exec jekyll build
# If npm ci fails on sharp, use: npm install --ignore-scripts && npm run build:css && bundle exec jekyll build
```

---

## Editing Content

All content is in **`_data/property.yml`** — no HTML editing needed for:

- Property name, tagline, description
- Capacity (guests, bedrooms, m², land)
- Pricing (per night)
- Address and contact details
- Social media links
- Belgian compliance info (registration number)
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
| `POST /api/approve` | `functions/api/approve.js` | Process approve/refuse decision, email guest bank details |
| `GET /api/confirm` | `functions/api/confirm.js` | Verify HMAC token, show owner payment confirmation form |
| `POST /api/confirm` | `functions/api/confirm.js` | Mark booking paid, send confirmation emails to guest and owner |
| `GET /api/admin/bookings` | `functions/api/admin/bookings.js` | Owner dashboard — list all bookings; token = HMAC("admin-bookings", APPROVE_SECRET) — generate with `npm run admin-url` |

### Infrastructure (already provisioned)

- **D1 database:** `holiday-rentals-db` (id: `febe74a2-262a-41ef-a6a5-446ae0d488f8`) — shared across all client projects, multi-tenant via `property_id`
- **Email:** Resend API — `FROM_EMAIL=onboarding@resend.dev` until client domain verified
- **Secrets:** managed via `secrets.json` (gitignored) → `npm run deploy:secrets`
- **D1 binding:** set in Cloudflare Pages dashboard → Settings → Bindings → variable name `DB`

### Per-project setup (new client)

1. Duplicate this repo
2. Update `wrangler.toml`: `PROPERTY_ID`, `PROPERTY_NAME`, `OWNER_EMAIL`, `FROM_EMAIL`, `SITE_URL`, `ICAL_URL` (from Airbnb export), `PRICE_PER_NIGHT`, `RESPONSE_HOURS`, `MAX_GUESTS`, `OWNER_IBAN`
3. Copy `.dev.vars.example` → `.dev.vars`, fill in secrets
4. Create `secrets.json` with secret values, run `npm run deploy:secrets`
5. In Cloudflare Pages dashboard, bind D1 database (`DB` → `holiday-rentals-db`)

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
| `SITE_URL` | `wrangler.toml` | Base URL for approve and confirm links |
| `OWNER_IBAN` | `wrangler.toml` | Owner's IBAN — displayed in the payment email sent to guests |
| `RESEND_API_KEY` | `secrets.json` | Resend transactional email API key |
| `APPROVE_SECRET` | `secrets.json` | Long random string — signs owner approval and confirm links (HMAC-SHA256) |

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

Full booking → approval → bank transfer → confirmation flow is working end-to-end. No payment gateway required.

**Flow:**
1. Guest submits booking form → owner receives approval email with HMAC-signed link
2. Owner approves → guest receives bank transfer instructions (IBAN + payment reference + total)
3. Guest pays by bank transfer
4. Owner sees payment on their account → clicks "Confirm payment received" link from the approval confirmation page
5. Booking marked `paid` in D1 → confirmation emails sent to guest and owner

**Payment reference** is auto-generated per booking: `RSV-{BOOKING_ID_PREFIX}` — unique and traceable.

### Per-project setup
- Set `OWNER_IBAN` in `wrangler.toml`
- No webhook, no Stripe account needed

### Resend sandbox limitation
`FROM_EMAIL=onboarding@resend.dev` can only deliver to the Resend account's own verified email.
For production: verify the client's domain in Resend and update `FROM_EMAIL` in `wrangler.toml`.

---

## Belgian Compliance Checklist

- [x] Walloon registration number displayed (N° ETA-XXXX-XXXX)
- [x] CGV checkbox on booking form (mandatory)
- [x] Politique de confidentialité link
- [x] CGV page (`cgv.md` → `/cgv/`)
- [x] Politique de confidentialité page (`confidentialite.md` → `/confidentialite/`)
- [x] Cookies page + GDPR consent banner (`cookies.md` → `/cookies/`)
- [x] GDPR: no sensitive financial data stored in D1 ✓ (bank details sent by email only, not stored)
