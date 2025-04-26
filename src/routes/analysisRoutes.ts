import { Router } from "oak";
import { logger } from "../utils/logger.ts";
import { cacheMiddleware } from "../middlewares/cache.ts";

const router = new Router();

// Get analysis for a transcript with caching enabled
router.get("/api/analysis/:id", cacheMiddleware({ ttl: 300 }), async (ctx) => {
  const id = ctx.params.id;
  logger.info(`Getting analysis for transcript ${id}`);
  
  // In a real app, this would retrieve analysis from a database
  // or generate it on demand with AI services
  ctx.response.body = {
    transcriptId: id,
    summary: "Meeting about Context Sensei product development focusing on Redis caching issues, transcript processing delays, Discord bot integration, and Google Meet disconnection problems. The team agreed to prioritize fixing critical issues before the next sprint.",
    keyDecisions: [
      "Tom will fix the Google Meet token expiration issue by Thursday",
      "Sarah will investigate transcript processing delays and report by Friday",
      "Raj will continue working on the Discord voice recording feature",
      "Next sprint will focus on data sanitization and PII detection"
    ],
    actionItems: [
      {
        owner: "Tom",
        task: "Fix Google Meet token expiration issue",
        deadline: "Thursday"
      },
      {
        owner: "Sarah", 
        task: "Investigate transcript processing delays",
        deadline: "Friday"
      },
      {
        owner: "Raj",
        task: "Complete Discord voice channel recording feature",
        deadline: "Next week"
      },
      {
        owner: "Maria",
        task: "Set up user interviews",
        deadline: "Next week"
      }
    ],
    sentimentAnalysis: {
      overall: "neutral",
      perParticipant: {
        "John": "positive",
        "Maria": "neutral",
        "Raj": "neutral",
        "Sarah": "concerned",
        "Tom": "neutral"
      }
    },
    participants: [
      {
        id: "JS",
        name: "John Smith",
        role: "Meeting Leader",
        speakingTime: 350,
        contributions: 8
      },
      {
        id: "MR",
        name: "Maria Rodriguez",
        speakingTime: 230,
        contributions: 4
      },
      {
        id: "RP",
        name: "Raj Patel",
        speakingTime: 200,
        contributions: 4
      },
      {
        id: "SL",
        name: "Sarah Lee",
        speakingTime: 180,
        contributions: 3
      },
      {
        id: "TW",
        name: "Tom Wilson",
        speakingTime: 210,
        contributions: 3
      }
    ],
    createdAt: new Date().toISOString()
  };
});

// Generate a new analysis
router.post("/api/analysis", async (ctx) => {
  try {
    const body = await ctx.request.body.json();
    const { transcriptId, text } = body;

    if (!transcriptId || !text) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Missing required fields: transcriptId and text" };
      return;
    }

    logger.info(`Generating new analysis for transcript ${transcriptId}`);
    
    // In a real app, this would send the text to an AI service for analysis
    // For demo purposes, we'll simulate a delayed response
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    ctx.response.status = 201;
    ctx.response.body = {
      id: `analysis-${Date.now()}`,
      transcriptId,
      summary: "This is a demo analysis of the transcript. In a real application, this would be generated using AI models based on the transcript content.",
      keyDecisions: [
        "Decision point 1 extracted from transcript",
        "Decision point 2 extracted from transcript",
        "Decision point 3 extracted from transcript"
      ],
      actionItems: [
        {
          owner: "Person A",
          task: "Complete task X",
          deadline: "Next week"
        },
        {
          owner: "Person B", 
          task: "Review document Y",
          deadline: "Tomorrow"
        }
      ],
      createdAt: new Date().toISOString()
    };
  } catch (error) {
    logger.error("Error generating analysis", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to generate analysis" };
  }
});

// Share analysis
router.post("/api/analysis/:id/share", async (ctx) => {
  const id = ctx.params.id;
  const body = await ctx.request.body.json();
  const { email, permission } = body;
  
  logger.info(`Sharing analysis ${id} with ${email}`);
  
  ctx.response.body = {
    success: true,
    message: `Analysis shared with ${email}`,
    shareId: `share-${Date.now()}`
  };
});

// Delete analysis
router.delete("/api/analysis/:id", async (ctx) => {
  const id = ctx.params.id;
  
  logger.info(`Deleting analysis ${id}`);
  
  ctx.response.body = {
    success: true,
    message: "Analysis deleted successfully"
  };
});

export { router as analysisRoutes };