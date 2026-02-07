const winston = require("winston");
const path = require("path");
const { app } = require("electron");
const fs = require("fs");

const isDevelopment = process.env.NODE_ENV !== "production";

// Get writable log directory (works in both dev and production)
let logDir;
if (app && app.getPath) {
  // Production: use Electron's logs directory
  logDir = app.getPath("logs");
} else {
  // Fallback for development or if app is not ready
  logDir = path.join(__dirname, "../../../logs");
}

// Ensure log directory exists
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
} catch (error) {
  console.error("Failed to create log directory:", error.message);
  // Fallback to current directory
  logDir = path.join(__dirname, "../../../logs");
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch (fallbackError) {
    console.error(
      "Failed to create fallback log directory:",
      fallbackError.message,
    );
  }
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  }),
);

// Create logger instance
const logger = winston.createLogger({
  level: isDevelopment ? "debug" : "info",
  format: logFormat,
  transports: [
    // Console transport (colorized in development)
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), logFormat),
    }),
    // File transport - all logs
    new winston.transports.File({
      filename: path.join(logDir, "app.log"),
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
    }),
    // Error file transport - errors only
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
    }),
  ],
});

module.exports = logger;
