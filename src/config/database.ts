import { MongoClient, Database } from "mongo";
import { logger } from "../utils/logger.ts";

let db: Database | null = null;

/**
 * Connect to MongoDB database
 * Creates a reusable database instance
 */
export async function connectDatabase() {
  try {
    const dbUrl = Deno.env.get("DATABASE_URL") || "mongodb://localhost:27017/context-sensei";
    
    logger.info(`Connecting to database at ${dbUrl.split("@")[1] || dbUrl.split("/").slice(0, -1).join("/")}`);
    
    const client = new MongoClient();
    await client.connect(dbUrl);
    
    const dbName = new URL(dbUrl).pathname.substring(1) || "context-sensei";
    db = client.database(dbName);
    
    logger.info(`Successfully connected to database: ${dbName}`);
    
    return db;
  } catch (error) {
    logger.error("Failed to connect to database", error);
    throw error;
  }
}

/**
 * Get the database instance
 */
export function getDatabase() {
  if (!db) {
    throw new Error("Database not initialized. Call connectDatabase() first.");
  }
  
  return db;
}

/**
 * Get a collection from the database
 */
export function getCollection<T>(name: string) {
  const database = getDatabase();
  return database.collection<T>(name);
}