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
      ['payment_method_types[]',                         'card'],
      ['payment_method_types[]',                         'bancontact'],
      ['line_items[0][price_data][currency]',            'eur'],
      ['line_items[0][price_data][product_data][name]',  `${propertyName} — ${booking.checkin} au ${booking.checkout}`],
      ['line_items[0][price_data][unit_amount]',         String(Math.round(total * 100))],
      ['line_items[0][quantity]',                        '1'],
      ['mode',                                           'payment'],
      ['success_url',                                    `${env.SITE_URL}/reservation-confirmee`],
      ['cancel_url',                                     `${env.SITE_URL}/#booking`],
      ['customer_email',                                 booking.email],
      ['metadata[booking_id]',                           booking.id],
      ['metadata[property_id]',                          booking.property_id],
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

function actionFormHtml({ booking, nights, propertyName, id, token }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Répondre à la demande — ${propertyName}</title>
  <style>
    body      { font-family: sans-serif; max-width: 560px; margin: 60px auto; padding: 0 24px; color: #2C2520; }
    h1        { font-size: 1.4rem; margin-bottom: 4px; }
    .sub      { color: #888; font-size: 0.9rem; margin-bottom: 28px; }
    table     { border-collapse: collapse; font-size: 14px; margin-bottom: 28px; width: 100%; }
    td        { padding: 6px 16px 6px 0; }
    td:first-child { color: #888; white-space: nowrap; }
    .guest-msg { background: #f9f6f0; padding: 10px 14px; border-left: 3px solid #D6A87C; font-size: 14px; margin-bottom: 28px; }
    label     { display: block; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
    .opt      { font-weight: normal; color: #999; }
    textarea  { width: 100%; box-sizing: border-box; border: 1px solid #ddd; padding: 10px; font-size: 14px; font-family: sans-serif; resize: vertical; }
    .actions  { display: flex; gap: 12px; margin-top: 20px; }
    button    { flex: 1; padding: 14px 20px; font-size: 14px; font-weight: bold; font-family: sans-serif; border: none; cursor: pointer; }
    .btn-approve { background: #4A5D44; color: #fff; }
    .btn-approve:hover { background: #3a4c35; }
    .btn-refuse  { background: #f0f0f0; color: #555; border: 1px solid #ccc; }
    .btn-refuse:hover  { background: #e0e0e0; }
  </style>
</head>
<body>
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
  <form method="POST" action="/api/approve">
    <input type="hidden" name="id" value="${escapeHtml(id)}">
    <input type="hidden" name="token" value="${escapeHtml(token)}">
    <label for="owner_message">Message pour le voyageur <span class="opt">(optionnel)</span></label>
    <textarea id="owner_message" name="owner_message" rows="4" placeholder="Instructions d'arrivée, informations complémentaires..."></textarea>
    <div class="actions">
      <button type="submit" name="action" value="approve" class="btn-approve">✓ Approuver</button>
      <button type="submit" name="action" value="refuse" class="btn-refuse">✗ Refuser</button>
    </div>
  </form>
</body>
</html>`;
}

function successPageHtml(booking, propertyName, result) {
  const approved = result === 'approved';
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${approved ? 'Réservation approuvée' : 'Demande refusée'} — ${propertyName}</title>
  <style>
    body { font-family: sans-serif; max-width: 480px; margin: 80px auto; padding: 0 24px; text-align: center; color: #2C2520; }
    h1   { color: ${approved ? '#4A5D44' : '#888'}; font-size: 1.5rem; }
    p    { color: #666; line-height: 1.6; }
  </style>
</head>
<body>
  <h1>${approved ? '✓ Réservation approuvée' : '✓ Demande refusée'}</h1>
  <p>${approved
    ? `Un lien de paiement a été envoyé à <strong>${escapeHtml(booking.email)}</strong>.`
    : `Un email de refus a été envoyé à <strong>${escapeHtml(booking.email)}</strong>.`
  }</p>
  <p>${escapeHtml(booking.firstname)} ${escapeHtml(booking.lastname)}<br>${booking.checkin} → ${booking.checkout}</p>
</body>
</html>`;
}

function errorPage(message) {
  return new Response(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Erreur</title>
  <style>body{font-family:sans-serif;max-width:480px;margin:80px auto;padding:0 24px;text-align:center;color:#2C2520}h1{color:#c0392b}</style>
</head>
<body>
  <h1>Erreur</h1>
  <p>${message}</p>
</body>
</html>`, { status: 400, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
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
