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
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error('Resend error:', detail);
    throw new Error(`Email delivery failed (${res.status})`);
  }
}

/**
 * Escape a string for safe HTML output.
 * Use on every piece of user-supplied data inserted into an HTML template.
 */
export function escapeHtml(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
