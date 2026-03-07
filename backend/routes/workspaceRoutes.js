const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const {
  getWorkspaceSnapshotForUser,
  getWorkspaceEntryForUser,
  upsertWorkspaceEntryForUser,
  deleteWorkspaceSubjectForUser,
  listWorkspaceNotesForUser,
  createWorkspaceNoteForUser,
  updateWorkspaceNoteForUser,
  deleteWorkspaceNoteForUser,
} = require("../services/workspaceService");

const router = express.Router();

function handleError(res, err) {
  const status = err.status || 500;
  const message = err.message || "Something went wrong.";
  return res.status(status).json({ success: false, error: message });
}

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const snapshot = await getWorkspaceSnapshotForUser(req.user._id);
    return res.json({ success: true, snapshot });
  } catch (err) {
    return handleError(res, err);
  }
});

router.get("/entries/:subjectType/:subjectId", async (req, res) => {
  try {
    const entry = await getWorkspaceEntryForUser(
      req.user._id,
      req.params.subjectType,
      req.params.subjectId,
    );
    return res.json({ success: true, entry });
  } catch (err) {
    return handleError(res, err);
  }
});

router.put("/entries/:subjectType/:subjectId", async (req, res) => {
  try {
    const entry = await upsertWorkspaceEntryForUser(
      req.user._id,
      req.params.subjectType,
      req.params.subjectId,
      req.body || {},
    );
    return res.json({ success: true, entry });
  } catch (err) {
    return handleError(res, err);
  }
});

router.delete("/entries/:subjectType/:subjectId", async (req, res) => {
  try {
    const removed = await deleteWorkspaceSubjectForUser(
      req.user._id,
      req.params.subjectType,
      req.params.subjectId,
    );
    return res.json({ success: true, removed });
  } catch (err) {
    return handleError(res, err);
  }
});

router.get("/notes/:subjectType/:subjectId", async (req, res) => {
  try {
    const notes = await listWorkspaceNotesForUser(
      req.user._id,
      req.params.subjectType,
      req.params.subjectId,
    );
    return res.json({ success: true, notes });
  } catch (err) {
    return handleError(res, err);
  }
});

router.post("/notes/:subjectType/:subjectId", async (req, res) => {
  try {
    const note = await createWorkspaceNoteForUser(
      req.user._id,
      req.params.subjectType,
      req.params.subjectId,
      req.body || {},
    );
    return res.status(201).json({ success: true, note });
  } catch (err) {
    return handleError(res, err);
  }
});

router.patch("/notes/:noteId", async (req, res) => {
  try {
    const note = await updateWorkspaceNoteForUser(req.user._id, req.params.noteId, req.body || {});
    return res.json({ success: true, note });
  } catch (err) {
    return handleError(res, err);
  }
});

router.delete("/notes/:noteId", async (req, res) => {
  try {
    await deleteWorkspaceNoteForUser(req.user._id, req.params.noteId);
    return res.json({ success: true, removed: true });
  } catch (err) {
    return handleError(res, err);
  }
});

module.exports = router;
