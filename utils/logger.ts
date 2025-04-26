// server/utils/logger.ts
import * as log from "$std/log/mod.ts";

// Create logs directory if it doesn't exist
try {
  Deno.mkdirSync("./logs", { recursive: true });
} catch (error) {
  if (!(error instanceof Deno.errors.AlreadyExists)) {
    console.error("Failed to create logs directory:", error);
  }
}

// Configure logging
await log.setup({
  handlers: {
    console: new log.handlers.ConsoleHandler("DEBUG", {
      formatter: (record) => {
        const time = new Date().toISOString();
        const levelName = record.levelName;
        const msg = record.msg;
        
        // Format the output with colors based on log level
        let color = "";
        if (record.level === log.LogLevels.INFO) {
          color = "\x1b[36m"; // Cyan
        } else if (record.level === log.LogLevels.WARNING) {
          color = "\x1b[33m"; // Yellow
        } else if (record.level === log.LogLevels.ERROR || record.level === log.LogLevels.CRITICAL) {
          color = "\x1b[31m"; // Red
        } else if (record.level === log.LogLevels.DEBUG) {
          color = "\x1b[35m"; // Magenta
        }
        
        const resetColor = "\x1b[0m";
        return `${color}[${time}] [${levelName}]${resetColor} ${msg}`;
      },
    }),
    file: new log.handlers.FileHandler("INFO", {
      filename: "./logs/context-sensei.log",
      formatter: (record) => {
        return JSON.stringify({
          timestamp: new Date().toISOString(),
          level: record.levelName,
          message: record.msg,
          ...record.args[0],
        });
      },
    }),
  },
  
  loggers: {
    default: {
      level: "INFO",
      handlers: ["console", "file"],
    },
  },
});

// Create a logger instance
const logger = log.getLogger();

// Set log level from environment variable
const logLevel = Deno.env.get("LOG_LEVEL")?.toUpperCase() || "INFO";
if (Object.keys(log.LogLevels).includes(logLevel)) {
  logger.level = log.LogLevels[logLevel as keyof typeof log.LogLevels];
}

export { logger };

