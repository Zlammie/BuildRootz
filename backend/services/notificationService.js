const cron = require("node-cron");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const SavedSearch = require("../models/SavedSearch");
const User = require("../models/User");

const COLLECTION_CANDIDATES = [
  "PublicHome",
  "PublicHomes",
  "publichomes",
  "publichome",
  "PublicHome_v2",
];

const ALERT_CRON = process.env.ALERT_CRON || "0 9 * * *"; // 9am server time

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || process.env.EMAIL_FROM;

  if (!host || !user || !pass || !from) {
    return { transport: null, from: null };
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return { transport, from };
}

async function resolveCollection() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection not ready");
  const names = await db.listCollections().toArray();
  const found = COLLECTION_CANDIDATES.find((name) => names.some((c) => c.name === name));
  if (!found) throw new Error("No PublicHome collection found for alerts.");
  return db.collection(found);
}

function buildQuery(filters, since) {
  const query = {};
  if (filters) {
    const priceMin = Number(filters.priceMin);
    const priceMax = Number(filters.priceMax);
    const beds = Number(String(filters.beds || "").replace("+", ""));
    const baths = Number(String(filters.baths || "").replace("+", ""));
    if (!Number.isNaN(priceMin)) query.price = { ...(query.price || {}), $gte: priceMin };
    if (!Number.isNaN(priceMax)) query.price = { ...(query.price || {}), $lte: priceMax };
    if (!Number.isNaN(beds)) query.beds = { ...(query.beds || {}), $gte: beds };
    if (!Number.isNaN(baths)) query.baths = { ...(query.baths || {}), $gte: baths };
  }
  if (since) {
    query.$or = [
      { updatedAt: { $gt: since } },
      { createdAt: { $gt: since } },
    ];
  }
  return query;
}

async function findMatches(filters, since) {
  try {
    const collection = await resolveCollection();
    const query = buildQuery(filters, since);
    const cursor = collection
      .find(query)
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(10);
    const results = await cursor.toArray();
    return results.map((doc) => ({
      id: String(doc._id || doc.id || doc.listingId || ""),
      title: doc.title || doc.name || "Untitled home",
      price: doc.price || doc.listPrice || null,
      city: doc.city,
      state: doc.state,
      updatedAt: doc.updatedAt || doc.createdAt || null,
    }));
  } catch (err) {
    console.log("[alerts] Failed to query matches:", err.message);
    return [];
  }
}

async function sendDigest({ transport, from }, user, search, matches) {
  if (!transport || !from) {
    console.log(
      `[alerts][dry-run] Would email ${user.email} for search "${search.name}" with ${matches.length} matches`,
      matches,
    );
    return false;
  }

  const lines = matches.map((m) => `- ${m.title} ${m.price ? `$${m.price}` : ""} (${m.city ?? ""} ${m.state ?? ""})`);
  const textBody = `New homes matching "${search.name}":\n\n${lines.join("\n") || "No matches found"}\n\n`;

  await transport.sendMail({
    from,
    to: user.email,
    subject: `BuildRootz alerts: ${search.name}`,
    text: textBody,
  });
  return true;
}

async function processAlerts() {
  const { transport, from } = getTransport();
  const users = await User.find({ "alertPreferences.emailAlertsEnabled": true }).lean();
  if (!users.length) return;

  for (const user of users) {
    const searches = await SavedSearch.find({ userId: user._id }).lean();
    if (!searches.length) continue;
    for (const search of searches) {
      const matches = await findMatches(search.filters, search.lastNotifiedAt);
      if (!matches.length) continue;
      try {
        const sent = await sendDigest({ transport, from }, user, search, matches);
        if (sent) {
          await SavedSearch.findByIdAndUpdate(search._id, { $set: { lastNotifiedAt: new Date() } });
        }
      } catch (err) {
        console.log("[alerts] Failed to send digest:", err.message);
      }
    }
  }
}

function startNotificationJob() {
  const enabled = process.env.ENABLE_ALERT_CRON !== "false";
  if (!enabled) {
    console.log("[alerts] Cron disabled via ENABLE_ALERT_CRON=false");
    return;
  }
  cron.schedule(ALERT_CRON, () => {
    processAlerts().catch((err) => console.log("[alerts] Cron error:", err.message));
  });
  console.log(`[alerts] Cron scheduled (${ALERT_CRON})`);
}

module.exports = { startNotificationJob, processAlerts };
