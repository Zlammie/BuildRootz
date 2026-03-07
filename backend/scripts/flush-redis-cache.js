require("dotenv").config();

const redis = require("redis");

async function flushRedisOnStartup() {
  if (process.env.NODE_ENV === "production") {
    console.log("[cache] skipping Redis flush in production");
    return;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log("[cache] REDIS_URL not set, skipping Redis flush");
    return;
  }

  const client = redis.createClient({ url: redisUrl });
  client.on("error", (err) => {
    console.log("[cache] Redis error:", err.message);
  });

  try {
    await client.connect();
    await client.flushAll();
    console.log("[cache] Redis cache flushed");
  } catch (err) {
    console.log("[cache] Redis flush skipped:", err.message);
  } finally {
    if (client.isOpen) {
      await client.quit();
    }
  }
}

flushRedisOnStartup();
