const crypto = require("node:crypto");
const { json, method, getSql, ensureSchema, isAdmin } = require("../_lib");
module.exports = async (req, res) => {
  if (!method(req, res, "POST")) return;
  if (!isAdmin(req)) return json(res, 401, { error: "Admin authorization required" });
  const appId = process.env.META_APP_ID;
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI;
  if (!appId || !redirectUri || !process.env.META_APP_SECRET) {
    return json(res, 503, { error: "Configure META_APP_ID, META_APP_SECRET and META_OAUTH_REDIRECT_URI first" });
  }
  try {
    const sql = getSql();
    await ensureSchema(sql);
    const state = crypto.randomBytes(32).toString("hex");
    const stateHash = crypto.createHash("sha256").update(state).digest("hex");
    await sql`DELETE FROM meta_oauth_states WHERE expires_at < now()`;
    await sql`INSERT INTO meta_oauth_states (state_hash, expires_at) VALUES (${stateHash}, now() + interval '10 minutes')`;
    const scopes = [
      "public_profile", "email", "pages_show_list", "pages_read_engagement",
      "leads_retrieval", "pages_manage_metadata", "pages_messaging",
      "instagram_basic", "instagram_manage_messages", "instagram_manage_comments",
      "instagram_content_publish"
    ].join(",");
    const url = new URL("https://www.facebook.com/" + (process.env.META_GRAPH_API_VERSION || "v26.0") + "/dialog/oauth");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes);
    json(res, 200, { url: url.toString() });
  } catch (error) {
    console.error("Meta OAuth start failed:", error.message);
    json(res, 500, { error: "Could not start Meta connection. Check server configuration." });
  }
};
