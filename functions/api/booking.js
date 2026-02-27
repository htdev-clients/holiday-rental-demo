import { signHmac, sendEmail, jsonError } from '../_shared/utils.js';

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

  const nights = Math.round((co - ci) / 86400000);
  const id     = crypto.randomUUID();
  const token  = await signHmac(id, env.APPROVE_SECRET);

  // Insert into D1
  try {
    await env.DB.prepare(`
      INSERT INTO bookings
        (id, property_id, status, checkin, checkout, guests, firstname, lastname, email, phone, message)
      VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      id, env.PROPERTY_ID,
      checkin, checkout, parseInt(guests),
      firstname.trim(), lastname.trim(), email.trim(),
      data.phone?.trim() || null,
      data.message?.trim() || null
    )
    .run();
  } catch (err) {
    console.error('D1 insert error:', err);
    return jsonError('Erreur serveur. Veuillez réessayer.', 500);
  }

  // Email owner
  const approveUrl = `${env.SITE_URL}/api/approve?id=${id}&token=${token}`;
  await sendEmail(env.RESEND_API_KEY, {
    from: env.FROM_EMAIL,
    to: env.OWNER_EMAIL,
    subject: `Nouvelle demande de réservation — ${firstname} ${lastname}`,
    html: ownerEmailHtml({ firstname, lastname, email, phone: data.phone, checkin, checkout, nights, guests, message: data.message, approveUrl }),
  });

  return new Response(JSON.stringify({ ok: true, id }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}

function ownerEmailHtml({ firstname, lastname, email, phone, checkin, checkout, nights, guests, message, approveUrl }) {
  return `
<h2 style="color:#2C2520">Nouvelle demande de réservation</h2>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
  <tr><td style="padding:6px 16px 6px 0;color:#888">Voyageur</td><td style="padding:6px 0"><strong>${firstname} ${lastname}</strong></td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Email</td><td style="padding:6px 0">${email}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Téléphone</td><td style="padding:6px 0">${phone || '—'}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Arrivée</td><td style="padding:6px 0">${checkin}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Départ</td><td style="padding:6px 0">${checkout}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Durée</td><td style="padding:6px 0">${nights} nuit${nights > 1 ? 's' : ''}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Voyageurs</td><td style="padding:6px 0">${guests}</td></tr>
  ${message ? `<tr><td style="padding:6px 16px 6px 0;color:#888;vertical-align:top">Message</td><td style="padding:6px 0">${message}</td></tr>` : ''}
</table>
<p style="margin-top:24px">
  <a href="${approveUrl}" style="background:#4A5D44;color:#fff;padding:14px 28px;text-decoration:none;font-weight:bold;font-family:sans-serif;display:inline-block;margin-right:12px">
    ✓ Approuver
  </a>
  <a href="${approveUrl}" style="background:#f0f0f0;color:#555;padding:14px 28px;text-decoration:none;font-weight:bold;font-family:sans-serif;display:inline-block;border:1px solid #ccc">
    ✗ Refuser
  </a>
</p>
<p style="color:#999;font-size:12px;font-family:sans-serif">Ces liens sont valables 24h.</p>
`;
}
