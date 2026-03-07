function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }
  const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
  if (!roles.includes("admin")) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  return next();
}

module.exports = requireAdmin;
