const express = require("express");
const mongoose = require("mongoose");
const internalApiKey = require("../../middleware/internalApiKey");
const CommunityRequest = require("../../models/CommunityRequest");
const { normalizeName } = require("../../utils/normalizeName");
const { sendMail } = require("../../services/emailService");

const router = express.Router();

function validateBody(body = {}) {
  const { name, city, state } = body;
  if (!name || !city || !state) {
    return "name, city, and state are required";
  }
  return null;
}

function buildAdminLink(id) {
  const base =
    process.env.ADMIN_BASE_URL ||
    process.env.CLIENT_ORIGIN ||
    process.env.FRONTEND_ORIGIN ||
    "";
  if (!base) return `/admin/community-requests/${id}`;
  return `${base.replace(/\/$/, "")}/admin/community-requests/${id}`;
}

async function notifyNewRequest(doc) {
  const to = "admin@keepupcrm.com";
  const subject = `New Community Request: ${doc.requestedName} (${doc.city}, ${doc.state})`;
  const link = buildAdminLink(doc._id?.toString?.() || doc._id);
  const lines = [
    `Name: ${doc.requestedName}`,
    `City/State: ${doc.city}, ${doc.state}`,
    `Notes: ${doc.notes || "(none)"}`,
    `Source KeepUp Community ID: ${doc.source?.keepupCommunityId || "(none)"}`,
    `Source Company ID: ${doc.source?.companyId || "(none)"}`,
    `Source User ID: ${doc.source?.userId || "(none)"}`,
    `Review: ${link}`,
  ];
  try {
    await sendMail({ to, subject, text: lines.join("\n") });
  } catch (err) {
    console.log("[community-requests] Failed to send notification:", err.message);
  }
}

router.use(internalApiKey);

router.post("/", async (req, res) => {
  try {
    const message = validateBody(req.body);
    if (message) {
      return res.status(400).json({ error: "BAD_REQUEST", message });
    }

    const {
      name,
      city,
      state,
      notes = "",
      sourceKeepupCommunityId,
      sourceCompanyId,
      sourceUserId,
    } = req.body || {};

    const requestedName = String(name).trim();
    const normalizedRequestedName = normalizeName(requestedName);
    const request = await CommunityRequest.create({
      requestedName,
      normalizedRequestedName,
      city: String(city).trim(),
      state: String(state).trim(),
      notes: String(notes || ""),
      source: {
        keepupCommunityId: sourceKeepupCommunityId ? String(sourceKeepupCommunityId) : undefined,
        companyId: sourceCompanyId ? String(sourceCompanyId) : undefined,
        userId: sourceUserId ? String(sourceUserId) : undefined,
      },
      status: "pending",
    });

    notifyNewRequest(request).catch(() => {});

    return res.status(201).json({ requestId: request._id.toString(), status: request.status });
  } catch (err) {
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/:requestId", async (req, res) => {
  try {
    const { requestId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Invalid request id" });
    }
    const request = await CommunityRequest.findById(requestId).lean();
    if (!request) {
      return res.status(404).json({ error: "REQUEST_NOT_FOUND" });
    }
    const status = request.status;
    if (status === "pending") return res.json({ status: "pending" });
    if (status === "approved" || status === "linked") {
      return res.json({
        status,
        communityId: request.resolvedCommunityId ? request.resolvedCommunityId.toString() : undefined,
        canonicalName: request.canonicalNameAtResolve || undefined,
      });
    }
    if (status === "rejected") {
      return res.json({ status: "rejected", rejectedReason: request.rejectedReason || "" });
    }
    return res.json({ status: request.status });
  } catch (err) {
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

module.exports = router;
