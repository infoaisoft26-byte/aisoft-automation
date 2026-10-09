const crypto = require("node:crypto");
const { json, getSql, ensureSchema, decryptToken, rawBody, verifyMetaSignature, graphVersion } = require("./_lib");
module.exports = async (req, res) => {
  if (req.method === "GET") {
    const mode = req.query && req.query["hub.mode"];
    const token = req.query && req.query["hub.verify_token"];
    const challenge = req.query && req.query["hub.challenge"];
    if (mode === "subscribe" && process.env.META_WEBHOOK_VERIFY_TOKEN && token === process.env.META_WEBHOOK_VERIFY_TOKEN && challenge) {
      res.statusCode = 200; res.setHeader("Content-Type", "text/plain"); return res.end(String(challenge));
    }
    return json(res, 403, { error: "Webhook verification failed" });
  }
  if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return json(res, 405, { error: "Method not allowed" }); }
  try {
    const raw = await rawBody(req);
    if (!verifyMetaSignature(raw, req.headers["x-hub-signature-256"])) return json(res, 401, { error: "Invalid webhook signature" });
    const payload = JSON.parse(raw.toString("utf8"));
    const sql = getSql();
    await ensureSchema(sql);
    const eventHash = crypto.createHash("sha256").update(raw).digest("hex");
    await sql`INSERT INTO meta_webhook_events (event_hash, object_type, payload) VALUES (${eventHash}, ${payload.object || "unknown"}, ${JSON.stringify(payload)}::jsonb) ON CONFLICT (event_hash) DO NOTHING`;
    // Lead Ads notifications include IDs only. Fetch the lead using the encrypted Page token.
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "leadgen") continue;
        const value = change.value || {};
        const leadId = String(value.leadgen_id || "");
        const pageId = String(value.page_id || entry.id || "");
        if (!leadId || !pageId) continue;
        const rows = await sql`SELECT encrypted_access_token FROM meta_integrations WHERE provider = 'facebook_page' AND external_id = ${pageId} LIMIT 1`;
        if (!rows.length) { console.warn("Lead webhook received before Page OAuth connection was stored"); continue; }
        const token = decryptToken(rows[0].encrypted_access_token);
        const leadUrl = new URL("https://graph.facebook.com/" + graphVersion() + "/" + encodeURIComponent(leadId));
        leadUrl.searchParams.set("fields", "id,created_time,field_data,form_id,ad_id,is_organic,platform");
        leadUrl.searchParams.set("access_token", token);
        const leadResponse = await fetch(leadUrl);
        const lead = await leadResponse.json();
        if (!leadResponse.ok) { console.error("Lead retrieval failed:", lead.error && lead.error.code); continue; }
        await sql`INSERT INTO meta_leads (lead_id, page_id, form_id, lead_data) VALUES (${leadId}, ${pageId}, ${String(lead.form_id || value.form_id || "") || null}, ${JSON.stringify(lead)}::jsonb) ON CONFLICT (lead_id) DO UPDATE SET lead_data = EXCLUDED.lead_data, page_id = EXCLUDED.page_id, form_id = EXCLUDED.form_id`;
      }
    }
    return json(res, 200, { received: true });
  } catch (error) {
    console.error("Meta webhook processing failed:", error.message);
    return json(res, 500, { error: "Webhook processing failed" });
  }
};
module.exports.config = { api: { bodyParser: false } };
