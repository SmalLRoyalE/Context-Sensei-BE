import { connect } from "redis";
import { logger } from "../../utils/logger.ts";
import { getEnv } from "./environment.ts";

// Redis client instance
let redisClient: any = null;

// In-memory cache fallback
const memoryCache: Record<string, { value: string; expires?: number }> = {};

/**
 * Connect to Redis server
 */
export async function connectRedis(): Promise<void> {
  const redisUrl = getEnv("REDIS_URL", "redis://localhost:6379");
  
  try {
    logger.info(`Connecting to Redis at ${redisUrl}`);
    
    // Set a short connection timeout to avoid hanging
    const connectionPromise = connect({
      hostname: "localhost",
      port: 6379,
      tls: false,
    });
    
    // Add a 3-second timeout to the connection
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Redis connection timeout")), 3000);
    });
    
    // Race the connection against the timeout
    redisClient = await Promise.race([connectionPromise, timeoutPromise]);
    
    logger.info("Redis connection established");
  } catch (error) {
    logger.error("Failed to connect to Redis:", error);
    redisClient = null;
    throw error;
  }
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  return redisClient !== null;
}

/**
 * Set cache value
 */
export async function setCache(key: string, value: string, ttlSeconds?: number): Promise<void> {
  try {
    if (isRedisConnected()) {
      // Use Redis
      if (ttlSeconds) {
        await redisClient.set(key, value, { ex: ttlSeconds });
      } else {
        await redisClient.set(key, value);
      }
      logger.debug(`Redis cache set: ${key}`);
    } else {
      // Fallback to memory cache
      memoryCache[key] = { 
        value,
        expires: ttlSeconds ? Date.now() + (ttlSeconds * 1000) : undefined
      };
      logger.debug(`Memory cache set: ${key}`);
    }
  } catch (error) {
    logger.error(`Failed to set cache for ${key}:`, error);
    // Fallback to memory cache on Redis error
    memoryCache[key] = { 
      value,
      expires: ttlSeconds ? Date.now() + (ttlSeconds * 1000) : undefined
    };
  }
}

/**
 * Get cache value
 */
export async function getCache(key: string): Promise<string | null> {
  try {
    if (isRedisConnected()) {
      // Use Redis
      const value = await redisClient.get(key);
      logger.debug(`Redis cache ${value ? 'hit' : 'miss'}: ${key}`);
      return value;
    } else {
      // Fallback to memory cache
      const cacheItem = memoryCache[key];
      
      // Check if item exists and is not expired
      if (cacheItem && (!cacheItem.expires || cacheItem.expires > Date.now())) {
        logger.debug(`Memory cache hit: ${key}`);
        return cacheItem.value;
      }
      
      // Remove expired item
      if (cacheItem && cacheItem.expires && cacheItem.expires <= Date.now()) {
        delete memoryCache[key];
      }
      
      logger.debug(`Memory cache miss: ${key}`);
      return null;
    }
  } catch (error) {
    logger.error(`Failed to get cache for ${key}:`, error);
    
    // Try memory cache as fallback
    const cacheItem = memoryCache[key];
    if (cacheItem && (!cacheItem.expires || cacheItem.expires > Date.now())) {
      return cacheItem.value;
    }
    
    return null;
  }
}

/**
 * Delete cache value
 */
export async function deleteCache(key: string): Promise<void> {
  try {
    if (isRedisConnected()) {
      // Use Redis
      await redisClient.del(key);
      logger.debug(`Redis cache deleted: ${key}`);
    } else {
      // Fallback to memory cache
      delete memoryCache[key];
      logger.debug(`Memory cache deleted: ${key}`);
    }
  } catch (error) {
    logger.error(`Failed to delete cache for ${key}:`, error);
    // Still try to remove from memory cache
    delete memoryCache[key];
  }
}

/**
 * Clear cache (all or by pattern)
 */
export async function clearCache(pattern?: string): Promise<void> {
  try {
    if (isRedisConnected()) {
      // Use Redis
      if (pattern) {
        const keys = await redisClient.keys(pattern);
        if (keys.length > 0) {
          await redisClient.del(...keys);
          logger.debug(`Redis cache cleared with pattern ${pattern}: ${keys.length} keys`);
        }
      } else {
        await redisClient.flushDb();
        logger.debug("Redis cache cleared completely");
      }
    } else {
      // Fallback to memory cache
      if (pattern) {
        // Simple pattern matching for memory cache
        const regex = new RegExp(pattern.replace("*", ".*"));
        Object.keys(memoryCache).forEach(key => {
          if (regex.test(key)) {
            delete memoryCache[key];
          }
        });
        logger.debug(`Memory cache cleared with pattern ${pattern}`);
      } else {
        // Clear all memory cache
        Object.keys(memoryCache).forEach(key => {
          delete memoryCache[key];
        });
        logger.debug("Memory cache cleared completely");
      }
    }
  } catch (error) {
    logger.error(`Failed to clear cache${pattern ? ` with pattern ${pattern}` : ''}:`, error);
  }
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  try {
    if (isRedisConnected()) {
      await redisClient.quit();
      redisClient = null;
      logger.info("Redis connection closed");
    }
  } catch (error) {
    logger.error("Failed to close Redis connection:", error);
  }
}