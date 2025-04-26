import { Context } from "oak";
import { logger } from "../../utils/logger.ts";

/**
 * Interface for sanitization options
 */
interface SanitizeOptions {
  sanitizeBody?: boolean;
  sanitizeQuery?: boolean;
  sanitizeParams?: boolean;
  sanitizeHeaders?: boolean;
  excludeFields?: string[];
  strictMode?: boolean; // More aggressive sanitization
}

/**
 * Default sanitize options
 */
const defaultOptions: SanitizeOptions = {
  sanitizeBody: true,
  sanitizeQuery: true,
  sanitizeParams: true,
  sanitizeHeaders: false, // Headers typically don't need sanitization
  excludeFields: ['password', 'token'], // Don't modify authentication fields
  strictMode: false,
};

/**
 * Sanitize string values to prevent injection attacks
 * Basic sanitization for non-HTML content
 */
export function sanitizeString(input: string, strictMode = false): string {
  if (!input || typeof input !== 'string') return input;

  // Basic sanitization - always applied
  let sanitized = input
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
  
  // Additional sanitization for strict mode
  if (strictMode) {
    // Remove potential script execution via data URIs
    sanitized = sanitized
      .replace(/data:/gi, "data-blocked:")
      .replace(/javascript:/gi, "javascript-blocked:")
      .replace(/eval\(/gi, "blocked(")
      .replace(/expression\(/gi, "blocked(")
      .replace(/Function\(/gi, "blocked(");
  }
  
  return sanitized;
}

/**
 * Sanitize object by recursively sanitizing all string values
 */
export function sanitizeObject(
  obj: unknown,
  options: SanitizeOptions = defaultOptions,
  path = ""
): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle primitive types
  if (typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return sanitizeString(obj, options.strictMode);
    }
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item, index) => 
      sanitizeObject(item, options, path ? `${path}.${index}` : `${index}`)
    );
  }

  // Handle objects
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    
    // Skip excluded fields
    if (options.excludeFields?.includes(key) || options.excludeFields?.includes(currentPath)) {
      result[key] = value;
      continue;
    }
    
    result[key] = sanitizeObject(value, options, currentPath);
  }
  
  return result;
}

/**
 * Middleware factory for sanitizing request data
 * This sanitizes the request body, query parameters, and path parameters
 */
export function sanitizeMiddleware(customOptions: SanitizeOptions = {}) {
  const options = { ...defaultOptions, ...customOptions };
  
  return async (ctx: Context, next: () => Promise<unknown>) => {
    try {
      // Sanitize request body
      if (options.sanitizeBody && ctx.request.hasBody) {
        const body = ctx.request.body();
        
        // Only sanitize JSON bodies
        if (body.type === "json") {
          const originalValue = await body.value;
          const sanitizedValue = sanitizeObject(originalValue, options);
          
          // Store sanitized body in context state
          ctx.state.sanitizedBody = sanitizedValue;
        }
      }
      
      // Sanitize URL query parameters
      if (options.sanitizeQuery) {
        const queryParams = Object.fromEntries(ctx.request.url.searchParams.entries());
        const sanitizedQuery = sanitizeObject(queryParams, options);
        
        // Store sanitized query in context state
        ctx.state.sanitizedQuery = sanitizedQuery;
      }
      
      // Sanitize URL path parameters
      if (options.sanitizeParams && ctx.params) {
        const sanitizedParams = sanitizeObject(ctx.params, options);
        
        // Store sanitized params in context state (don't override original params)
        ctx.state.sanitizedParams = sanitizedParams;
      }
      
      // Sanitize specific headers if needed
      if (options.sanitizeHeaders) {
        const headersToSanitize = ['user-agent', 'referer', 'origin'];
        const sanitizedHeaders: Record<string, string> = {};
        
        headersToSanitize.forEach(header => {
          const value = ctx.request.headers.get(header);
          if (value) {
            sanitizedHeaders[header] = sanitizeString(value, options.strictMode);
          }
        });
        
        // Store sanitized headers in context state
        ctx.state.sanitizedHeaders = sanitizedHeaders;
      }
      
      // Continue to next middleware
      await next();
      
    } catch (error) {
      logger.error("Error in sanitize middleware", error);
      throw error;
    }
  };
}

/**
 * Utility to sanitize response data
 * Use this for sanitizing data before sending to client when needed
 */
export function sanitizeResponseData(data: unknown, strictMode = false): unknown {
  return sanitizeObject(data, { ...defaultOptions, strictMode });
}

/**
 * Special middleware for handling file uploads with sanitization
 * This should be used in conjunction with fileUpload middleware
 */
export function sanitizeFileNames() {
  return async (ctx: Context, next: () => Promise<unknown>) => {
    await next();
    
    // If file was uploaded and stored in state
    if (ctx.state.uploadedFile) {
      // Sanitize the original filename (but not the generated unique name)
      if (ctx.state.uploadedFile.originalName) {
        ctx.state.uploadedFile.originalName = sanitizeString(
          ctx.state.uploadedFile.originalName, 
          true
        );
      }
    }
  };
}

/**
 * Content sanitizer - more aggressive HTML sanitization for user-generated content
 * Use this when you need to allow some HTML but want to remove potentially harmful tags/attributes
 */
export function sanitizeHtml(html: string): string {
  if (!html) return html;
  
  // Remove potentially dangerous tags completely
  const dangerousTags = ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'style'];
  
  let sanitized = html;
  
  // Remove dangerous tags and their content
  dangerousTags.forEach(tag => {
    const regex = new RegExp(`<${tag}[^>]*>.*?</${tag}>`, 'gis');
    sanitized = sanitized.replace(regex, '');
    
    // Also remove self-closing versions
    const selfClosingRegex = new RegExp(`<${tag}[^>]*/>`, 'gi');
    sanitized = sanitized.replace(selfClosingRegex, '');
  });
  
  // Remove dangerous attributes from remaining tags
  const dangerousAttrs = [
    'onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onmousedown',
    'onmouseup', 'onkeydown', 'onkeypress', 'onkeyup', 'onchange', 'onsubmit',
    'javascript:', 'data:', 'vbscript:', 'expression', 'behavior'
  ];
  
  dangerousAttrs.forEach(attr => {
    const attrRegex = new RegExp(`\\s${attr}\\s*=\\s*["'][^"']*["']`, 'gi');
    sanitized = sanitized.replace(attrRegex, '');
  });
  
  return sanitized;
}

/**
 * Apply standard sanitization to all routes
 */
export function applyGlobalSanitization(app: any) {
  app.use(sanitizeMiddleware({
    sanitizeBody: true,
    sanitizeQuery: true,
    sanitizeParams: true,
    excludeFields: ['password', 'token', 'refreshToken', 'apiKey']
  }));
  
  logger.info("Global sanitization middleware applied");
}