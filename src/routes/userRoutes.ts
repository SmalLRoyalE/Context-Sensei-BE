import { Router } from "oak";
import { logger } from "../utils/logger.ts";
import { generateCsrfToken } from "../middlewares/security.ts";

const router = new Router();

// Get CSRF token
router.get("/api/auth/csrf", async (ctx) => {
  const token = await generateCsrfToken(ctx);
  ctx.response.body = { token };
});

// User login (demo)
router.post("/api/auth/login", async (ctx) => {
  // In a real app, validate credentials and generate JWT
  ctx.response.body = { success: true, message: "Login successful" };
});

// User registration (demo)
router.post("/api/auth/register", async (ctx) => {
  // In a real app, validate and store user data
  ctx.response.body = { success: true, message: "Registration successful" };
});

// Get user profile (demo)
router.get("/api/users/profile", async (ctx) => {
  // In a real app, verify JWT and return user profile
  ctx.response.body = { 
    id: "demo-user-1",
    username: "demouser",
    email: "demo@example.com",
    name: "Demo User"
  };
});

export { router as userRoutes };