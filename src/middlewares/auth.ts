import { Context, Status } from "oak";
import { create, verify, getNumericDate } from "djwt";
import { getCache, setCache } from "../config/redis.ts";
import { logger } from "../utils/logger.ts";

export interface UserPayload {
  id: string;
  email: string;
  role: string;
}

/**
 * Generate a JWT token for a user
 */
export async function generateToken(user: UserPayload): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(Deno.env.get("JWT_SECRET") || "default-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

  const jwt = await create(
    { alg: "HS256", typ: "JWT" },
    {
      sub: user.id,
      iss: "context-sensei",
      exp: getNumericDate(60 * 60 * 24), // 24 hours default
      email: user.email,
      role: user.role,
    },
    key,
  );

  return jwt;
}

/**
 * Verify a JWT token
 */
export async function verifyToken(token: string): Promise<UserPayload | null> {
  try {
    // First check if token is blacklisted
    const isBlacklisted = await getCache(`blacklist:${token}`);
    if (isBlacklisted) {
      return null;
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(Deno.env.get("JWT_SECRET") || "default-secret"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );

    const payload = await verify(token, key);
    
    return {
      id: payload.sub as string,
      email: payload.email as string,
      role: payload.role as string,
    };
  } catch (error) {
    logger.debug(`Token verification failed: ${error.message}`);
    return null;
  }
}

/**
 * Blacklist a JWT token (for logout)
 */
export async function blacklistToken(token: string): Promise<void> {
  try {
    // Verify the token first to get its expiry
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(Deno.env.get("JWT_SECRET") || "default-secret"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );

    const payload = await verify(token, key);
    const expiry = payload.exp as number;
    const now = getNumericDate(0);
    const ttl = expiry - now;

    // Add token to blacklist until its original expiration time
    await setCache(`blacklist:${token}`, "true", ttl);
  } catch (error) {
    logger.error(`Failed to blacklist token: ${error.message}`);
  }
}

/**
 * Authentication middleware for protected routes
 */
export async function authMiddleware(ctx: Context, next: () => Promise<unknown>): Promise<void> {
  const authHeader = ctx.request.headers.get("Authorization");
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    ctx.response.status = Status.Unauthorized;
    ctx.response.body = { error: "Authentication required" };
    return;
  }
  
  const token = authHeader.split(" ")[1];
  const user = await verifyToken(token);
  
  if (!user) {
    ctx.response.status = Status.Unauthorized;
    ctx.response.body = { error: "Invalid or expired token" };
    return;
  }
  
  // Add the user to the state for use in route handlers
  ctx.state.user = user;
  
  await next();
}

/**
 * Role-based authorization middleware
 */
export function requireRole(allowedRoles: string[]) {
  return async (ctx: Context, next: () => Promise<unknown>): Promise<void> => {
    // Ensure auth middleware has run first
    if (!ctx.state.user) {
      ctx.response.status = Status.Unauthorized;
      ctx.response.body = { error: "Authentication required" };
      return;
    }
    
    const userRole = ctx.state.user.role;
    
    if (!allowedRoles.includes(userRole)) {
      ctx.response.status = Status.Forbidden;
      ctx.response.body = { error: "Insufficient permissions" };
      return;
    }
    
    await next();
  };
}