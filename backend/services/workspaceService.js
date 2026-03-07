const WorkspaceEntry = require("../models/WorkspaceEntry");
const WorkspaceNote = require("../models/WorkspaceNote");

const WORKSPACE_SUBJECT_TYPES = ["listing", "community", "builder", "floorPlan"];
const WORKSPACE_SUBJECT_TYPES_SET = new Set(WORKSPACE_SUBJECT_TYPES);
const DECISION_SENTIMENTS = new Set(["love", "maybe", "pass"]);
const DECISION_CHECK_IDS = new Set([
  "layout",
  "kitchen",
  "primarySuite",
  "storage",
  "outdoor",
  "price",
  "communityLocation",
  "tourNeeded",
  "locationWorks",
  "amenitiesMatter",
  "commuteReasonable",
  "schoolsAppealing",
  "vibeRight",
  "visitInPerson",
  "styleFits",
  "reputationStrong",
  "qualityStandsOut",
  "homeTypesFit",
  "exploreMore",
]);

function buildError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function cleanString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function cleanOptionalString(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function toTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

function ensureValidSubject(subjectType, subjectId) {
  const cleanType = cleanString(subjectType);
  const cleanId = cleanString(subjectId);

  if (!WORKSPACE_SUBJECT_TYPES_SET.has(cleanType)) {
    throw buildError(
      400,
      `subjectType must be one of: ${WORKSPACE_SUBJECT_TYPES.join(", ")}`,
    );
  }
  if (!cleanId) {
    throw buildError(400, "A subjectId is required.");
  }

  return { subjectType: cleanType, subjectId: cleanId };
}

function sanitizeContextRefs(input = {}) {
  return {
    builderId: cleanOptionalString(input.builderId),
    communityId: cleanOptionalString(input.communityId),
    listingId: cleanOptionalString(input.listingId),
    floorPlanId: cleanOptionalString(input.floorPlanId),
  };
}

function sanitizeQueue(input) {
  if (!input || typeof input !== "object") return null;
  if (input.queued !== true) return null;

  const title = cleanString(input.title);
  if (!title) {
    throw buildError(400, "queue.title is required when queue.queued is true.");
  }

  const subtitle = typeof input.subtitle === "string" ? input.subtitle.trim() : null;
  const addedAt = toTimestamp(input.addedAt);

  return {
    queued: true,
    title,
    subtitle: subtitle || null,
    addedAt,
  };
}

function sanitizeLabels(input) {
  if (!Array.isArray(input)) return [];
  const unique = new Set();
  for (const value of input) {
    if (typeof value !== "string") continue;
    const next = value.trim();
    if (!next) continue;
    unique.add(next);
  }
  return Array.from(unique);
}

function sanitizeDecision(input) {
  if (!input || typeof input !== "object") return null;

  const sentiment = DECISION_SENTIMENTS.has(input.sentiment) ? input.sentiment : null;

  const checks = Array.isArray(input.checks)
    ? Array.from(
        new Set(
          input.checks.filter(
            (value) => typeof value === "string" && DECISION_CHECK_IDS.has(value),
          ),
        ),
      )
    : [];

  const scoreRaw =
    typeof input.score === "number" && Number.isFinite(input.score)
      ? Math.round(input.score)
      : null;
  const score = scoreRaw !== null && scoreRaw >= 1 && scoreRaw <= 5 ? scoreRaw : null;

  if (!sentiment && !checks.length && score === null) return null;
  return { sentiment, checks, score };
}

function sanitizeNoteText(text) {
  const clean = cleanString(text);
  if (!clean) {
    throw buildError(400, "Note text is required.");
  }
  if (clean.length > 5000) {
    throw buildError(400, "Note text is too long.");
  }
  return clean;
}

function serializeWorkspaceEntry(doc) {
  if (!doc) return null;

  const queue =
    doc.queue && doc.queue.queued
      ? {
          queued: true,
          title: cleanString(doc.queue.title),
          subtitle: typeof doc.queue.subtitle === "string" ? doc.queue.subtitle : null,
          addedAt: toTimestamp(doc.queue.addedAt),
        }
      : undefined;

  const labels = sanitizeLabels(doc.labels);
  const decision = sanitizeDecision(doc.decision);

  return {
    subjectType: cleanString(doc.subjectType),
    subjectId: cleanString(doc.subjectId),
    builderId: cleanOptionalString(doc.builderId),
    communityId: cleanOptionalString(doc.communityId),
    listingId: cleanOptionalString(doc.listingId),
    floorPlanId: cleanOptionalString(doc.floorPlanId),
    queue,
    labels,
    decision: decision || undefined,
    createdAt: toTimestamp(doc.createdAt),
    updatedAt: toTimestamp(doc.updatedAt),
  };
}

function serializeWorkspaceNote(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id || ""),
    subjectType: cleanString(doc.subjectType),
    subjectId: cleanString(doc.subjectId),
    builderId: cleanOptionalString(doc.builderId),
    communityId: cleanOptionalString(doc.communityId),
    listingId: cleanOptionalString(doc.listingId),
    floorPlanId: cleanOptionalString(doc.floorPlanId),
    text: cleanString(doc.text),
    createdAt: toTimestamp(doc.createdAt),
    updatedAt: toTimestamp(doc.updatedAt),
  };
}

