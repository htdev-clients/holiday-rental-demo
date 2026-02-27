import { signHmac, calcTotal, sendEmail } from '../_shared/utils.js';

const TOKEN_TTL_HOURS = 24; // Must match booking.response_hours in _data/property.yml
const TOKEN_TTL_MS    = TOKEN_TTL_HOURS * 60 * 60 * 1000;

/**
 * GET /api/approve?id=<booking_id>&token=<hmac>
 * Validates the token and shows the owner a confirmation form (approve or refuse + optional message).
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  const url   = new URL(request.url);
  const id    = url.searchParams.get('id');
  const token = url.searchParams.get('token');

  if (!id || !token) return errorPage('Lien invalide.');

  const expected = await signHmac(id, env.APPROVE_SECRET);
  if (expected !== token) return errorPage('Lien invalide ou expiré.');

  const booking = await env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first();
  if (!booking) return errorPage('Réservation introuvable.');
  if (booking.status !== 'pending') {
    return errorPage(`Cette réservation a déjà été traitée (statut : ${booking.status}).`);
  }

  const createdAt = new Date(booking.created_at + 'Z');
  if (Date.now() - createdAt.getTime() > TOKEN_TTL_MS) {
    return errorPage(`Ce lien a expiré (${TOKEN_TTL_HOURS}h). Veuillez contacter le voyageur directement.`);
  }

  const nights = Math.round((new Date(booking.checkout) - new Date(booking.checkin)) / 86400000);
  const propertyName = env.PROPERTY_NAME || 'Le Refuge Sauvage';

  return new Response(actionFormHtml({ booking, nights, propertyName, id, token }), {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}

/**
 * POST /api/approve
 * Processes the owner's decision: action=approve sends a payment link, action=refuse sends a rejection email.
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return errorPage('Requête invalide.');
  }

  const id           = formData.get('id');
  const token        = formData.get('token');
  const action       = formData.get('action');
  const ownerMessage = formData.get('owner_message')?.trim() || null;

  if (!id || !token || !['approve', 'refuse'].includes(action)) return errorPage('Requête invalide.');

  const expected = await signHmac(id, env.APPROVE_SECRET);
  if (expected !== token) return errorPage('Lien invalide ou expiré.');

  const booking = await env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first();
  if (!booking) return errorPage('Réservation introuvable.');
  if (booking.status !== 'pending') {
    return errorPage(`Cette réservation a déjà été traitée (statut : ${booking.status}).`);
  }

  const createdAt = new Date(booking.created_at + 'Z');
  if (Date.now() - createdAt.getTime() > TOKEN_TTL_MS) {
    return errorPage(`Ce lien a expiré (${TOKEN_TTL_HOURS}h). Veuillez contacter le voyageur directement.`);
  }

  const nights       = Math.round((new Date(booking.checkout) - new Date(booking.checkin)) / 86400000);
  const propertyName = env.PROPERTY_NAME || 'Le Refuge Sauvage';

  if (action === 'approve') {
    const total = calcTotal(nights, parseFloat(env.PRICE_PER_NIGHT));

    let paymentUrl;
    try {
      const session = await createStripeSession({ booking, total, env, propertyName });
      paymentUrl = session.url;
    } catch (err) {
      console.error('Stripe error:', err);
      return errorPage('Erreur lors de la création du lien de paiement. Veuillez réessayer.');
    }

    // Email guest before updating status so the owner can retry if this fails
    await sendEmail(env.RESEND_API_KEY, {
      from: env.FROM_EMAIL,
      to: booking.email,
      subject: `Votre réservation est approuvée — ${propertyName}`,
      html: guestPaymentEmailHtml({ booking, nights, total, paymentUrl, propertyName, ownerMessage }),
    });

    await env.DB.prepare("UPDATE bookings SET status = 'approved' WHERE id = ?").bind(id).run();

    return new Response(successPageHtml(booking, propertyName, 'approved'), {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  } else {
    await sendEmail(env.RESEND_API_KEY, {
      from: env.FROM_EMAIL,
      to: booking.email,
      subject: `Votre demande de réservation — ${propertyName}`,
      html: guestRejectionEmailHtml({ booking, nights, propertyName, ownerMessage }),
    });

    await env.DB.prepare("UPDATE bookings SET status = 'rejected' WHERE id = ?").bind(id).run();

    return new Response(successPageHtml(booking, propertyName, 'refused'), {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  }
}

// ─── Stripe ───────────────────────────────────────────────────────────────────

async function createStripeSession({ booking, total, env, propertyName }) {
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    // URLSearchParams must be built from an array of tuples to allow duplicate keys
    // (object literals silently drop duplicate keys — bancontact would override card)
    body: new URLSearchParams([
      ['payment_method_types[]',                                     'card'],
      ['payment_method_types[]',                                     'bancontact'],
      ['line_items[0][price_data][currency]',                        'eur'],
      ['line_items[0][price_data][product_data][name]',              `${propertyName} — ${booking.checkin} au ${booking.checkout}`],
      ['line_items[0][price_data][product_data][description]',       `${booking.guests} voyageur${booking.guests > 1 ? 's' : ''} · Arrivée ${booking.checkin} · Départ ${booking.checkout}`],
      ['line_items[0][price_data][unit_amount]',                     String(Math.round(total * 100))],
      ['line_items[0][quantity]',                                    '1'],
      ['mode',                                                       'payment'],
      ['locale',                                                     'fr'],
      ['success_url',                                                `${env.SITE_URL}/reservation-confirmee`],
      ['cancel_url',                                                 `${env.SITE_URL}/#booking`],
      ['customer_email',                                             booking.email],
      ['metadata[booking_id]',                                       booking.id],
      ['metadata[property_id]',                                      booking.property_id],
      ['custom_text[submit][message]',                               'En cliquant sur Confirmer, vous acceptez les conditions générales de vente.'],
    ]),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─── Email templates ──────────────────────────────────────────────────────────

function guestPaymentEmailHtml({ booking, nights, total, paymentUrl, propertyName, ownerMessage }) {
  return `
<h2 style="color:#2C2520">Votre réservation est approuvée !</h2>
<p style="font-family:sans-serif">Bonjour ${booking.firstname},</p>
<p style="font-family:sans-serif">Le propriétaire de ${propertyName} a approuvé votre demande de réservation.</p>
${ownerMessage ? `<p style="font-family:sans-serif;background:#f9f6f0;padding:14px 18px;border-left:3px solid #D6A87C;margin:16px 0;font-style:italic">${escapeHtml(ownerMessage)}</p>` : ''}
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
  <tr><td style="padding:6px 16px 6px 0;color:#888">Arrivée</td><td style="padding:6px 0">${booking.checkin}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Départ</td><td style="padding:6px 0">${booking.checkout}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Durée</td><td style="padding:6px 0">${nights} nuit${nights > 1 ? 's' : ''}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Voyageurs</td><td style="padding:6px 0">${booking.guests}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Total</td><td style="padding:6px 0"><strong>${total.toLocaleString('fr-BE')} €</strong></td></tr>
</table>
<p style="margin-top:24px">
  <a href="${paymentUrl}" style="background:#D6A87C;color:#fff;padding:14px 28px;text-decoration:none;font-weight:bold;font-family:sans-serif;display:inline-block">
    Payer maintenant
  </a>
</p>
<p style="color:#999;font-size:12px;font-family:sans-serif">Ce lien de paiement est valable 24h.</p>
`;
}

function guestRejectionEmailHtml({ booking, nights, propertyName, ownerMessage }) {
  return `
<h2 style="color:#2C2520">Votre demande de réservation</h2>
<p style="font-family:sans-serif">Bonjour ${booking.firstname},</p>
<p style="font-family:sans-serif">Après examen de votre demande, le propriétaire de ${propertyName} n'est malheureusement pas en mesure d'accepter votre séjour pour les dates suivantes :</p>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
  <tr><td style="padding:6px 16px 6px 0;color:#888">Arrivée</td><td style="padding:6px 0">${booking.checkin}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Départ</td><td style="padding:6px 0">${booking.checkout}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Durée</td><td style="padding:6px 0">${nights} nuit${nights > 1 ? 's' : ''}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Voyageurs</td><td style="padding:6px 0">${booking.guests}</td></tr>
</table>
${ownerMessage ? `<p style="font-family:sans-serif;background:#f9f6f0;padding:14px 18px;border-left:3px solid #D6A87C;margin:16px 0;font-style:italic">${escapeHtml(ownerMessage)}</p>` : ''}
<p style="font-family:sans-serif;color:#666">N'hésitez pas à consulter d'autres disponibilités sur notre site.</p>
`;
}

// ─── Pages ────────────────────────────────────────────────────────────────────

/** Shared HTML shell using the site design system (earth/clay/leaf/paper palette, Cormorant + Montserrat). */
function pageShell({ title, propertyName, body, footerNote = '' }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} — ${escapeHtml(propertyName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Montserrat:wght@400;500;600&display=swap">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body    { font-family: 'Montserrat', sans-serif; background: #F2F0E9; color: #2C2520; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px 16px; }
    .card   { background: #FAF8F3; border: 1px solid #E5E2D9; width: 100%; max-width: 560px; padding: 40px; }
    .brand  { font-family: 'Cormorant Garamond', serif; font-size: 0.85rem; letter-spacing: 0.12em; text-transform: uppercase; color: #D6A87C; margin-bottom: 28px; }
    h1      { font-family: 'Cormorant Garamond', serif; font-size: 1.75rem; font-weight: 600; margin-bottom: 6px; line-height: 1.2; }
    .sub    { font-size: 0.8rem; color: #999; margin-bottom: 28px; line-height: 1.5; }
    table   { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px; }
    td      { padding: 8px 0; border-bottom: 1px solid #E5E2D9; }
    td:first-child { color: #999; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; width: 38%; }
    .guest-msg { background: #F2F0E9; border-left: 3px solid #D6A87C; padding: 12px 16px; font-size: 13px; color: #555; margin-bottom: 24px; font-style: italic; }
    label   { display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: #888; margin-bottom: 8px; }
    .opt    { font-weight: 400; text-transform: none; letter-spacing: 0; }
    textarea { width: 100%; border: 1px solid #E5E2D9; background: #fff; padding: 12px; font-size: 13px; font-family: 'Montserrat', sans-serif; color: #2C2520; resize: vertical; line-height: 1.5; }
    textarea:focus { outline: 2px solid #D6A87C; outline-offset: 0; border-color: #D6A87C; }
    .actions { display: flex; gap: 12px; margin-top: 20px; }
    button  { flex: 1; padding: 14px 20px; font-size: 11px; font-weight: 600; font-family: 'Montserrat', sans-serif; text-transform: uppercase; letter-spacing: 0.07em; border: none; cursor: pointer; transition: opacity 0.15s; }
    button:hover { opacity: 0.82; }
    .btn-approve { background: #4A5D44; color: #fff; }
    .btn-refuse  { background: #E5E2D9; color: #2C2520; }
    .note   { font-size: 11px; color: #bbb; text-align: center; margin-top: 20px; }
    .warning { background: #FEF3C7; border-left: 4px solid #D97706; padding: 12px 16px; font-size: 13px; color: #92400E; margin-bottom: 20px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">${escapeHtml(propertyName)}</div>
    ${body}
  </div>
  ${footerNote ? `<p class="note">${footerNote}</p>` : ''}
</body>
</html>`;
}

function actionFormHtml({ booking, nights, propertyName, id, token }) {
  const body = `
    <h1>Demande de réservation</h1>
    <p class="sub">Répondez à cette demande — un email sera envoyé automatiquement au voyageur.</p>
    <table>
      <tr><td>Voyageur</td><td><strong>${escapeHtml(booking.firstname)} ${escapeHtml(booking.lastname)}</strong></td></tr>
      <tr><td>Email</td><td>${escapeHtml(booking.email)}</td></tr>
      <tr><td>Arrivée</td><td>${booking.checkin}</td></tr>
      <tr><td>Départ</td><td>${booking.checkout}</td></tr>
      <tr><td>Durée</td><td>${nights} nuit${nights > 1 ? 's' : ''}</td></tr>
      <tr><td>Voyageurs</td><td>${booking.guests}</td></tr>
    </table>
    ${booking.message ? `<div class="guest-msg">${escapeHtml(booking.message)}</div>` : ''}
    <div class="warning"><strong>⚠ Avant d'approuver :</strong> bloquez ces dates dans votre calendrier Airbnb pour éviter une double réservation.</div>
    <form method="POST" action="/api/approve">
      <input type="hidden" name="id" value="${escapeHtml(id)}">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <label for="owner_message">Message pour le voyageur <span class="opt">(optionnel)</span></label>
      <textarea id="owner_message" name="owner_message" rows="4" placeholder="Instructions d'arrivée, informations complémentaires..."></textarea>
      <div class="actions">
        <button type="submit" name="action" value="approve" class="btn-approve">✓ Approuver</button>
        <button type="submit" name="action" value="refuse" class="btn-refuse">✗ Refuser</button>
      </div>
    </form>`;
  return pageShell({ title: 'Demande de réservation', propertyName, body, footerNote: 'Lien sécurisé · valable 24h' });
}

function successPageHtml(booking, propertyName, result) {
  const approved = result === 'approved';
  const icon     = approved ? '✓' : '—';
  const heading  = approved ? 'Réservation approuvée' : 'Demande refusée';
  const detail   = approved
    ? `Un lien de paiement a été envoyé à <strong>${escapeHtml(booking.email)}</strong>.`
    : `Un email de refus a été envoyé à <strong>${escapeHtml(booking.email)}</strong>.`;
  const body = `
    <h1 style="color:${approved ? '#4A5D44' : '#888'}">${icon} ${heading}</h1>
    <p class="sub" style="margin-top:12px">${detail}</p>
    <table style="margin-top:8px">
      <tr><td>Voyageur</td><td>${escapeHtml(booking.firstname)} ${escapeHtml(booking.lastname)}</td></tr>
      <tr><td>Dates</td><td>${booking.checkin} → ${booking.checkout}</td></tr>
    </table>`;
  return pageShell({ title: heading, propertyName, body });
}

function errorPage(message) {
  const body = `
    <h1 style="color:#c0392b">Une erreur est survenue</h1>
    <p class="sub" style="margin-top:12px">${escapeHtml(message)}</p>`;
  return new Response(
    pageShell({ title: 'Erreur', propertyName: 'Le Refuge Sauvage', body }),
    { status: 400, headers: { 'Content-Type': 'text/html;charset=UTF-8' } }
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
