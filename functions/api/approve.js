import { signHmac, calcTotal, sendEmail } from '../_shared/utils.js';

/**
 * GET /api/approve?id=<booking_id>&token=<hmac>
 * Called when the owner clicks the approval link from their email.
 * Validates the token, creates a Stripe Checkout session, emails the guest, and updates D1.
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  const url   = new URL(request.url);
  const id    = url.searchParams.get('id');
  const token = url.searchParams.get('token');

  if (!id || !token) return errorPage('Lien invalide.');

  // Verify HMAC token
  const expected = await signHmac(id, env.APPROVE_SECRET);
  if (expected !== token) return errorPage('Lien invalide ou expiré.');

  // Fetch booking
  const booking = await env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first();
  if (!booking) return errorPage('Réservation introuvable.');
  if (booking.status !== 'pending') {
    return errorPage(`Cette réservation a déjà été traitée (statut : ${booking.status}).`);
  }

  // Calculate total price server-side
  const nights = Math.round((new Date(booking.checkout) - new Date(booking.checkin)) / 86400000);
  const total  = calcTotal(nights, parseFloat(env.PRICE_PER_NIGHT), parseFloat(env.PRICE_WEEK_RATE));

  // Create Stripe Checkout session
  let paymentUrl;
  try {
    const session = await createStripeSession({ booking, total, env });
    paymentUrl = session.url;
  } catch (err) {
    console.error('Stripe error:', err);
    return errorPage('Erreur lors de la création du lien de paiement. Veuillez réessayer.');
  }

  // Update booking status to approved
  await env.DB.prepare("UPDATE bookings SET status = 'approved' WHERE id = ?").bind(id).run();

  // Email guest the payment link
  await sendEmail(env.RESEND_API_KEY, {
    from: env.FROM_EMAIL,
    to: booking.email,
    subject: 'Votre réservation est approuvée — Le Refuge Sauvage',
    html: guestPaymentEmailHtml({ booking, nights, total, paymentUrl }),
  });

  return new Response(successPageHtml(booking), {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}

async function createStripeSession({ booking, total, env }) {
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'payment_method_types[]':                         'card',
      'payment_method_types[]':                         'bancontact',
      'line_items[0][price_data][currency]':            'eur',
      'line_items[0][price_data][product_data][name]':  `Le Refuge Sauvage — ${booking.checkin} au ${booking.checkout}`,
      'line_items[0][price_data][unit_amount]':         String(Math.round(total * 100)),
      'line_items[0][quantity]':                        '1',
      'mode':                                           'payment',
      'success_url':                                    `${env.SITE_URL}/reservation-confirmee`,
      'cancel_url':                                     `${env.SITE_URL}/#booking`,
      'customer_email':                                 booking.email,
      'metadata[booking_id]':                           booking.id,
      'metadata[property_id]':                          booking.property_id,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function guestPaymentEmailHtml({ booking, nights, total, paymentUrl }) {
  return `
<h2 style="color:#2C2520">Votre réservation est approuvée !</h2>
<p style="font-family:sans-serif">Bonjour ${booking.firstname},</p>
<p style="font-family:sans-serif">Le propriétaire du Refuge Sauvage a approuvé votre demande de réservation.</p>
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
<p style="color:#999;font-size:12px;font-family:sans-serif">Ce lien de paiement est valable 24h. Passé ce délai, contactez le propriétaire.</p>
`;
}

function successPageHtml(booking) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Réservation approuvée — Le Refuge Sauvage</title>
  <style>
    body { font-family: sans-serif; max-width: 480px; margin: 80px auto; padding: 0 24px; text-align: center; color: #2C2520; }
    h1   { color: #4A5D44; font-size: 1.5rem; }
    p    { color: #666; line-height: 1.6; }
  </style>
</head>
<body>
  <h1>✓ Réservation approuvée</h1>
  <p>Un lien de paiement a été envoyé à <strong>${booking.email}</strong>.</p>
  <p>${booking.firstname} ${booking.lastname}<br>${booking.checkin} → ${booking.checkout}</p>
</body>
</html>`;
}

function errorPage(message) {
  return new Response(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Erreur — Le Refuge Sauvage</title>
  <style>body{font-family:sans-serif;max-width:480px;margin:80px auto;padding:0 24px;text-align:center;color:#2C2520}h1{color:#c0392b}</style>
</head>
<body>
  <h1>Erreur</h1>
  <p>${message}</p>
</body>
</html>`, { status: 400, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}
