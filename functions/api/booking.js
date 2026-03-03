import { signHmac, sendEmail, jsonError, escapeHtml } from '../_shared/utils.js';
import { t as emailT } from '../_shared/email-translations.js';

/**
 * POST /api/booking
 * Accepts booking form data, inserts a pending booking into D1,
 * and emails the owner an approval link.
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  // Parse body
  let data;
  try {
    data = await request.json();
  } catch {
    return jsonError('Corps de requête invalide.', 400);
  }

  const { checkin, checkout, guests, firstname, lastname, email, cgv } = data;

  // Validate required fields
  if (!checkin || !checkout || !guests || !firstname || !lastname || !email || !cgv) {
    return jsonError('Champs obligatoires manquants.', 400);
  }

  // Validate dates
  const ci    = new Date(checkin);
  const co    = new Date(checkout);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (isNaN(ci) || isNaN(co) || ci < today || co <= ci) {
    return jsonError('Dates invalides.', 400);
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError('Adresse email invalide.', 400);
  }

  // Validate guests count
  const guestsInt = parseInt(guests, 10);
  const maxGuests = parseInt(env.MAX_GUESTS, 10) || 20;
  if (!Number.isInteger(guestsInt) || guestsInt < 1 || guestsInt > maxGuests) {
    return jsonError('Nombre de voyageurs invalide.', 400);
  }

  // Sanitise and validate lang — only accept known values
  const lang = data.lang === 'en' ? 'en' : 'fr';

  // Rate limiting: max 3 pending bookings per email in the last 24 hours
  const recentCount = await env.DB
    .prepare(`SELECT COUNT(*) AS n FROM bookings
              WHERE email = ? AND property_id = ?
              AND created_at > datetime('now', '-24 hours')`)
    .bind(email.trim().toLowerCase(), env.PROPERTY_ID)
    .first('n');
  if (recentCount >= 3) {
    return jsonError('Trop de demandes. Veuillez réessayer dans 24h.', 429);
  }

  const propertyName = env.PROPERTY_NAME || '[Nom du bien]';
  const ttlHours = parseInt(env.RESPONSE_HOURS, 10) || 24;
  const nights = Math.round((co - ci) / 86400000);
  const id     = crypto.randomUUID();
  const token  = await signHmac(id, env.APPROVE_SECRET);

  // Insert into D1
  try {
    await env.DB.prepare(`
      INSERT INTO bookings
        (id, property_id, status, checkin, checkout, guests, firstname, lastname, email, phone, message, lang)
      VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      id, env.PROPERTY_ID,
      checkin, checkout, guestsInt,
      firstname.trim(), lastname.trim(), email.trim(),
      data.phone?.trim() || null,
      data.message?.trim() || null,
      lang
    )
    .run();
  } catch (err) {
    console.error('D1 insert error:', err);
    return jsonError('Erreur serveur. Veuillez réessayer.', 500);
  }

  // Email owner (always French) — log on failure
  const approveUrl = `${env.SITE_URL}/api/approve?id=${id}&token=${token}`;
  try {
    await sendEmail(env.RESEND_API_KEY, {
      from: env.FROM_EMAIL,
      to: env.OWNER_EMAIL,
      subject: `Nouvelle demande de réservation — ${firstname} ${lastname}`,
      html: ownerEmailHtml({ firstname, lastname, email, phone: data.phone, checkin, checkout, nights, guests, message: data.message, approveUrl, ttlHours }),
    });
  } catch (emailErr) {
    console.error('[booking] Failed to notify owner:', emailErr);
  }

  // Email guest acknowledgment (in guest's language) — best effort
  const T = emailT(lang);
  try {
    await sendEmail(env.RESEND_API_KEY, {
      from: env.FROM_EMAIL,
      to: email.trim(),
      subject: T.ack_subject(propertyName),
      html: guestAcknowledgmentHtml({ firstname, checkin, checkout, nights, guests, propertyName, ttlHours, T }),
    });
  } catch (emailErr) {
    console.error('[booking] Failed to send guest acknowledgment:', emailErr);
  }

  return new Response(JSON.stringify({ ok: true, id }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}

function guestAcknowledgmentHtml({ firstname, checkin, checkout, nights, guests, propertyName, ttlHours, T }) {
  return `
<h2 style="color:#2C2520;font-family:Georgia,serif">${T.ack_heading}</h2>
<p style="font-family:sans-serif">${T.ack_greeting(escapeHtml(firstname))}</p>
<p style="font-family:sans-serif">${T.ack_body(escapeHtml(propertyName), escapeHtml(String(ttlHours)))}</p>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;margin:20px 0">
  <tr><td style="padding:6px 16px 6px 0;color:#888">${T.ack_col_checkin}</td><td style="padding:6px 0">${escapeHtml(checkin)}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">${T.ack_col_checkout}</td><td style="padding:6px 0">${escapeHtml(checkout)}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">${T.ack_col_nights}</td><td style="padding:6px 0">${T.ack_nights(nights)}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">${T.ack_col_guests}</td><td style="padding:6px 0">${escapeHtml(String(guests))}</td></tr>
</table>
<p style="font-family:sans-serif;color:#999;font-size:12px;margin-top:16px">${T.ack_footer}</p>
`;
}

function ownerEmailHtml({ firstname, lastname, email, phone, checkin, checkout, nights, guests, message, approveUrl, ttlHours }) {
  return `
<h2 style="color:#2C2520">Nouvelle demande de réservation</h2>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
  <tr><td style="padding:6px 16px 6px 0;color:#888">Voyageur</td><td style="padding:6px 0"><strong>${escapeHtml(firstname)} ${escapeHtml(lastname)}</strong></td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Email</td><td style="padding:6px 0">${escapeHtml(email)}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Téléphone</td><td style="padding:6px 0">${escapeHtml(phone) || '—'}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Arrivée</td><td style="padding:6px 0">${escapeHtml(checkin)}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Départ</td><td style="padding:6px 0">${escapeHtml(checkout)}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Durée</td><td style="padding:6px 0">${nights} nuit${nights > 1 ? 's' : ''}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Voyageurs</td><td style="padding:6px 0">${escapeHtml(String(guests))}</td></tr>
  ${message ? `<tr><td style="padding:6px 16px 6px 0;color:#888;vertical-align:top">Message</td><td style="padding:6px 0">${escapeHtml(message)}</td></tr>` : ''}
</table>
<p style="margin-top:24px;padding:14px 16px;background:#FEF3C7;border-left:4px solid #D97706;font-family:sans-serif;font-size:14px;color:#92400E">
  <strong>⚠ Avant d'approuver :</strong> bloquez ces dates dans votre calendrier Airbnb pour éviter une double réservation.
</p>
<p style="margin-top:16px">
  <a href="${approveUrl}" style="background:#4A5D44;color:#fff;padding:14px 28px;text-decoration:none;font-weight:bold;font-family:sans-serif;display:inline-block">
    → Répondre à la demande
  </a>
</p>
<p style="color:#999;font-size:12px;font-family:sans-serif">Ce lien est valable ${ttlHours}h.</p>
`;
}