function buildSubjectKey(subjectType, subjectId) {
  return `${subjectType}:${subjectId}`;
}

function buildSubjectRecordFromEntry(entry) {
  const record = {};
  if (entry?.builderId) record.builderId = entry.builderId;
  if (entry?.communityId) record.communityId = entry.communityId;
  if (entry?.listingId) record.listingId = entry.listingId;
  if (entry?.floorPlanId) record.floorPlanId = entry.floorPlanId;
  if (entry?.queue?.queued && entry.queue.title) record.queue = entry.queue;
  if (Array.isArray(entry?.labels) && entry.labels.length) record.labels = entry.labels;
  if (entry?.decision) record.decision = entry.decision;
  if (typeof entry?.updatedAt === "number" && Number.isFinite(entry.updatedAt)) {
    record.updatedAt = entry.updatedAt;
  }
  return record;
}

function buildSubjectRefsUpdate($set, refs) {
  if (refs.builderId) $set.builderId = refs.builderId;
  if (refs.communityId) $set.communityId = refs.communityId;
  if (refs.listingId) $set.listingId = refs.listingId;
  if (refs.floorPlanId) $set.floorPlanId = refs.floorPlanId;
}

function buildSubjectRefsUnset($unset, refs) {
  if (!refs.builderId) $unset.builderId = 1;
  if (!refs.communityId) $unset.communityId = 1;
  if (!refs.listingId) $unset.listingId = 1;
  if (!refs.floorPlanId) $unset.floorPlanId = 1;
}

async function getWorkspaceSnapshotForUser(userId) {
  const [entriesRaw, notesRaw] = await Promise.all([
    WorkspaceEntry.find({ userId }).lean(),
    WorkspaceNote.find({ userId }).sort({ createdAt: -1 }).lean(),
  ]);

  const subjects = {};

  for (const rawEntry of entriesRaw) {
    const entry = serializeWorkspaceEntry(rawEntry);
    if (!entry) continue;
    const key = buildSubjectKey(entry.subjectType, entry.subjectId);
    const record = buildSubjectRecordFromEntry(entry);
    if (Object.keys(record).length) {
      subjects[key] = { ...(subjects[key] || {}), ...record };
    }
  }

  for (const rawNote of notesRaw) {
    const note = serializeWorkspaceNote(rawNote);
    if (!note) continue;
    const key = buildSubjectKey(note.subjectType, note.subjectId);
    const existing = subjects[key] || {};
    const notes = Array.isArray(existing.notes) ? existing.notes.slice() : [];
    notes.push({
      id: note.id,
      text: note.text,
      createdAt: note.createdAt || Date.now(),
    });
    subjects[key] = {
      ...existing,
      notes,
      updatedAt:
        typeof note.updatedAt === "number" && Number.isFinite(note.updatedAt)
          ? note.updatedAt
          : existing.updatedAt,
    };
  }

  return {
    version: 1,
    subjects,
  };
}

async function getWorkspaceEntryForUser(userId, subjectType, subjectId) {
  const subject = ensureValidSubject(subjectType, subjectId);
  const raw = await WorkspaceEntry.findOne({ userId, ...subject }).lean();
  return serializeWorkspaceEntry(raw);
}

