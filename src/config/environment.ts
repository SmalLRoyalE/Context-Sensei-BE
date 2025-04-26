import { config } from "dotenv";
import { logger } from "../../utils/logger.ts";

/**
 * Load environment variables from .env file
 */
export async function loadEnvironment(): Promise<void> {
  try {
    // Load .env file
    const env = await config({ path: "./.env", export: true });
    logger.info("Environment variables loaded");
    return;
  } catch (error) {
    logger.warn("Failed to load .env file:", error);
  }
}

/**
 * Get environment variable with fallback
 */
export function getEnv(key: string, fallback: string = ""): string {
  const value = Deno.env.get(key);
  return value !== undefined ? value : fallback;
}

/**
 * Check if environment is production
 */
export function isProduction(): boolean {
  return getEnv("ENV", "development").toLowerCase() === "production";
}

/**
 * Check if environment is development
 */
export function isDevelopment(): boolean {
  return getEnv("ENV", "development").toLowerCase() === "development";
}

/**
 * Check if environment is test
 */
export function isTest(): boolean {
  return getEnv("ENV", "development").toLowerCase() === "test";
}