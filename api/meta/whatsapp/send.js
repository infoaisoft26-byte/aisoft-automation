const { json, method, isAdmin, graphVersion } = require("../_lib");
module.exports = async (req, res) => {
  if (!method(req, res, "POST")) return;
  if (!isAdmin(req)) return json(res, 401, { error: "Admin authorization required" });
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneId || !accessToken) return json(res, 503, { error: "WhatsApp Cloud API credentials are not configured" });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  const to = String(body && body.to || "").replace(/[^0-9]/g, "");
  const text = String(body && body.text || "").trim();
  if (to.length < 8 || to.length > 15 || !text || text.length > 1000) {
    return json(res, 400, { error: "Provide a valid international phone number and text (1–1000 characters)" });
  }
  try {
    const response = await fetch("https://graph.facebook.com/" + graphVersion() + "/" + encodeURIComponent(phoneId) + "/messages", {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: text } })
    });
    const result = await response.json();
    if (!response.ok) {
      console.error("WhatsApp send failed:", result.error && result.error.code);
      return json(res, response.status >= 500 ? 502 : 400, { error: "Meta could not send this WhatsApp message. Check token, phone ID, recipient opt-in, and messaging window." });
    }
    return json(res, 200, { sent: true, messageId: result.messages && result.messages[0] && result.messages[0].id });
  } catch (error) {
    console.error("WhatsApp send request failed:", error.message);
    return json(res, 502, { error: "WhatsApp API request failed" });
  }
};
