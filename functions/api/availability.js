/**
 * GET /api/availability
 *
 * Fetches the property's Airbnb iCal feed and returns booked date ranges as a
 * flat array of 'YYYY-MM-DD' strings. The frontend calendar uses this to mark
 * dates unavailable.
 *
 * Requires: ICAL_URL env var (set in wrangler.toml per client).
 * Returns [] when ICAL_URL is not configured (safe default for demo/template).
 *
 * Cache: 1 hour via Cache-Control so the iCal feed isn't hammered on every visit.
 */
export async function onRequestGet({ env }) {
    const url = env.ICAL_URL;

    if (!url) {
        return Response.json({ booked: [] }, {
            headers: { 'Cache-Control': 'no-store' },
        });
    }

    try {
        const icalText = await fetch(url).then(r => {
            if (!r.ok) throw new Error(`iCal fetch failed: ${r.status}`);
            return r.text();
        });

        const booked = parseICal(icalText);

        return Response.json({ booked }, {
            headers: { 'Cache-Control': 'public, max-age=3600' },
        });
    } catch {
        // Return empty rather than a 500 — calendar degrades gracefully.
        return Response.json({ booked: [] }, {
            headers: { 'Cache-Control': 'no-store' },
        });
    }
}

/**
 * Parse a VCALENDAR iCal string and return all booked days as YYYY-MM-DD strings.
 * DTSTART is the first booked night; DTEND is checkout day (exclusive).
 * Supports both DATE (YYYYMMDD) and DATE-TIME (YYYYMMDDTHHMMSSZ) values.
 */
function parseICal(text) {
    const dates = new Set();
    const events = text.split('BEGIN:VEVENT').slice(1);

    for (const event of events) {
        const startMatch = event.match(/DTSTART(?:;[^:\r\n]+)?:(\d{8})/);
        const endMatch   = event.match(/DTEND(?:;[^:\r\n]+)?:(\d{8})/);
        if (!startMatch || !endMatch) continue;

        const start = parseDate(startMatch[1]);
        const end   = parseDate(endMatch[1]);

        for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
            dates.add(toKey(d));
        }
    }

    return [...dates].sort();
}

/** Parse 'YYYYMMDD' into a UTC midnight Date. */
function parseDate(s) {
    return new Date(Date.UTC(
        parseInt(s.slice(0, 4), 10),
        parseInt(s.slice(4, 6), 10) - 1,
        parseInt(s.slice(6, 8), 10),
    ));
}

/** Format a UTC Date as 'YYYY-MM-DD'. */
function toKey(d) {
    return d.toISOString().slice(0, 10);
}
