import { Context } from "oak";
import { getCache, setCache, isRedisConnected } from "../config/redis.ts";
import { logger } from "../../utils/logger.ts";

// Types for cache middleware options
interface CacheOptions {
  ttl?: number;              // Time to live in seconds
  key?: string;              // Custom cache key
  keyPrefix?: string;        // Prefix for generated keys
  condition?: (ctx: Context) => boolean; // Conditional caching
  headerName?: string;       // HTTP header to indicate cache status
  cacheNull?: boolean;       // Whether to cache null/undefined values
  useStale?: boolean;        // Return stale cache when refresh fails
  fallbackToMemory?: boolean; // Use memory cache as fallback if Redis is down
}

// In-memory cache for fallback
const memoryCache = new Map<string, { value: string; expires: number }>();

// Default cache options
const defaultOptions: CacheOptions = {
  ttl: 60, // 1 minute default TTL
  keyPrefix: "api:cache:",
  headerName: "X-Cache",
  cacheNull: false,
  useStale: true,
  fallbackToMemory: true,
};

/**
 * Generate a cache key based on the request
 */
function generateCacheKey(ctx: Context, keyPrefix: string = "api:cache:"): string {
  const url = ctx.request.url.pathname;
  const query = ctx.request.url.search || "";
  
  // Include only selected headers that may affect the response
  const headers: Record<string, string> = {};
  const relevantHeaders = ["accept", "accept-language"];
  
  relevantHeaders.forEach(header => {
    const value = ctx.request.headers.get(header);
    if (value) {
      headers[header] = value;
    }
  });
  
  // Don't include authorization in the cache key for security
  // but we can add a flag to indicate if the request is authenticated
  const isAuthenticated = !!ctx.request.headers.get("authorization");
  
  // Construct the key components
  const keyParts = {
    url,
    query,
    headers,
    isAuthenticated,
  };
  
  // Create a deterministic key
  return `${keyPrefix}${encodeURIComponent(JSON.stringify(keyParts))}`;
}

/**
 * Store value in memory cache
 */
function setMemoryCache(key: string, value: string, ttl: number): void {
  const expires = Date.now() + ttl * 1000;
  memoryCache.set(key, { value, expires });
  
  // Clean up expired entries periodically
  if (memoryCache.size > 100) {
    const now = Date.now();
    for (const [k, v] of memoryCache.entries()) {
      if (v.expires < now) {
        memoryCache.delete(k);
      }
    }
  }
}

/**
 * Get value from memory cache
 */
function getMemoryCache(key: string): string | null {
  const item = memoryCache.get(key);
  
  if (!item) {
    return null;
  }
  
  // Check if expired
  if (item.expires < Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  
  return item.value;
}

/**
 * Cache middleware for API routes
 * It caches the response and returns it on subsequent requests
 */
export function cacheMiddleware(options: CacheOptions = {}) {
  const opts = { ...defaultOptions, ...options };
  
  return async (ctx: Context, next: () => Promise<unknown>) => {
    // Skip caching for non-GET requests
    if (ctx.request.method !== "GET") {
      return await next();
    }
    
    // Skip caching based on condition
    if (opts.condition && !opts.condition(ctx)) {
      return await next();
    }
    
    // Generate or use custom cache key
    const cacheKey = opts.key || generateCacheKey(ctx, opts.keyPrefix);
    let cacheHit = false;
    let cachedResponse: string | null = null;
    
    // Try to get from Redis cache
    if (isRedisConnected()) {
      cachedResponse = await getCache(cacheKey);
    } 
    // Fallback to memory cache if enabled
    else if (opts.fallbackToMemory) {
      cachedResponse = getMemoryCache(cacheKey);
    }
    
    if (cachedResponse) {
      try {
        const parsedResponse = JSON.parse(cachedResponse);
        
        // Skip if null/undefined values shouldn't be cached
        if (!opts.cacheNull && (parsedResponse === null || parsedResponse === undefined)) {
          cacheHit = false;
        } else {
          // Return cached response
          ctx.response.status = 200;
          ctx.response.body = parsedResponse;
          
          // Set cache header if specified
          if (opts.headerName) {
            ctx.response.headers.set(opts.headerName, "HIT");
          }
          
          cacheHit = true;
          logger.debug(`Cache hit for key: ${cacheKey}`);
        }
      } catch (error) {
        // Invalid JSON in cache, ignore and proceed
        logger.warn(`Invalid cache data for key: ${cacheKey}`, error);
        cacheHit = false;
      }
    }
    
    if (!cacheHit) {
      // Set cache header if specified
      if (opts.headerName) {
        ctx.response.headers.set(opts.headerName, "MISS");
      }
      
      // Store original response body setter
      const originalSetBody = ctx.response.body;
      
      // Override response body setter to cache the response
      Object.defineProperty(ctx.response, "body", {
        configurable: true,
        enumerable: true,
        get() {
          return originalSetBody;
        },
        set(body) {
          // Set the actual response body
          originalSetBody = body;
          
          // Don't cache error responses
          if (ctx.response.status >= 400) {
            return;
          }
          
          // Don't cache null/undefined if not allowed
          if (!opts.cacheNull && (body === null || body === undefined)) {
            return;
          }
          
          // Only cache JSON response
          const bodyToCache = JSON.stringify(body);
          
          // Store in Redis if connected
          if (isRedisConnected()) {
            setCache(cacheKey, bodyToCache, opts.ttl).catch(err => 
              logger.error(`Failed to set cache for key: ${cacheKey}`, err)
            );
          } 
          // Fallback to memory cache if enabled
          else if (opts.fallbackToMemory) {
            setMemoryCache(cacheKey, bodyToCache, opts.ttl ?? defaultOptions.ttl ?? 60);
          }
        }
      });
      
      // Process the request
      await next();
    }
  };
}

/**
 * Cache control middleware
 * Sets cache control headers based on the request and provided options
 */
export function cacheControl(options: { maxAge?: number; private?: boolean; noCache?: boolean }) {
  return async (ctx: Context, next: () => Promise<unknown>) => {
    await next();
    
    if (options.noCache) {
      ctx.response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
      ctx.response.headers.set("Pragma", "no-cache");
      ctx.response.headers.set("Expires", "0");
      return;
    }
    
    const directives = [];
    
    if (options.private) {
      directives.push("private");
    } else {
      directives.push("public");
    }
    
    if (options.maxAge !== undefined) {
      directives.push(`max-age=${options.maxAge}`);
    }
    
    ctx.response.headers.set("Cache-Control", directives.join(", "));
  };
}

/**
 * Invalidate cache for a specific pattern
 */
export async function invalidateCache(pattern: string): Promise<void> {
  if (isRedisConnected()) {
    try {
      // Get all keys matching the pattern
      const keys = await (await redisClient.keys(pattern));
      
      if (keys && keys.length > 0) {
        // Delete all matching keys
        await redisClient.del(...keys);
        logger.info(`Invalidated ${keys.length} cache keys matching pattern: ${pattern}`);
      }
    } catch (error) {
      logger.error(`Failed to invalidate cache for pattern: ${pattern}`, error);
    }
  }
  
  // Also clear memory cache for matching patterns
  if (memoryCache.size > 0) {
    const regex = new RegExp(pattern.replace("*", ".*"));
    
    let count = 0;
    for (const key of memoryCache.keys()) {
      if (regex.test(key)) {
        memoryCache.delete(key);
        count++;
      }
    }
    
    if (count > 0) {
      logger.info(`Invalidated ${count} memory cache keys matching pattern: ${pattern}`);
    }
  }
}