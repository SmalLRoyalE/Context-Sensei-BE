import { Context, Status } from "oak";
import { ensureDir, exists } from "$std/fs/mod.ts";
import { join, extname } from "$std/path/mod.ts";
import { v4 as uuid } from "uuid";
import { logger } from "../../utils/logger.ts";

// Configure upload settings
const UPLOAD_DIR = "./uploads";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = {
  audio: [".mp3", ".wav", ".m4a", ".ogg", ".flac"],
  document: [".pdf", ".doc", ".docx", ".txt", ".md", ".json"],
  transcript: [".vtt", ".srt", ".txt", ".json"],
  image: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
};

/**
 * Ensure upload directories exist
 */
async function ensureUploadDirectories() {
  await ensureDir(UPLOAD_DIR);
  await ensureDir(join(UPLOAD_DIR, "audio"));
  await ensureDir(join(UPLOAD_DIR, "document"));
  await ensureDir(join(UPLOAD_DIR, "transcript"));
  await ensureDir(join(UPLOAD_DIR, "image"));
  await ensureDir(join(UPLOAD_DIR, "temp"));
}

// Initialize directories on startup
ensureUploadDirectories().catch((err) => {
  logger.error("Failed to create upload directories", err);
});

/**
 * Get the appropriate subdirectory based on file extension
 */
function getUploadTypeByExtension(fileExt: string): string | null {
  for (const [type, extensions] of Object.entries(ALLOWED_TYPES)) {
    if (extensions.includes(fileExt.toLowerCase())) {
      return type;
    }
  }
  return null;
}

/**
 * Validate file before upload
 */
function validateFile(fileName: string, fileSize: number): { 
  valid: boolean; 
  error?: string;
  fileType?: string;
} {
  // Check file size
  if (fileSize > MAX_FILE_SIZE) {
    return { 
      valid: false, 
      error: `File size exceeds maximum allowed (${MAX_FILE_SIZE / 1024 / 1024}MB)` 
    };
  }

  // Check file extension
  const ext = extname(fileName);
  const fileType = getUploadTypeByExtension(ext);
  
  if (!fileType) {
    return { 
      valid: false, 
      error: `Unsupported file type: ${ext}` 
    };
  }

  return { valid: true, fileType };
}

/**
 * Generate a unique filename
 */
function generateUniqueFilename(originalName: string): string {
  const ext = extname(originalName);
  const uniqueId = uuid();
  return `${uniqueId}${ext}`;
}

/**
 * File upload middleware factory
 */
export function handleFileUpload(formFieldName: string = "file") {
  return async (ctx: Context, next: () => Promise<unknown>) => {
    try {
      const body = await ctx.request.body({ type: "form-data" });
      const formData = await body.value.read({ maxFileSize: MAX_FILE_SIZE });
      
      if (!formData.files || formData.files.length === 0) {
        ctx.response.status = Status.BadRequest;
        ctx.response.body = { error: "No file provided" };
        return;
      }
      
      const uploadedFile = formData.files.find((f) => f.name === formFieldName);
      
      if (!uploadedFile) {
        ctx.response.status = Status.BadRequest;
        ctx.response.body = { error: `No file found with field name '${formFieldName}'` };
        return;
      }
      
      // Validate file
      const validation = validateFile(uploadedFile.filename, uploadedFile.size);
      
      if (!validation.valid) {
        ctx.response.status = Status.BadRequest;
        ctx.response.body = { error: validation.error };
        return;
      }
      
      // Generate unique filename
      const uniqueFilename = generateUniqueFilename(uploadedFile.filename);
      const fileType = validation.fileType as string;
      const uploadPath = join(UPLOAD_DIR, fileType, uniqueFilename);
      
      // Copy the file to the upload directory
      await Deno.copyFile(uploadedFile.filename, uploadPath);
      
      // Add file info to the request
      ctx.state.uploadedFile = {
        originalName: uploadedFile.filename,
        filename: uniqueFilename,
        path: uploadPath,
        size: uploadedFile.size,
        type: fileType,
        contentType: uploadedFile.contentType,
      };
      
      logger.info(`File uploaded: ${uniqueFilename} (${fileType}, ${uploadedFile.size} bytes)`);
      
      await next();
    } catch (error) {
      if (error.name === "TypeError" && error.message.includes("maxFileSize")) {
        ctx.response.status = Status.PayloadTooLarge;
        ctx.response.body = { 
          error: `File size exceeds maximum allowed (${MAX_FILE_SIZE / 1024 / 1024}MB)` 
        };
        return;
      }
      
      logger.error("File upload error", error);
      
      ctx.response.status = Status.InternalServerError;
      ctx.response.body = { error: "Failed to process file upload" };
    }
  };
}

