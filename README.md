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
| 3 | Cloudflare Pages Functions + D1 database (booking inquiry backend) | 🔜 Next |
| 4 | iCal calendar integration (Airbnb availability sync) | 🔜 Pending |
| 5 | Stripe/Mollie payment flow + webhooks | 🔜 Pending |

---

## File Structure

```
test-website/
├── _config.yml              # Jekyll config (site URL, build settings)
├── _data/
│   └── property.yml         # ← ALL content lives here. Edit to update the site.
├── _layouts/
│   └── default.html         # HTML shell: <!DOCTYPE>, <html>, <body>
├── _includes/
│   ├── head.html            # <head>: meta, fonts, Tailwind config, custom CSS
│   ├── nav.html             # Fixed nav + mobile menu overlay
│   ├── hero.html            # Full-screen hero section
│   ├── stats.html           # Key numbers band (guests, bedrooms, m², land)
│   ├── concept.html         # 2-column concept sections (Liquid loop)
│   ├── testimonial.html     # Testimonial with SVG wave dividers
│   ├── amenities.html       # Amenity badges grid (Liquid loop)
│   ├── gallery.html         # Horizontal scroll gallery (Liquid loop)
│   ├── calendar.html        # Availability calendar HTML shell
│   ├── booking.html         # Booking inquiry form + success state
│   ├── compliance.html      # Belgian registration / insurance / payment band
│   ├── footer.html          # Footer: address, contact, social, legal links
│   └── scripts.html         # All JavaScript (mobile menu, calendar, form, gallery)
├── index.html               # 12-line page: front matter + includes
├── Gemfile
├── .gitignore
├── example.html             # Original site (reference only)
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
- Pricing (per night, weekend, weekly)
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

## Phase 3 — Cloudflare Backend (Next)

### What needs building

**1. D1 Database schema**
```sql
CREATE TABLE bookings (
  id          TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,        -- multi-tenant key
  status      TEXT DEFAULT 'pending', -- pending | approved | paid | cancelled
  checkin     TEXT NOT NULL,
  checkout    TEXT NOT NULL,
  guests      INTEGER NOT NULL,
  firstname   TEXT NOT NULL,
  lastname    TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  message     TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);
```

**2. Pages Function: `POST /api/booking`**
- Validates form data
- Inserts row into D1 with `property_id` and `status = 'pending'`
- Sends owner an email notification with an "Approve" link
- Returns JSON success/error

**3. Pages Function: `GET /api/approve?token=...`**
- Owner clicks link from email
- Updates booking status to `approved`
- Triggers Stripe Checkout Session creation
- Emails guest the payment link

**4. Pages Function: `POST /api/webhook/stripe`**
- Verifies Stripe webhook signature
- On `checkout.session.completed`: updates status to `paid`
- Sends confirmation email to both owner and guest

### Environment variables needed (`.dev.vars` for local, Cloudflare dashboard for prod)
```
PROPERTY_ID=refuge-sauvage-001
OWNER_EMAIL=bonjour@refugesauvage.be
RESEND_API_KEY=...          # or Mailgun / SendGrid
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_CONNECT_ACCOUNT=...  # for platform fee routing
D1_DATABASE_ID=...
APPROVE_SECRET=...          # HMAC secret for approval link token
```

---

## Phase 4 — iCal Calendar Integration

### Approach
- Airbnb iCal URL stored as environment variable `ICAL_URL`
- Cloudflare Pages Function `GET /api/availability` fetches + parses the feed
- Returns JSON array of booked date ranges
- Frontend calendar replaces hardcoded `BOOKED_DATES` set with API call
- Cache with `Cache-Control` or KV store (TTL ~1h) to avoid hammering iCal

### TODO in `_includes/scripts.html`
Replace the `BOOKED_DATES` placeholder block with:
```js
const res = await fetch('/api/availability');
const { booked } = await res.json();
const BOOKED_DATES = new Set(booked); // array of 'YYYY-MM-DD' strings
```

---

## Phase 5 — Payment Flow

- **Stripe Checkout** for payment page (hosted by Stripe)
- **Stripe Connect** for platform fee: collect X% on each transaction
- **Bancontact** payment method enabled in Stripe dashboard (required for Belgium)
- Webhook updates D1 booking status on successful payment

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