async function upsertWorkspaceEntryForUser(userId, subjectType, subjectId, payload = {}) {
  const subject = ensureValidSubject(subjectType, subjectId);
  const refs = sanitizeContextRefs(payload);
  const queue = sanitizeQueue(payload.queue);
  const labels = sanitizeLabels(payload.labels);
  const decision = sanitizeDecision(payload.decision);

  const hasState = Boolean(queue) || labels.length > 0 || Boolean(decision);
  if (!hasState) {
    await WorkspaceEntry.findOneAndDelete({ userId, ...subject });
    return null;
  }

  const $set = {
    userId,
    subjectType: subject.subjectType,
    subjectId: subject.subjectId,
  };
  const $unset = {};

  if (queue) $set.queue = queue;
  else $unset.queue = 1;

  if (labels.length) $set.labels = labels;
  else $unset.labels = 1;

  if (decision) $set.decision = decision;
  else $unset.decision = 1;

  buildSubjectRefsUpdate($set, refs);
  buildSubjectRefsUnset($unset, refs);

  const raw = await WorkspaceEntry.findOneAndUpdate(
    { userId, ...subject },
    {
      $set,
      ...(Object.keys($unset).length ? { $unset } : {}),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return serializeWorkspaceEntry(raw);
}

async function deleteWorkspaceSubjectForUser(userId, subjectType, subjectId) {
  const subject = ensureValidSubject(subjectType, subjectId);
  const [entryResult, noteResult] = await Promise.all([
    WorkspaceEntry.findOneAndDelete({ userId, ...subject }),
    WorkspaceNote.deleteMany({ userId, ...subject }),
  ]);
  return Boolean(entryResult) || noteResult.deletedCount > 0;
}

async function listWorkspaceNotesForUser(userId, subjectType, subjectId) {
  const subject = ensureValidSubject(subjectType, subjectId);
  const notes = await WorkspaceNote.find({ userId, ...subject }).sort({ createdAt: -1 }).lean();
  return notes
    .map(serializeWorkspaceNote)
    .filter(Boolean)
    .map((note) => ({
      id: note.id,
      text: note.text,
      createdAt: note.createdAt || Date.now(),
      updatedAt: note.updatedAt || note.createdAt || Date.now(),
    }));
}

async function createWorkspaceNoteForUser(userId, subjectType, subjectId, payload = {}) {
  const subject = ensureValidSubject(subjectType, subjectId);
  const refs = sanitizeContextRefs(payload);
  const text = sanitizeNoteText(payload.text);
  const id = cleanOptionalString(payload.id);
  const createPayload = {
    userId,
    subjectType: subject.subjectType,
    subjectId: subject.subjectId,
    text,
  };
  buildSubjectRefsUpdate(createPayload, refs);

  let raw = null;
  if (id) {
    raw = await WorkspaceNote.findOneAndUpdate(
      { _id: id, userId },
      { $set: createPayload, $setOnInsert: { _id: id } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  } else {
    const note = await WorkspaceNote.create(createPayload);
    raw = note.toObject();
  }

  const serialized = serializeWorkspaceNote(raw);
  return {
    id: serialized.id,
    text: serialized.text,
    createdAt: serialized.createdAt || Date.now(),
    updatedAt: serialized.updatedAt || serialized.createdAt || Date.now(),
  };
}

async function updateWorkspaceNoteForUser(userId, noteId, payload = {}) {
  const id = cleanString(noteId);
  if (!id) {
    throw buildError(400, "A note id is required.");
  }

  const text = sanitizeNoteText(payload.text);
  const raw = await WorkspaceNote.findOneAndUpdate(
    { _id: id, userId },
    { $set: { text } },
    { new: true },
  ).lean();

  if (!raw) {
    throw buildError(404, "Workspace note not found.");
  }

  const serialized = serializeWorkspaceNote(raw);
  return {
    id: serialized.id,
    text: serialized.text,
    createdAt: serialized.createdAt || Date.now(),
    updatedAt: serialized.updatedAt || serialized.createdAt || Date.now(),
  };
}

async function deleteWorkspaceNoteForUser(userId, noteId) {
  const id = cleanString(noteId);
  if (!id) {
    throw buildError(400, "A note id is required.");
  }

  const deleted = await WorkspaceNote.findOneAndDelete({ _id: id, userId });
  if (!deleted) {
    throw buildError(404, "Workspace note not found.");
  }
  return true;
}

module.exports = {
  WORKSPACE_SUBJECT_TYPES,
  getWorkspaceSnapshotForUser,
  getWorkspaceEntryForUser,
  upsertWorkspaceEntryForUser,
  deleteWorkspaceSubjectForUser,
  listWorkspaceNotesForUser,
  createWorkspaceNoteForUser,
  updateWorkspaceNoteForUser,
  deleteWorkspaceNoteForUser,
};
