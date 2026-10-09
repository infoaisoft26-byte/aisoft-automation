const crypto = require("node:crypto");
const { neon } = require("@neondatabase/serverless");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
function method(req, res, expected) {
  if (req.method !== expected) {
    res.setHeader("Allow", expected);
    json(res, 405, { error: "Method not allowed" });
    return false;
  }
  return true;
}
function getSql() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return neon(process.env.DATABASE_URL);
}
async function ensureSchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS meta_integrations (
    provider text NOT NULL,
    external_id text NOT NULL,
    name text,
    encrypted_access_token text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, external_id)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS meta_oauth_states (
    state_hash text PRIMARY KEY,
    expires_at timestamptz NOT NULL
  )`;
  await sql`CREATE TABLE IF NOT EXISTS meta_leads (
    lead_id text PRIMARY KEY,
    page_id text,
    form_id text,
    lead_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS meta_webhook_events (
    event_hash text PRIMARY KEY,
    object_type text,
    payload jsonb NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now()
  )`;
}
function tokenKey() {
  const value = process.env.META_TOKEN_ENCRYPTION_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error("META_TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters");
  return Buffer.from(value, "hex");
}
function encryptToken(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), encrypted.toString("hex")].join(":");
}
function decryptToken(value) {
  const [ivHex, tagHex, dataHex] = String(value || "").split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Stored token format is invalid");
  const decipher = crypto.createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}
function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function isAdmin(req) {
  const secret = process.env.META_ADMIN_KEY;
  if (!secret || secret.length < 32) return false;
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  return constantTimeEqual(bearer || req.headers["x-meta-admin-key"], secret);
}
async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}
function verifyMetaSignature(raw, signature) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signature || !signature.startsWith("sha256=")) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return constantTimeEqual(signature, expected);
}
function graphVersion() {
  return (process.env.META_GRAPH_API_VERSION || "v26.0").replace(/^/+|/+$/g, "");
}
module.exports = { json, method, getSql, ensureSchema, encryptToken, decryptToken, isAdmin, rawBody, verifyMetaSignature, graphVersion };
