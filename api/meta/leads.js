const { json, method, getSql, ensureSchema, isAdmin } = require("./_lib");
module.exports = async (req, res) => {
  if (!method(req, res, "GET")) return;
  if (!isAdmin(req)) return json(res, 401, { error: "Admin authorization required" });
  try {
    const sql = getSql();
    await ensureSchema(sql);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query && req.query.limit, 10) || 50));
    const rows = await sql`SELECT lead_id, page_id, form_id, lead_data, created_at FROM meta_leads ORDER BY created_at DESC LIMIT ${limit}`;
    json(res, 200, { leads: rows });
  } catch (error) {
    console.error("Meta leads query failed:", error.message);
    json(res, 500, { error: "Could not load leads. Check database configuration." });
  }
};
