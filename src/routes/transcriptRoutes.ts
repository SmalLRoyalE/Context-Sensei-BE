import { Router } from "oak";
import { logger } from "../utils/logger.ts";
import { cacheMiddleware } from "../middlewares/cache.ts";

const router = new Router();

// Get all transcripts (demo)
router.get("/api/transcripts", async (ctx) => {
  // In a real app, query database for user's transcripts
  ctx.response.body = [
    {
      id: "transcript-1",
      title: "Product Meeting - April 2025",
      createdAt: "2025-04-22T10:00:00Z",
      updatedAt: "2025-04-22T11:00:00Z",
      duration: 3600,
      speakers: ["John", "Maria", "Tom", "Sarah", "Raj"],
    },
    {
      id: "transcript-2",
      title: "Weekly Standup - April 2025",
      createdAt: "2025-04-20T09:00:00Z",
      updatedAt: "2025-04-20T09:30:00Z",
      duration: 1800,
      speakers: ["John", "Sarah", "Raj"],
    }
  ];
});

// Get public transcripts with caching enabled
router.get("/api/transcripts/public/:id", cacheMiddleware({ ttl: 300 }), async (ctx) => {
  const id = ctx.params.id;
  
  // Demo response
  ctx.response.body = {
    id,
    title: `Public Transcript ${id}`,
    createdAt: "2025-04-15T14:00:00Z",
    content: "This is a public transcript that demonstrates caching. If you refresh quickly, this should be served from cache.",
    speakers: ["Speaker 1", "Speaker 2"]
  };
});

// Get a specific transcript (demo)
router.get("/api/transcripts/:id", async (ctx) => {
  const id = ctx.params.id;
  
  // Demo transcript data 
  ctx.response.body = {
    id,
    title: "Product Meeting - April 2025",
    createdAt: "2025-04-22T10:00:00Z",
    updatedAt: "2025-04-22T11:00:00Z",
    duration: 3600,
    speakers: ["John", "Maria", "Tom", "Sarah", "Raj"],
    content: `Meeting Transcript: Product Development Team - April 22, 2025
Duration: 45 minutes
Participants: John Smith (JS), Maria Rodriguez (MR), Raj Patel (RP), Sarah Lee (SL), Tom Wilson (TW)

JS: Good morning everyone. Thanks for joining today's meeting. Our main agenda is to review the progress on the Context Sensei project.

MR: Before we start, I'd like to address the issue with our caching mechanism.

RP: I noticed that too. The Redis cache hit rate is only around 60%, which is lower than expected.

JS: Good point. Let's make that a priority.`
  };
});

// Upload a new transcript (demo)
router.post("/api/transcripts", async (ctx) => {
  const result = await ctx.request.body.json();
  logger.info("Received transcript upload request", { title: result.title });
  
  ctx.response.status = 201;
  ctx.response.body = { 
    id: "new-transcript-" + Date.now(),
    message: "Transcript uploaded successfully" 
  };
});

// Update a transcript (demo)
router.put("/api/transcripts/:id", async (ctx) => {
  const id = ctx.params.id;
  const result = await ctx.request.body.json();
  
  logger.info(`Updating transcript ${id}`, { title: result.title });
  
  ctx.response.body = { 
    id,
    message: "Transcript updated successfully" 
  };
});

// Delete a transcript (demo)
router.delete("/api/transcripts/:id", async (ctx) => {
  const id = ctx.params.id;
  
  logger.info(`Deleting transcript ${id}`);
  
  ctx.response.body = { 
    message: "Transcript deleted successfully" 
  };
});

export { router as transcriptRoutes };