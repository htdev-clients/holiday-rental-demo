// Shared helpers for all Pages Functions.
// Files under _shared/ are not treated as route handlers by Cloudflare Pages.

/**
 * Sign a string with HMAC-SHA256, return hex digest.
 */
export async function signHmac(data, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Calculate total price at a flat per-night rate.
 */
export function calcTotal(nights, perNight) {
  return nights * perNight;
}

/**
 * Send an email via Resend REST API.
 * `from` defaults to the property noreply address — override per client in env.
 */
export async function sendEmail(apiKey, { from, to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: from ?? 'Le Refuge Sauvage <noreply@refugesauvage.be>', to, subject, html }),
  });
  if (!res.ok) console.error('Resend error:', await res.text());
}

/**
 * Return a JSON error response.
 */
export function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
