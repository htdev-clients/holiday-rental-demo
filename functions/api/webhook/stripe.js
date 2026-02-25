import { sendEmail } from '../../_shared/utils.js';

/**
 * POST /api/webhook/stripe
 * Receives Stripe webhook events, verifies the signature, and updates D1.
 * Register this URL in your Stripe dashboard → Webhooks.
 * Required event: checkout.session.completed
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  // Read raw body before any parsing (required for signature verification)
  const body      = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!await verifyStripeSignature(body, signature, env.STRIPE_WEBHOOK_SECRET)) {
    return new Response('Signature invalide.', { status: 400 });
  }

  const event = JSON.parse(body);

  if (event.type === 'checkout.session.completed') {
    const session   = event.data.object;
    const bookingId = session.metadata?.booking_id;
    if (!bookingId) return new Response('OK', { status: 200 });

    // Update booking status to paid
    await env.DB.prepare("UPDATE bookings SET status = 'paid' WHERE id = ?")
      .bind(bookingId)
      .run();

    // Fetch booking for confirmation emails
    const booking = await env.DB.prepare('SELECT * FROM bookings WHERE id = ?')
      .bind(bookingId)
      .first();

    if (booking) {
      const nights = Math.round((new Date(booking.checkout) - new Date(booking.checkin)) / 86400000);
      const total  = session.amount_total / 100; // Stripe stores in cents

      await Promise.all([
        sendEmail(env.RESEND_API_KEY, {
          from:    env.FROM_EMAIL,
          to:      booking.email,
          subject: 'Confirmation de votre réservation — Le Refuge Sauvage',
          html:    guestConfirmationHtml({ booking, nights, total }),
        }),
        sendEmail(env.RESEND_API_KEY, {
          from:    env.FROM_EMAIL,
          to:      env.OWNER_EMAIL,
          subject: `Paiement reçu — ${booking.firstname} ${booking.lastname}`,
          html:    ownerConfirmationHtml({ booking, nights, total }),
        }),
      ]);
    }
  }

  return new Response('OK', { status: 200 });
}

/**
 * Verify Stripe webhook signature using the Web Crypto API.
 * Stripe signs payloads as: HMAC-SHA256(timestamp + "." + body)
 */
async function verifyStripeSignature(body, header, secret) {
  if (!header || !secret) return false;

  const parts     = Object.fromEntries(header.split(',').map(p => p.split('=')));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const enc     = new TextEncoder();
  const key     = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig     = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${body}`));
  const hex     = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

  return hex === signature;
}

function guestConfirmationHtml({ booking, nights, total }) {
  return `
<h2 style="color:#4A5D44">Votre réservation est confirmée !</h2>
<p style="font-family:sans-serif">Bonjour ${booking.firstname},</p>
<p style="font-family:sans-serif">Votre paiement a bien été reçu. Votre séjour au Refuge Sauvage est confirmé.</p>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
  <tr><td style="padding:6px 16px 6px 0;color:#888">Arrivée</td><td style="padding:6px 0">${booking.checkin}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Départ</td><td style="padding:6px 0">${booking.checkout}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Durée</td><td style="padding:6px 0">${nights} nuit${nights > 1 ? 's' : ''}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Voyageurs</td><td style="padding:6px 0">${booking.guests}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Total payé</td><td style="padding:6px 0"><strong>${total.toLocaleString('fr-BE')} €</strong></td></tr>
</table>
<p style="font-family:sans-serif;margin-top:16px">Nous vous souhaitons un excellent séjour !</p>
`;
}

function ownerConfirmationHtml({ booking, nights, total }) {
  return `
<h2 style="color:#2C2520">Paiement reçu ✓</h2>
<p style="font-family:sans-serif">La réservation de <strong>${booking.firstname} ${booking.lastname}</strong> a été payée.</p>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
  <tr><td style="padding:6px 16px 6px 0;color:#888">Email</td><td style="padding:6px 0">${booking.email}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Arrivée</td><td style="padding:6px 0">${booking.checkin}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Départ</td><td style="padding:6px 0">${booking.checkout}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Durée</td><td style="padding:6px 0">${nights} nuit${nights > 1 ? 's' : ''}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Voyageurs</td><td style="padding:6px 0">${booking.guests}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Total</td><td style="padding:6px 0"><strong>${total.toLocaleString('fr-BE')} €</strong></td></tr>
</table>
`;
}
