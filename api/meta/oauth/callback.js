const crypto = require("node:crypto");
const { json, getSql, ensureSchema, encryptToken, graphVersion } = require("../_lib");
module.exports = async (req, res) => {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  const { code, state, error: oauthError } = req.query || {};
  if (oauthError) return json(res, 400, { error: "Meta authorization was cancelled or denied." });
  if (typeof code !== "string" || typeof state !== "string") return json(res, 400, { error: "Missing OAuth code or state." });
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) return json(res, 503, { error: "Meta OAuth is not configured." });
  try {
    const sql = getSql();
    await ensureSchema(sql);
    const stateHash = crypto.createHash("sha256").update(state).digest("hex");
    const valid = await sql`DELETE FROM meta_oauth_states WHERE state_hash = ${stateHash} AND expires_at > now() RETURNING state_hash`;
    if (!valid.length) return json(res, 400, { error: "OAuth state is invalid, expired, or already used. Start again." });
    const base = "https://graph.facebook.com/" + graphVersion() + "/oauth/access_token";
    const shortUrl = new URL(base);
    shortUrl.searchParams.set("client_id", appId);
    shortUrl.searchParams.set("client_secret", appSecret);
    shortUrl.searchParams.set("redirect_uri", redirectUri);
    shortUrl.searchParams.set("code", code);
    const shortResponse = await fetch(shortUrl);
    const shortData = await shortResponse.json();
    if (!shortResponse.ok || !shortData.access_token) throw new Error("Meta code exchange failed");
    const longUrl = new URL(base);
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", appId);
    longUrl.searchParams.set("client_secret", appSecret);
    longUrl.searchParams.set("fb_exchange_token", shortData.access_token);
    const longResponse = await fetch(longUrl);
    const longData = await longResponse.json();
    const userToken = longResponse.ok && longData.access_token ? longData.access_token : shortData.access_token;
    const pagesUrl = new URL("https://graph.facebook.com/" + graphVersion() + "/me/accounts");
    pagesUrl.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username}");
    pagesUrl.searchParams.set("access_token", userToken);
    const pagesResponse = await fetch(pagesUrl);
    const pagesData = await pagesResponse.json();
    if (!pagesResponse.ok) throw new Error("Could not list Pages. Verify pages_show_list and related permissions.");
    for (const page of (pagesData.data || [])) {
      if (!page.id || !page.access_token) continue;
      await sql`INSERT INTO meta_integrations (provider, external_id, name, encrypted_access_token, details, updated_at)
        VALUES ('facebook_page', ${String(page.id)}, ${page.name || null}, ${encryptToken(page.access_token)}, ${JSON.stringify({ instagram: page.instagram_business_account || null })}::jsonb, now())
        ON CONFLICT (provider, external_id) DO UPDATE SET name = EXCLUDED.name, encrypted_access_token = EXCLUDED.encrypted_access_token, details = EXCLUDED.details, updated_at = now()`;
      if (page.instagram_business_account && page.instagram_business_account.id) {
        await sql`INSERT INTO meta_integrations (provider, external_id, name, encrypted_access_token, details, updated_at)
          VALUES ('instagram', ${String(page.instagram_business_account.id)}, ${page.instagram_business_account.username || page.name || null}, ${encryptToken(page.access_token)}, ${JSON.stringify({ pageId: String(page.id) })}::jsonb, now())
          ON CONFLICT (provider, external_id) DO UPDATE SET name = EXCLUDED.name, encrypted_access_token = EXCLUDED.encrypted_access_token, details = EXCLUDED.details, updated_at = now()`;
      }
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = 200;
    res.end("<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width'><title>Meta connection</title><body style='font:16px system-ui;max-width:640px;margin:60px auto;padding:24px'><h1>Meta authorization completed</h1><p>Connected " + (pagesData.data || []).length + " Facebook Page(s). Tokens are stored encrypted on the server.</p><p>If you expected Instagram or lead data, confirm the account permissions and that your Instagram account is Professional and linked to the relevant Page.</p><p>You may close this tab. Webhooks and lead retrieval still require setup in Meta for Developers.</p></body></html>");
  } catch (error) {
    console.error("Meta OAuth callback failed:", error.message);
    json(res, 500, { error: "Meta connection failed. Check app permissions, database configuration, and server logs." });
  }
};
