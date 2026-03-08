import { MongoClient, type Db } from "mongodb";

const uri = process.env.BUILDROOTZ_MONGODB_URI ?? process.env.MONGODB_URI;
const dbName = process.env.BUILDROOTZ_DB_NAME ?? "BuildRootz";

export const isMongoConfigured = Boolean(uri);

let clientPromise: Promise<MongoClient> | null = null;

// Reuse the client between hot reloads in dev to avoid exhausting sockets.
declare const globalThis: {
  _buildrootzMongoClient?: Promise<MongoClient>;
} & typeof global;

function getClientPromise(): Promise<MongoClient> {
  if (!uri) {
    throw new Error(
      "BUILDROOTZ_MONGODB_URI is not set. Provide a MongoDB connection string that points at the BuildRootz database.",
    );
  }

  if (clientPromise) return clientPromise;

  if (process.env.NODE_ENV === "development") {
    if (!globalThis._buildrootzMongoClient) {
      globalThis._buildrootzMongoClient = new MongoClient(uri).connect();
    }
    clientPromise = globalThis._buildrootzMongoClient;
  } else {
    clientPromise = new MongoClient(uri).connect();
  }

  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(dbName);
}
