require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const redis = require("redis");
const cookieParser = require("cookie-parser");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const workspaceRoutes = require("./routes/workspaceRoutes");
const internalCommunityRoutes = require("./routes/internal/internalCommunityRoutes");
const internalCommunityRequestRoutes = require("./routes/internal/communityRequestRoutes");
const internalPublishRoutes = require("./routes/internalPublish.routes");
const adminCommunityRequestRoutes = require("./routes/admin/communityRequestRoutes");
const { startNotificationJob } = require("./services/notificationService");

const app = express();
const PORT = process.env.PORT || 3001;
const REDIS_URL = process.env.REDIS_URL;
const CLIENT_ORIGIN_RAW =
  process.env.CLIENT_ORIGIN || process.env.FRONTEND_ORIGIN || "http://localhost:3000";
const CLIENT_ORIGINS = CLIENT_ORIGIN_RAW.split(",").map((o) => o.trim()).filter(Boolean);

app.set("trust proxy", 1);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (CLIENT_ORIGINS.includes(origin)) return callback(null, true);
      if (/^https?:\/\/localhost(:\d+)?$/i.test(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/BuildRootz";
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected");
    startNotificationJob();
  })
  .catch((err) => console.log("MongoDB connection error:", err.message));

let redisClient = null;
async function initRedis() {
  if (!REDIS_URL) {
    console.log("Redis not configured (set REDIS_URL). Continuing without cache.");
    return;
  }
  const client = redis.createClient({ url: REDIS_URL });
  client.on("error", (err) => console.log("Redis Client Error", err));
  try {
    await client.connect();
    redisClient = client;
    console.log("Redis connected");
  } catch (err) {
    console.log("Redis unavailable, continuing without cache:", err.message);
  }
}
initRedis();

app.get("/", (_req, res) => {
  res.send("Backend API");
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, redis: Boolean(redisClient), mongo: mongoose.connection.readyState === 1 });
});

app.use("/api/auth", authRoutes);
app.use("/api/me", userRoutes);
app.use("/api/me/workspace", workspaceRoutes);
app.use("/api/internal/communities", internalCommunityRoutes);
app.use("/api/internal/community-requests", internalCommunityRequestRoutes);
app.use("/internal/publish/keepup", internalPublishRoutes);
app.use("/api/admin/community-requests", adminCommunityRequestRoutes);
app.use("/admin/community-requests", adminCommunityRequestRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
