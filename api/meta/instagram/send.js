const { json, method, getSql, ensureSchema, decryptToken, isAdmin, graphVersion } = require("../_lib");
module.exports = async (req, res) => {
  if (!method(req, res, "POST")) return;
  if (!isAdmin(req)) return json(res, 401, { error: "Admin authorization required" });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  const accountId = String(body && body.instagramAccountId || "").trim();
  const recipientId = String(body && body.recipientId || "").trim();
  const text = String(body && body.text || "").trim();
  if (!accountId || !recipientId || !text || text.length > 1000) return json(res, 400, { error: "Provide instagramAccountId, recipientId, and text (1–1000 characters)" });
  try {
    const sql = getSql();
    await ensureSchema(sql);
    const rows = await sql`SELECT encrypted_access_token FROM meta_integrations WHERE provider = 'instagram' AND external_id = ${accountId} LIMIT 1`;
    if (!rows.length) return json(res, 404, { error: "Instagram account is not connected. Connect the linked Facebook Page first." });
    const token = decryptToken(rows[0].encrypted_access_token);
    const response = await fetch("https://graph.facebook.com/" + graphVersion() + "/" + encodeURIComponent(accountId) + "/messages", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text } })
    });
    const result = await response.json();
    if (!response.ok) {
      console.error("Instagram message failed:", result.error && result.error.code);
      return json(res, response.status >= 500 ? 502 : 400, { error: "Meta could not send the Instagram message. Check permissions, recipient eligibility, and app review." });
    }
    json(res, 200, { sent: true, messageId: result.message_id || null });
  } catch (error) {
    console.error("Instagram send failed:", error.message);
    json(res, 500, { error: "Instagram messaging failed. Check database and integration configuration." });
  }
};
