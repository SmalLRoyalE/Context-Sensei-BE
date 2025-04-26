import { Application, Context } from "oak";
// Remove the problematic imports
// import { RateLimiter } from "rate_limit";
import { logger } from "../../utils/logger.ts";
import { getEnv } from "../config/environment.ts";

// Define allowed origins
const getAllowedOrigins = () => {
  const frontendUrl = getEnv("FRONTEND_URL", "http://localhost:5173");
  return [frontendUrl];
};

// Simple in-memory rate limiter implementation
class SimpleRateLimiter {
  private requests: Map<string, { count: number; resetTime: number }> = new Map();
  private windowMs: number;
  private maxRequests: number;
  private message: string;

  constructor({ windowMs = 15 * 60 * 1000, max = 100, message = "Too many requests" }) {
    this.windowMs = windowMs;
    this.maxRequests = max;
    this.message = message;
  }

  limit() {
    return async (ctx: Context, next: () => Promise<unknown>) => {
      const ip = ctx.request.ip;
      const now = Date.now();
      
      // Clean up expired entries
      if (Math.random() < 0.1) { // Only do cleanup occasionally for performance
        for (const [key, data] of this.requests.entries()) {
          if (now > data.resetTime) {
            this.requests.delete(key);
          }
        }
      }
      
      // Get or create record for this IP
      let record = this.requests.get(ip);
      if (!record) {
        record = { count: 0, resetTime: now + this.windowMs };
        this.requests.set(ip, record);
      } else if (now > record.resetTime) {
        record.count = 0;
        record.resetTime = now + this.windowMs;
      }
      
      // Check if limit exceeded
      if (record.count >= this.maxRequests) {
        ctx.response.status = 429;
        ctx.response.body = { error: this.message };
        logger.warn(`Rate limit exceeded for IP ${ip}`);
        return;
      }
      
      // Increment count and proceed
      record.count++;
      await next();
    };
  }
}

/**
 * Configure security middleware for the application
 * This applies various security headers and protections
 */
export function configureSecurityMiddleware(app: Application) {
  // Apply security headers manually
  app.use(async (ctx, next) => {
    await next();
    
    // Set security headers
    ctx.response.headers.set("X-Content-Type-Options", "nosniff");
    ctx.response.headers.set("X-Frame-Options", "DENY");
    ctx.response.headers.set("X-XSS-Protection", "1; mode=block");
    ctx.response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    ctx.response.headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-ancestors 'none';");
    ctx.response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    ctx.response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  });
  
  // CSRF protection
  app.use(async (ctx, next) => {
    // Skip CSRF check for non-mutation methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(ctx.request.method)) {
      return await next();
    }

    // Check CSRF token for mutation methods
    const requestToken = ctx.request.headers.get('x-csrf-token');
    const cookieToken = await ctx.cookies.get('csrf-token');
    
    if (!requestToken || !cookieToken || requestToken !== cookieToken) {
      ctx.response.status = 403;
      ctx.response.body = { error: 'Invalid CSRF token' };
      logger.warn(`CSRF token mismatch: ${ctx.request.url.pathname}`);
      return;
    }
    
    await next();
  });
  
  // Rate limiting with different limits for different endpoints
  const standardLimiter = new SimpleRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: "Too many requests from this IP, please try again later"
  });
  
  const authLimiter = new SimpleRateLimiter({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 20, // limit login/register attempts
    message: "Too many authentication attempts, please try again later"
  });
  
  // Apply standard rate limiting to all routes
  app.use(standardLimiter.limit());
  
  // Apply stricter rate limiting to auth routes
  app.use(async (ctx, next) => {
    if (ctx.request.url.pathname.startsWith('/auth/')) {
      return await authLimiter.limit()(ctx, next);
    }
    return await next();
  });
  
  // Cache control headers for non-static content
  app.use(async (ctx, next) => {
    await next();
    
    if (!ctx.request.url.pathname.startsWith('/static/')) {
      ctx.response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      ctx.response.headers.set('Pragma', 'no-cache');
      ctx.response.headers.set('Expires', '0');
    }
  });
  
  // API security logging middleware
  app.use(async (ctx, next) => {
    const startTime = performance.now();
    const method = ctx.request.method;
    const path = ctx.request.url.pathname;
    const ip = ctx.request.ip;
    
    try {
      await next();
      
      const status = ctx.response.status;
      const endTime = performance.now();
      const responseTime = Math.round(endTime - startTime);
      
      if (status >= 400) {
        logger.warn(`Security alert: ${method} ${path} - ${status} - ${responseTime}ms - IP: ${ip}`);
      }
    } catch (err) {
      const endTime = performance.now();
      const responseTime = Math.round(endTime - startTime);
      logger.error(`Security error: ${method} ${path} - IP: ${ip} - ${responseTime}ms`, err);
      throw err;
    }
  });
}

/**
 * Generate CSRF token and set as cookie
 */
export async function generateCsrfToken(ctx: Context): Promise<string> {
  const token = crypto.randomUUID();
  await ctx.cookies.set('csrf-token', token, {
    httpOnly: true,
    secure: getEnv("ENV") === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  });
  return token;
}

/**
 * CORS configuration with allowed origins
 */
export function corsConfig() {
  return {
    origin: getAllowedOrigins(),
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-csrf-token"],
    credentials: true,
    maxAge: 86400, // 24 hours
  };
}