import { z } from "zod";
import { Context, Status } from "oak";
import { logger } from "./logger.ts";
import { ValidationError } from "../src/middlewares/errorHandler.ts";

/**
 * Validate request body against a Zod schema
 */
export async function validateBody<T>(
  ctx: Context, 
  schema: z.ZodType<T>,
): Promise<{ data: T; isValid: true } | { error: z.ZodError; isValid: false }> {
  try {
    const body = ctx.request.body();
    
    if (body.type !== "json") {
      ctx.response.status = Status.BadRequest;
      ctx.response.body = { error: "Request body must be JSON" };
      return { error: new z.ZodError([]), isValid: false };
    }
    
    const value = await body.value;
    const result = schema.safeParse(value);
    
    if (!result.success) {
      const formattedErrors = result.error.format();
      ctx.response.status = Status.BadRequest;
      ctx.response.body = { 
        error: "Validation error", 
        details: formattedErrors 
      };
      
      logger.debug("Validation error", formattedErrors);
      
      return { error: result.error, isValid: false };
    }
    
    return { data: result.data, isValid: true };
  } catch (error) {
    ctx.response.status = Status.BadRequest;
    ctx.response.body = { error: "Invalid request body" };
    
    logger.error("Body validation error", error);
    
    return { error: new z.ZodError([]), isValid: false };
  }
}

/**
 * Validate request query parameters against a Zod schema
 */
export function validateQuery<T>(
  ctx: Context, 
  schema: z.ZodType<T>,
): { data: T; isValid: true } | { error: z.ZodError; isValid: false } {
  const queryParams = Object.fromEntries(ctx.request.url.searchParams.entries());
  const result = schema.safeParse(queryParams);
  
  if (!result.success) {
    ctx.response.status = Status.BadRequest;
    ctx.response.body = { 
      error: "Invalid query parameters", 
      details: result.error.format() 
    };
    
    return { error: result.error, isValid: false };
  }
  
  return { data: result.data, isValid: true };
}

/**
 * Common validation schemas with security considerations
 */
export const schemas = {
  // Basic types with security constraints
  id: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  uuid: z.string().uuid(),
  
  // User data validation
  email: z.string().email().max(255).toLowerCase(),
  password: z
    .string()
    .min(8)
    .max(100)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, 
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  name: z.string().trim().min(1).max(100),
  username: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/),
  
  // Pagination
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
  
  // Dates
  date: z.string().datetime(),
  dateOptional: z.string().datetime().optional(),
  
  // File handling
  mimeType: z.string().max(100),
  allowedMimeTypes: {
    audio: z.enum(['audio/mp3', 'audio/wav', 'audio/m4a', 'audio/ogg', 'audio/flac']),
    document: z.enum(['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown', 'application/json']),
    transcript: z.enum(['text/vtt', 'application/x-subrip', 'text/plain', 'application/json']),
    image: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
  },
  
  // API specific schemas
  url: z.string().url().max(2083),
  token: z.string().min(10).max(1000),
  
  // Custom validators for specific patterns
  mongoId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid MongoDB ObjectId'),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Must be lowercase alphanumeric with hyphens').max(100),
  
  // App specific data schemas
  transcriptText: z.string().min(1).max(1000000), // 1MB text limit
  apiKey: z.string().regex(/^[A-Za-z0-9_-]{20,}$/, 'Must be a valid API key format')
};

/**
 * Request param validator middleware factory
 */
export function validateParam(param: string, schema: z.ZodType) {
  return async (ctx: Context, next: () => Promise<unknown>) => {
    const value = ctx.params[param];
    
    if (!value) {
      ctx.response.status = Status.BadRequest;
      ctx.response.body = { error: `Missing required parameter: ${param}` };
      return;
    }
    
    const result = schema.safeParse(value);
    
    if (!result.success) {
      ctx.response.status = Status.BadRequest;
      ctx.response.body = { 
        error: `Invalid parameter: ${param}`,
        details: result.error.format()
      };
      return;
    }
    
    // Replace the param with the validated and possibly transformed value
    ctx.params[param] = result.data;
    
    await next();
  };
}

/**
 * Validation middleware factory - creates a middleware function that validates 
 * request bodies against specified schemas
 */
export function createValidationMiddleware(schema: z.ZodType) {
  return async (ctx: Context, next: () => Promise<unknown>) => {
    const result = await validateBody(ctx, schema);
    
    if (!result.isValid) {
      return; // Response is already set by validateBody
    }
    
    // Add validated data to context state
    ctx.state.validatedBody = result.data;
    
    await next();
  };
}

/**
 * Query validation middleware factory
 */
export function createQueryValidationMiddleware(schema: z.ZodType) {
  return (ctx: Context, next: () => Promise<unknown>) => {
    const result = validateQuery(ctx, schema);
    
    if (!result.isValid) {
      return; // Response is already set by validateQuery
    }
    
    // Add validated query params to context state
    ctx.state.validatedQuery = result.data;
    
    return next();
  };
}

/**
 * Sanitize input string to prevent script injection
 * Use for non-HTML content that shouldn't contain scripts
 */
export function sanitizeInput(input: string): string {
  if (!input) return input;
  
  return input
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/**
 * Data transformation utilities for common patterns
 */
export const transform = {
  trim: (val: string) => val.trim(),
  toLowerCase: (val: string) => val.toLowerCase(),
  toUpperCase: (val: string) => val.toUpperCase(),
  toNumber: (val: string) => Number(val),
  toBoolean: (val: unknown) => Boolean(val),
  toDate: (val: string) => new Date(val)
};

/**
 * Validation middleware that throws custom errors
 * For use with the error handler
 */
export function validateWithError<T>(data: unknown, schema: z.ZodType<T>): T {
  const result = schema.safeParse(data);
  
  if (!result.success) {
    throw new ValidationError("Validation failed", result.error.format());
  }
  
  return result.data;
}

