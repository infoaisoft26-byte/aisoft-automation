import { neon } from '@neondatabase/serverless';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { error: 'Method not allowed.' });
  }
  const expected = process.env.AISOFT_ADMIN_KEY;
  if (!expected) return send(res, 503, { error: 'Admin access is not configured on the server yet.' });
  const supplied = req.headers['x-admin-key'];
  if (typeof supplied !== 'string' || supplied.length !== expected.length ||
      !Buffer.from(supplied).equals(Buffer.from(expected))) {
    return send(res, 401, { error: 'Invalid admin key.' });
  }
  if (!process.env.DATABASE_URL) return send(res, 503, { error: 'Database is not configured.' });
  try {
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
    const enquiries = await sql`SELECT id, name, email, business, service, details, created_at
      FROM aisoft_studio_enquiries ORDER BY created_at DESC LIMIT 200`;
    return send(res, 200, { enquiries });
  } catch (error) {
    console.error('Admin enquiry read failed:', error?.message || 'unknown error');
    return send(res, 500, { error: 'Could not load enquiry records.' });
  }
}