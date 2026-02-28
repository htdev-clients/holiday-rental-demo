import { signHmac } from '../../_shared/utils.js';

/**
 * GET /api/admin/bookings?token=<hmac>
 * Protected owner dashboard — lists all bookings for this property.
 *
 * The token is HMAC-SHA256("admin-bookings", APPROVE_SECRET).
 * Generate the URL with: npm run admin-url
 */

const ADMIN_SCOPE = 'admin-bookings';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url   = new URL(request.url);
  const token = url.searchParams.get('token');

  const expected = await signHmac(ADMIN_SCOPE, env.APPROVE_SECRET);
  if (!token || token !== expected) {
    return new Response(unauthorizedHtml(), {
      status: 401,
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  }

  const { results: bookings } = await env.DB
    .prepare('SELECT * FROM bookings WHERE property_id = ? ORDER BY created_at DESC')
    .bind(env.PROPERTY_ID)
    .all();

  // Pre-compute approve tokens for pending bookings so we can render "Répondre" links
  const approveTokens = {};
  await Promise.all(
    bookings.filter(b => b.status === 'pending').map(async b => {
      approveTokens[b.id] = await signHmac(b.id, env.APPROVE_SECRET);
    })
  );

  const propertyName = env.PROPERTY_NAME || '[Nom du bien]';
  const perNight     = parseFloat(env.PRICE_PER_NIGHT) || 0;
  const siteUrl      = env.SITE_URL || '';

  return new Response(dashboardHtml({ bookings, propertyName, perNight, approveTokens, siteUrl }), {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'Cache-Control': 'no-store',
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nights(checkin, checkout) {
  return Math.round((new Date(checkout) - new Date(checkin)) / 86400000);
}

function total(checkin, checkout, perNight) {
  return nights(checkin, checkout) * perNight;
}

function fmt(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function fmtDateTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr + (isoStr.endsWith('Z') ? '' : 'Z'));
  return d.toLocaleString('fr-BE', { timeZone: 'Europe/Brussels', dateStyle: 'short', timeStyle: 'short' });
}

const STATUS_LABELS = {
  pending:   { label: 'En attente',  bg: '#FEF3C7', color: '#92400E' },
  approved:  { label: 'Approuvée',   bg: '#DBEAFE', color: '#1E40AF' },
  paid:      { label: 'Payée',       bg: '#D1FAE5', color: '#065F46' },
  rejected:  { label: 'Refusée',     bg: '#FEE2E2', color: '#991B1B' },
  cancelled: { label: 'Annulée',     bg: '#F3F4F6', color: '#6B7280' },
};

function statusBadge(status) {
  const s = STATUS_LABELS[status] || { label: status, bg: '#F3F4F6', color: '#6B7280' };
  return `<span style="background:${s.bg};color:${s.color};padding:2px 10px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;border-radius:2px;white-space:nowrap">${s.label}</span>`;
}

function stats(bookings) {
  const counts = { pending: 0, approved: 0, paid: 0, rejected: 0, cancelled: 0 };
  for (const b of bookings) counts[b.status] = (counts[b.status] || 0) + 1;
  const items = [
    { label: 'Total',      value: bookings.length, color: '#2C2520' },
    { label: 'En attente', value: counts.pending,  color: '#92400E' },
    { label: 'Payées',     value: counts.paid,     color: '#065F46' },
    { label: 'Refusées',   value: counts.rejected, color: '#991B1B' },
  ];
  return items.map(i =>
    `<div style="text-align:center;padding:16px 24px;background:#FAF8F3;border:1px solid #E5E2D9">
      <div style="font-size:2rem;font-weight:700;color:${i.color};font-family:'Cormorant Garamond',Georgia,serif">${i.value}</div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#888;margin-top:4px">${i.label}</div>
    </div>`
  ).join('');
}

function bookingRows(bookings, perNight, siteUrl, approveTokens) {
  if (bookings.length === 0) {
    return `<tr><td colspan="5" style="text-align:center;color:#aaa;padding:40px">Aucune réservation pour le moment</td></tr>`;
  }
  return bookings.map(b => {
    const n   = nights(b.checkin, b.checkout);
    const tot = total(b.checkin, b.checkout, perNight);
    const pendingLink = b.status === 'pending' && approveTokens[b.id]
      ? `<br><a href="${siteUrl}/api/approve?id=${encodeURIComponent(b.id)}&token=${encodeURIComponent(approveTokens[b.id])}" style="font-size:11px;color:#D6A87C;text-decoration:none">Répondre →</a>`
      : '';
    return `<tr style="border-bottom:1px solid #E5E2D9">
      <td style="padding:10px 12px;font-size:13px;white-space:nowrap">${fmtDateTime(b.created_at)}</td>
      <td style="padding:10px 12px;font-size:13px"><strong>${escapeHtml(b.firstname)} ${escapeHtml(b.lastname)}</strong><br><span style="color:#888;font-size:12px">${escapeHtml(b.email)}</span></td>
      <td style="padding:10px 12px;font-size:13px;white-space:nowrap">${fmt(b.checkin)} → ${fmt(b.checkout)}<br><span style="color:#888;font-size:12px">${n} nuit${n > 1 ? 's' : ''} · ${b.guests} pers.</span></td>
      <td style="padding:10px 12px;font-size:13px;text-align:right;white-space:nowrap">${tot.toLocaleString('fr-BE')} €</td>
      <td style="padding:10px 12px">${statusBadge(b.status)}${pendingLink}</td>
    </tr>`;
  }).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── Pages ────────────────────────────────────────────────────────────────────

function dashboardHtml({ bookings, propertyName, perNight, approveTokens, siteUrl }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Réservations — ${escapeHtml(propertyName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Montserrat:wght@400;500;600&display=swap">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body   { font-family: 'Montserrat', sans-serif; background: #F2F0E9; color: #2C2520; min-height: 100vh; }
    header { background: #2C2520; color: #F2F0E9; padding: 20px 32px; display: flex; align-items: baseline; gap: 16px; }
    header h1 { font-family: 'Cormorant Garamond', serif; font-size: 1.5rem; font-weight: 600; }
    header span { font-size: 12px; color: #D6A87C; text-transform: uppercase; letter-spacing: 0.08em; }
    .container { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 32px; }
    table  { width: 100%; border-collapse: collapse; background: #FAF8F3; border: 1px solid #E5E2D9; }
    thead tr { background: #2C2520; color: #F2F0E9; }
    thead th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
    thead th:last-child { text-align: left; }
    tbody tr:hover { background: #F2F0E9; }
    @media (max-width: 640px) {
      .stats { grid-template-columns: repeat(2, 1fr); }
      table, thead, tbody, tr, th, td { display: block; }
      thead { display: none; }
      tbody td { padding: 4px 12px; }
      tbody td:first-child { padding-top: 12px; }
      tbody td:last-child  { padding-bottom: 12px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(propertyName)}</h1>
    <span>Tableau de bord · Réservations</span>
  </header>
  <div class="container">
    <div class="stats">${stats(bookings)}</div>
    <table>
      <thead>
        <tr>
          <th>Reçue le</th>
          <th>Voyageur</th>
          <th>Dates</th>
          <th style="text-align:right">Total</th>
          <th>Statut</th>
        </tr>
      </thead>
      <tbody>
        ${bookingRows(bookings, perNight, siteUrl, approveTokens)}
      </tbody>
    </table>
    <p style="font-size:11px;color:#aaa;margin-top:16px;text-align:right">Accès réservé au propriétaire · Données en temps réel</p>
  </div>
</body>
</html>`;
}

function unauthorizedHtml() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Accès refusé</title>
  <style>body{font-family:sans-serif;max-width:480px;margin:80px auto;padding:0 24px;text-align:center;color:#2C2520}h1{color:#c0392b;font-size:1.4rem}</style>
</head>
<body>
  <h1>Accès refusé</h1>
  <p>Ce tableau de bord est réservé au propriétaire.</p>
  <p style="font-size:13px;color:#999;margin-top:16px">Utilisez le lien généré par <code>npm run admin-url</code>.</p>
</body>
</html>`;
}
