import { neon } from '@neondatabase/serverless';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed.' });
  }
  if (!process.env.DATABASE_URL) {
    return send(res, 503, { error: 'Enquiry storage is not configured yet. Please try again later.' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (body.website) return send(res, 200, { ok: true });
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const business = String(body.business || '').trim();
    const service = String(body.service || '').trim();
    const details = String(body.details || '').trim();
    if (name.length < 2 || name.length > 100) return send(res, 400, { error: 'Please enter a valid name.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return send(res, 400, { error: 'Please enter a valid email address.' });
    if (!service || service.length > 80) return send(res, 400, { error: 'Please choose a service.' });
    if (details.length < 10 || details.length > 3000) return send(res, 400, { error: 'Please describe your project in at least 10 characters.' });
    if (body.consent !== 'on' && body.consent !== true) return send(res, 400, { error: 'Consent is required to submit this request.' });
    const sql = neon(process.env.DATABASE_URL);
    await sql`CREATE TABLE IF NOT EXISTS aisoft_studio_enquiries (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(254) NOT NULL,
      business VARCHAR(140),
      service VARCHAR(80) NOT NULL,
      details TEXT NOT NULL,
      consent BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`INSERT INTO aisoft_studio_enquiries (name, email, business, service, details, consent)
      VALUES (${name}, ${email}, ${business || null}, ${service}, ${details}, TRUE)`;
    return send(res, 201, { ok: true });
  } catch (error) {
    console.error('Enquiry submission failed:', error?.message || 'unknown error');
    return send(res, 500, { error: 'We could not save your enquiry right now. Please try again later.' });
  }
}