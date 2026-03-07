const mongoose = require("mongoose");

const SUBJECT_TYPES = ["listing", "community", "builder", "floorPlan"];

const workspaceNoteSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subjectType: { type: String, enum: SUBJECT_TYPES, required: true, trim: true },
    subjectId: { type: String, required: true, trim: true },
    builderId: { type: String, trim: true, default: undefined },
    communityId: { type: String, trim: true, default: undefined },
    listingId: { type: String, trim: true, default: undefined },
    floorPlanId: { type: String, trim: true, default: undefined },
    text: { type: String, required: true, trim: true },
  },
  {
    collection: "WorkspaceNotes",
    timestamps: true,
    _id: false,
  },
);

workspaceNoteSchema.index(
  { userId: 1, subjectType: 1, subjectId: 1, createdAt: -1 },
  { name: "workspace_note_user_subject_created_idx" },
);

workspaceNoteSchema.index({ userId: 1, updatedAt: -1 }, { name: "workspace_note_user_updated_idx" });

module.exports = mongoose.model("WorkspaceNote", workspaceNoteSchema);
