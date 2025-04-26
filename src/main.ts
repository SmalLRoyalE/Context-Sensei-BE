import { Application, Router } from "oak";

import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { configureSecurityMiddleware, corsConfig } from "./middlewares/security.ts";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.ts";
import { sanitizeMiddleware, applyGlobalSanitization } from "./middlewares/sanitize.ts";
import { cacheMiddleware } from "./middlewares/cache.ts";
import { logger } from "../utils/logger.ts";
import { connectRedis } from "./config/redis.ts";
import { connectDatabase } from "./config/database.ts";
import { loadEnvironment, getEnv } from "./config/environment.ts";
import { userRoutes } from "./routes/userRoutes.ts";
import { transcriptRoutes } from "./routes/transcriptRoutes.ts";
import { analysisRoutes } from "./routes/analysisRoutes.ts";
import { setupSocketServer } from "./services/socket.ts";
import { initDiscordBot } from "../integrations/discord.ts";
import { initGoogleMeetIntegration } from "../integrations/googleMeet.ts";

// Load environment variables
await loadEnvironment();

// Connect to database
try {
  await connectDatabase();
  logger.info("Database connected successfully");
} catch (error) {
  logger.warning("Database connection failed, continuing without database", error);
}

// Connect to Redis (optional)
try {
  await connectRedis();
  logger.info("Redis connected successfully");
} catch (error) {
  logger.warning("Redis connection failed, continuing with in-memory cache fallback", error);
}

const app = new Application();
const router = new Router();

// Logging middleware
app.use(async (ctx, next) => {
  const start = Date.now();
  const requestId = crypto.randomUUID();
  ctx.state.requestId = requestId;
  
  // Add request ID to response headers for tracking
  ctx.response.headers.set("X-Request-ID", requestId);
  
  try {
    await next();
    
    const ms = Date.now() - start;
    const logLevel = ctx.response.status >= 400 ? "warning" : "info";
    
    logger[logLevel](`${ctx.request.method} ${ctx.request.url.pathname} - ${ctx.response.status} - ${ms}ms - ${requestId}`);
  } catch (err) {
    const ms = Date.now() - start;
    logger.error(`Error processing ${ctx.request.method} ${ctx.request.url.pathname} - ${ms}ms - ${requestId}`, err);
    throw err;
  }
});

// Apply security middleware
configureSecurityMiddleware(app);

// Global error handling
app.use(errorHandler);

// Apply data sanitization middleware
applyGlobalSanitization(app);

// CORS configuration - using oakCors instead of cors
app.use(oakCors(corsConfig()));

// Apply caching middleware to specific routes (customize as needed)
const applyCaching = (router: Router) => {
  // Example: Cache GET requests to /api/analysis/* for 5 minutes
  router.get("/api/analysis/:id", cacheMiddleware({ ttl: 300 }));
  
  // Example: Cache GET requests to /api/transcripts/public/* for 10 minutes
  router.get("/api/transcripts/public/:id", cacheMiddleware({ ttl: 600 }));
};

// Apply caching to routes
try {
  applyCaching(router);
} catch (error) {
  logger.warning("Failed to apply caching middleware", error);
}

// Routes
app.use(userRoutes.routes());
app.use(userRoutes.allowedMethods());

app.use(transcriptRoutes.routes());
app.use(transcriptRoutes.allowedMethods());

app.use(analysisRoutes.routes());
app.use(analysisRoutes.allowedMethods());

// Health Check endpoint
router.get("/health", (ctx) => {
  ctx.response.body = { 
    status: "ok", 
    timestamp: new Date(),
    services: {
      database: true, // Add actual health check status here
      redis: true,    // Add actual redis check status here
      discord: true,  // Add actual discord connection status
      socket: true    // Add actual socket status
    }
  };
});

// API version endpoint
router.get("/api/version", (ctx) => {
  ctx.response.body = {
    version: getEnv("API_VERSION", "1.0.0"),
    environment: getEnv("ENV", "development")
  };
});

app.use(router.routes());
app.use(router.allowedMethods());

// Not found handler
app.use(notFoundHandler);

// Start WebSocket server
try {
  const socketServer = await setupSocketServer(app);
  logger.info("WebSocket server is ready");
} catch (error) {
  logger.warning("Failed to start WebSocket server", error);
}

// Initialize Discord bot if enabled
const ENABLE_DISCORD_BOT = getEnv("ENABLE_DISCORD_BOT", "false") === "true";
if (ENABLE_DISCORD_BOT) {
  try {
    await initDiscordBot();
    logger.info("Discord bot initialized");
  } catch (err) {
    logger.error("Failed to initialize Discord bot:", err);
  }
}

// Initialize Google Meet integration if enabled
const ENABLE_GMEET_INTEGRATION = getEnv("ENABLE_GMEET_INTEGRATION", "false") === "true";
if (ENABLE_GMEET_INTEGRATION) {
  try {
    await initGoogleMeetIntegration();
    logger.info("Google Meet integration initialized");
  } catch (err) {
    logger.error("Failed to initialize Google Meet integration:", err);
  }
}

// Start HTTP server
const port = parseInt(getEnv("PORT", "8000"));
const hostname = getEnv("HOST", "0.0.0.0");

logger.info(`Server starting on http://${hostname}:${port}`);
logger.info(`Environment: ${getEnv("ENV", "development")}`);

await app.listen({ port, hostname });