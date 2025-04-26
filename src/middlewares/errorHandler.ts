import { Context, isHttpError, Status } from "oak";
import { logger } from "../../utils/logger.ts";

/**
 * Global error handling middleware
 */
export async function errorHandler(
  ctx: Context,
  next: () => Promise<unknown>,
): Promise<void> {
  try {
    await next();
  } catch (error) {
    // Handle HTTP errors
    if (isHttpError(error)) {
      ctx.response.status = error.status;
      ctx.response.body = {
        error: error.message,
        status: error.status,
      };
      
      // Log at appropriate level based on status code
      if (error.status >= 500) {
        logger.error(`HTTP Error ${error.status}`, error);
      } else if (error.status >= 400) {
        logger.warn(`HTTP Error ${error.status}`, error);
      } else {
        logger.info(`HTTP Status ${error.status}`, error);
      }
      
      return;
    }
    
    // Handle validation errors (assuming Zod or similar)
    if (error.name === "ZodError") {
      ctx.response.status = Status.BadRequest;
      ctx.response.body = {
        error: "Validation error",
        details: error.format ? error.format() : error.errors,
      };
      
      logger.warn("Validation error", error);
      return;
    }
    
    // Handle database errors
    if (error.name === "DatabaseError") {
      ctx.response.status = Status.InternalServerError;
      ctx.response.body = {
        error: "Database error",
      };
      
      logger.error("Database error", error);
      return;
    }
    
    // Handle authentication errors
    if (error.name === "AuthenticationError") {
      ctx.response.status = Status.Unauthorized;
      ctx.response.body = {
        error: "Authentication failed",
      };
      
      logger.warn("Authentication error", error);
      return;
    }
    
    // Handle all other errors as Internal Server Error
    ctx.response.status = Status.InternalServerError;
    ctx.response.body = {
      error: "Internal server error",
    };
    
    // Log the error with stack trace
    logger.error("Unhandled error", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
  }
}

/**
 * Custom error classes for specific error scenarios
 */
export class AuthenticationError extends Error {
  constructor(message = "Authentication failed") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class ValidationError extends Error {
  details: unknown;

  constructor(message = "Validation failed", details?: unknown) {
    super(message);
    this.name = "ValidationError";
    this.details = details;
  }
}

export class DatabaseError extends Error {
  constructor(message = "Database error") {
    super(message);
    this.name = "DatabaseError";
  }
}

export class ResourceNotFoundError extends Error {
  constructor(resource = "Resource", id?: string) {
    const message = id 
      ? `${resource} with ID ${id} not found` 
      : `${resource} not found`;
    super(message);
    this.name = "ResourceNotFoundError";
  }
}

/**
 * 404 Not Found handler for routes that don't match
 */
export function notFoundHandler(ctx: Context): void {
  ctx.response.status = Status.NotFound;
  ctx.response.body = {
    error: "Not Found",
    status: Status.NotFound,
    path: ctx.request.url.pathname,
  };
}