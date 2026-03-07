const mongoose = require("mongoose");

const SUBJECT_TYPES = ["listing", "community", "builder", "floorPlan"];
const DECISION_SENTIMENTS = ["love", "maybe", "pass"];

const queueSchema = new mongoose.Schema(
  {
    queued: { type: Boolean, default: true },
    title: { type: String, trim: true },
    subtitle: { type: String, trim: true, default: null },
    addedAt: { type: Number, default: null },
  },
  { _id: false },
);

const decisionSchema = new mongoose.Schema(
  {
    sentiment: { type: String, enum: DECISION_SENTIMENTS, default: null },
    checks: { type: [String], default: [] },
    score: { type: Number, default: null, min: 1, max: 5 },
  },
  { _id: false },
);

const workspaceEntrySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subjectType: { type: String, enum: SUBJECT_TYPES, required: true, trim: true },
    subjectId: { type: String, required: true, trim: true },
    builderId: { type: String, trim: true, default: undefined },
    communityId: { type: String, trim: true, default: undefined },
    listingId: { type: String, trim: true, default: undefined },
    floorPlanId: { type: String, trim: true, default: undefined },
    queue: { type: queueSchema, default: undefined },
    labels: { type: [String], default: [] },
    decision: { type: decisionSchema, default: undefined },
  },
  {
    collection: "WorkspaceEntries",
    timestamps: true,
  },
);

workspaceEntrySchema.index(
  { userId: 1, subjectType: 1, subjectId: 1 },
  { unique: true, name: "workspace_user_subject_unique" },
);

workspaceEntrySchema.index(
  { userId: 1, updatedAt: -1 },
  { name: "workspace_user_updated_idx" },
);

module.exports = mongoose.model("WorkspaceEntry", workspaceEntrySchema);
