const crypto = require("node:crypto");
const { neon } = require("@neondatabase/serverless");

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 5;
const recentRequests = new Map();

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body));
}

function clean(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function sameSecret(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function rateLimited(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const key = forwarded || "unknown";
  const now = Date.now();
  const current = (recentRequests.get(key) || []).filter((stamp) => now - stamp < WINDOW_MS);
  if (current.length >= MAX_REQUESTS) {
    recentRequests.set(key, current);
    return true;
  }
  current.push(now);
  recentRequests.set(key, current);
  if (recentRequests.size > 1000) {
    for (const [ip, stamps] of recentRequests) {
      if (!stamps.length || now - stamps[stamps.length - 1] >= WINDOW_MS) recentRequests.delete(ip);
    }
  }
  return false;
}

async function getSql() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  const sql = neon(process.env.DATABASE_URL);
  await sql`CREATE TABLE IF NOT EXISTS aisoft_service_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference text NOT NULL UNIQUE,
    name text NOT NULL,
    email text NOT NULL,
    business_name text,
    business_type text NOT NULL,
    request_type text NOT NULL,
    budget text,
    details text NOT NULL,
    consent boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','quoted','in_progress','completed','closed')),
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS aisoft_service_requests_created_at_idx ON aisoft_service_requests (created_at DESC)`;
  return sql;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  if (req.method === "GET") {
    const configuredKey = process.env.AISOFT_ADMIN_KEY;
    const header = String(req.headers.authorization || "");
    const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!configuredKey || configuredKey.length < 32 || !sameSecret(bearer, configuredKey)) {
      return sendJson(res, 401, { error: "Admin authorization required" });
    }
    try {
      const sql = await getSql();
      const rawLimit = Number.parseInt(req.query && req.query.limit, 10) || 50;
      const limit = Math.max(1, Math.min(100, rawLimit));
      const rows = await sql`SELECT reference, name, email, business_name, business_type, request_type, budget, details, status, created_at
        FROM aisoft_service_requests ORDER BY created_at DESC LIMIT ${limit}`;
      return sendJson(res, 200, { requests: rows });
    } catch (error) {
      console.error("Service request admin query failed:", error.message);
      return sendJson(res, 503, { error: "Service request storage is unavailable. Check server configuration." });
    }
  }

  if (rateLimited(req)) return sendJson(res, 429, { error: "Too many requests. Please wait a few minutes and try again." });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return sendJson(res, 400, { error: "Please submit a valid request form." });
  }

  // Honeypot: bots that fill this field receive a generic success response.
  if (clean(body.website, 200)) {
    return sendJson(res, 200, { accepted: true, reference: "SR-RECEIVED" });
  }

  const name = clean(body.name, 100);
  const email = clean(body.email, 254).toLowerCase();
  const businessName = clean(body.businessName, 140);
  const businessType = clean(body.businessType, 80);
  const requestType = clean(body.requestType, 60);
  const budget = clean(body.budget, 60);
  const details = clean(body.details, 3000);
  const consent = body.consent === true || body.consent === "true";

  const allowedBusinessTypes = new Set([
    "Retail shop", "Wholesale / distribution", "E-commerce", "Restaurant / food",
    "Recruitment / HR", "Professional services", "Other"
  ]);
  const allowedRequestTypes = new Set([
    "self-service", "custom-service", "whatsapp", "orders", "leads", "website", "other"
  ]);
  const allowedBudgets = new Set([
    "", "Not sure yet", "Under ₹5,000", "₹5,000–₹15,000", "₹15,000–₹50,000", "₹50,000+"
  ]);

  if (!name || !validEmail(email) || !allowedBusinessTypes.has(businessType) ||
      !allowedRequestTypes.has(requestType) || !allowedBudgets.has(budget) ||
      details.length < 10 || !consent) {
    return sendJson(res, 400, { error: "Please check all required fields and confirm the contact consent." });
  }

  const reference = "AS-" + crypto.randomBytes(5).toString("hex").toUpperCase();
  try {
    const sql = await getSql();
    await sql`INSERT INTO aisoft_service_requests
      (reference, name, email, business_name, business_type, request_type, budget, details, consent)
      VALUES (${reference}, ${name}, ${email}, ${businessName || null}, ${businessType}, ${requestType}, ${budget || null}, ${details}, ${consent})`;
    return sendJson(res, 201, { accepted: true, reference });
  } catch (error) {
    console.error("Service request submission failed:", error.message);
    return sendJson(res, 503, { error: "We could not save your request right now. Please try again later." });
  }
};
