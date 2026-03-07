const crypto = require("crypto");

const INTERNAL_KEY_ENV = "BRZ_INTERNAL_API_KEY";

function parseBearerToken(req) {
  const raw = req.get("authorization");
  if (!raw || typeof raw !== "string") return "";
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim?.() || "";
}

function timingSafeTokenCompare(left, right) {
  const leftDigest = crypto.createHash("sha256").update(String(left || ""), "utf8").digest();
  const rightDigest = crypto.createHash("sha256").update(String(right || ""), "utf8").digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

function requireInternalApiKey(req, res, next) {
  const configuredKey = (process.env[INTERNAL_KEY_ENV] || "").trim();
  const incomingKey = parseBearerToken(req);

  if (!configuredKey || !incomingKey || !timingSafeTokenCompare(incomingKey, configuredKey)) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED_INTERNAL" });
  }
  return next();
}

function requireInternalApiKeyOrNonProd(req, res, next) {
  if (process.env.NODE_ENV !== "production") {
    return next();
  }
  return requireInternalApiKey(req, res, next);
}

module.exports = {
  requireInternalApiKey,
  requireInternalApiKeyOrNonProd,
};
