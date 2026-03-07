/* Lightweight sanity check for running API/DB connectivity. */
const API_BASE = process.env.API_BASE || "http://localhost:3001";

async function run() {
  const url = `${API_BASE.replace(/\/$/, "")}/api/health`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await res.text();

    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      console.error(`Unexpected response (status ${res.status}):`, text.slice(0, 200));
      process.exitCode = 1;
      return;
    }

    console.log("Health check:", data);
    if (!data.mongo) {
      process.exitCode = 1;
      console.error("Mongo not connected. Check BUILDROOTZ_MONGODB_URI.");
    }
  } catch (err) {
    process.exitCode = 1;
    console.error("Sanity check failed:", err.message);
  }
}

run();
