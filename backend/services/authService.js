const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { mergeSavedHomes } = require("./savedHomeService");

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "change-me";
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "br_session";
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 7) || 7;
const COOKIE_SAMESITE = process.env.SESSION_SAMESITE || "lax";

function getCookieOptions() {
  return {
    httpOnly: true,
    sameSite: COOKIE_SAMESITE,
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

function sanitizeUser(user) {
  return {
    id: user._id.toString(),
    email: user.email,
    emailVerified: user.emailVerified,
    roles: user.roles ?? [],
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    alertPreferences: user.alertPreferences ?? {},
  };
}

function validateEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 8;
}

function createSessionToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: `${SESSION_TTL_DAYS}d` });
}

function verifySessionToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE_NAME, token, getCookieOptions());
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    ...getCookieOptions(),
    maxAge: 0,
  });
}

async function registerUser({ email, password }) {
  if (!validateEmail(email)) {
    const err = new Error("Please provide a valid email address.");
    err.status = 400;
    throw err;
  }
  if (!validatePassword(password)) {
    const err = new Error("Password must be at least 8 characters.");
    err.status = 400;
    throw err;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    const err = new Error("An account already exists for that email.");
    err.status = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    email: normalizedEmail,
    passwordHash,
    createdAt: new Date(),
    lastLoginAt: new Date(),
  });

  const token = createSessionToken(user._id.toString());
  return { user, token };
}

async function loginUser({ email, password, savedListingIds }) {
  if (!validateEmail(email) || !validatePassword(password)) {
    const err = new Error("Invalid email or password.");
    err.status = 400;
    throw err;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    const err = new Error("No account found for that email.");
    err.status = 404;
    throw err;
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    const err = new Error("Incorrect password. Please try again.");
    err.status = 401;
    throw err;
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = createSessionToken(user._id.toString());

  if (Array.isArray(savedListingIds) && savedListingIds.length) {
    await mergeSavedHomes(user._id, savedListingIds);
  }

  return { user, token };
}

module.exports = {
  sanitizeUser,
  registerUser,
  loginUser,
  setSessionCookie,
  clearSessionCookie,
  verifySessionToken,
  SESSION_COOKIE_NAME,
  getCookieOptions,
};
