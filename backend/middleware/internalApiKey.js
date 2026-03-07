function internalApiKey(req, res, next) {
  const configuredKey = (process.env.BUILDROOTZ_INTERNAL_API_KEY || "").trim();
  const incomingKey = (req.get("x-api-key") || "").trim();

  console.log(
    "[internalApiKey]",
    "configuredPresent=",
    !!configuredKey,
    "configuredTail=",
    configuredKey.slice(-4),
    "incomingTail=",
    incomingKey.slice(-4),
  );

  if (!configuredKey || !incomingKey || incomingKey !== configuredKey) {
    return res.status(401).json({ error: "UNAUTHORIZED_INTERNAL" });
  }
  console.log(
  "[internalApiKey] configuredKeyPresent=",
  !!process.env.BUILDROOTZ_INTERNAL_API_KEY,
  "configuredKeyTail=",
  (process.env.BUILDROOTZ_INTERNAL_API_KEY || "").slice(-4),
  "incomingKeyTail=",
  (req.get("x-api-key") || "").slice(-4)
);

  return next();
  
}



module.exports = internalApiKey;
