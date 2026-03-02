import { sendEmail, escapeHtml } from '../../_shared/utils.js';
import { t as emailT } from '../../_shared/email-translations.js';

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
  const propertyName = env.PROPERTY_NAME || '[Nom du bien]';

  console.log(`[webhook] Stripe event received: ${event.type}`);

  if (event.type === 'checkout.session.completed') {
    const session   = event.data.object;
    const bookingId = session.metadata?.booking_id;
    if (!bookingId) {
      console.error('[webhook] checkout.session.completed missing booking_id in metadata');
      return new Response('OK', { status: 200 });
    }

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
      const T = emailT(booking.lang);

      try {
        await Promise.all([
          sendEmail(env.RESEND_API_KEY, {
            from:    env.FROM_EMAIL,
            to:      booking.email,
            subject: T.conf_subject(propertyName),
            html:    guestConfirmationHtml({ booking, nights, total, propertyName, T }),
          }),
          sendEmail(env.RESEND_API_KEY, {
            from:    env.FROM_EMAIL,
            to:      env.OWNER_EMAIL,
            subject: `Paiement reçu — ${booking.firstname} ${booking.lastname}`,
            html:    ownerConfirmationHtml({ booking, nights, total }),
          }),
        ]);
      } catch (emailErr) {
        // Log but return 200 — Stripe must not retry for email failures
        console.error('[webhook] Failed to send confirmation emails:', emailErr);
      }
    } else {
      console.error(`[webhook] checkout.session.completed: booking ${bookingId} not found in DB`);
    }
  } else {
    // Log unhandled event types for visibility — harmless but useful for debugging
    console.log(`[webhook] Unhandled Stripe event type: ${event.type}`);
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

function guestConfirmationHtml({ booking, nights, total, propertyName, T }) {
  return `
<h2 style="color:#4A5D44">${T.conf_heading}</h2>
<p style="font-family:sans-serif">${T.conf_greeting(escapeHtml(booking.firstname))}</p>
<p style="font-family:sans-serif">${T.conf_body(escapeHtml(propertyName))}</p>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
  <tr><td style="padding:6px 16px 6px 0;color:#888">${T.conf_col_checkin}</td><td style="padding:6px 0">${escapeHtml(booking.checkin)}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">${T.conf_col_checkout}</td><td style="padding:6px 0">${escapeHtml(booking.checkout)}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">${T.conf_col_nights}</td><td style="padding:6px 0">${T.conf_nights(nights)}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">${T.conf_col_guests}</td><td style="padding:6px 0">${escapeHtml(String(booking.guests))}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">${T.conf_col_total}</td><td style="padding:6px 0"><strong>${total.toLocaleString('fr-BE')} €</strong></td></tr>
</table>
<p style="font-family:sans-serif;margin-top:16px">${T.conf_closing}</p>
`;
}

function ownerConfirmationHtml({ booking, nights, total }) {
  return `
<h2 style="color:#2C2520">Paiement reçu ✓</h2>
<p style="font-family:sans-serif">La réservation de <strong>${escapeHtml(booking.firstname)} ${escapeHtml(booking.lastname)}</strong> a été payée.</p>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
  <tr><td style="padding:6px 16px 6px 0;color:#888">Email</td><td style="padding:6px 0">${escapeHtml(booking.email)}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Arrivée</td><td style="padding:6px 0">${escapeHtml(booking.checkin)}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Départ</td><td style="padding:6px 0">${escapeHtml(booking.checkout)}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Durée</td><td style="padding:6px 0">${nights} nuit${nights > 1 ? 's' : ''}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Voyageurs</td><td style="padding:6px 0">${escapeHtml(String(booking.guests))}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#888">Total</td><td style="padding:6px 0"><strong>${total.toLocaleString('fr-BE')} €</strong></td></tr>
</table>
`;
}
