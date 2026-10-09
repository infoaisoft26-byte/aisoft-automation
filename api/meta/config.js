const { json, method } = require("./_lib");
module.exports = async (req, res) => {
  if (!method(req, res, "GET")) return;
  // Only the public Pixel ID is returned. App secrets, tokens, and server keys stay private.
  json(res, 200, { pixelId: process.env.META_PIXEL_ID || null, pixelEnabled: Boolean(process.env.META_PIXEL_ID) });
};
