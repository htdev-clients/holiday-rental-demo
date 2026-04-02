# Le Refuge Sauvage — Holiday Rental Demo Website

**Live demo:** [holiday-rental-demo.pages.dev](https://holiday-rental-demo.pages.dev)

---

## Overview

This is a demo website built to showcase a **semi-direct booking solution** for holiday rental owners. The concept: instead of relying solely on Airbnb, owners get their own branded website where guests can discover the property and book directly — cutting out platform fees and building a direct relationship with their guests.

This demo simulates a Belgian chalet rental in the Ardennes. It is part of a wider product that includes a [reusable template](https://github.com/htdev-clients/holiday-rental-template) designed to be quickly deployed for any holiday rental client.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Static site generator | Jekyll ~4.3 |
| Styling | Tailwind CSS (CLI build) |
| JavaScript | Vanilla JS (no frameworks) |
| Hosting | Cloudflare Pages |
| Backend | Cloudflare Pages Functions (edge) |
| Database | Cloudflare D1 (SQLite, multi-tenant) |
| Transactional email | Resend |
| Payments | Stripe Checkout (card + Bancontact) |
| Availability sync | Airbnb iCal feed |

---

## Features

**Property presentation**
- Full-screen hero, amenities section, photo gallery, testimonials
- Mobile-first responsive design
- All content (name, description, pricing, photos, amenities, etc.) managed from a single YAML file — no HTML editing needed

**Booking flow**
- Guest submits an inquiry form with travel dates and guest count
- Owner receives an email with a secure approve / refuse link
- On approval, a **Stripe Checkout session** is created and the payment link is sent to the guest (credit card + Bancontact supported)
- On successful payment, a Stripe webhook confirms the booking and triggers confirmation emails to both guest and owner

**Availability calendar**
- Fetches the property's Airbnb iCal feed in real time
- Blocked dates are displayed directly in the booking calendar, keeping availability in sync automatically

**Owner tools**
- Secure admin dashboard listing all bookings and their status
- Approval links are HMAC-signed to prevent forgery

**Legal compliance (Belgian market)**
- General terms & conditions (CGV) with mandatory checkbox on booking form
- Privacy policy and cookie policy pages
- GDPR cookie consent banner
- Walloon tourism registration number display

---

## Related

This demo is built on the same codebase as the client-ready template:
👉 [holiday-rental-template](https://github.com/htdev-clients/holiday-rental-template) — the version without demo content, ready to deploy for a real property.
