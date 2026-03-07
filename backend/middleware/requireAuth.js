const { verifySessionToken, SESSION_COOKIE_NAME } = require("../services/authService");
const User = require("../models/User");

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (!token) {
      return res.status(401).json({ success: false, error: "Authentication required." });
    }

    const payload = verifySessionToken(token);
    const userId = payload.sub || payload.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ success: false, error: "Session expired. Please sign in again." });
    }

    req.user = user;
    return next();
  } catch (err) {
    const status = err.name === "TokenExpiredError" ? 401 : 401;
    return res
      .status(status)
      .json({ success: false, error: "Session invalid or expired. Please sign in again." });
  }
}

module.exports = requireAuth;
