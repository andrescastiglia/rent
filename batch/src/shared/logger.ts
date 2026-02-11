import winston from "winston";
import * as fs from "node:fs";
import * as _path from "path";

const logLevel = process.env.LOG_LEVEL || "info";

let logDir = process.env.LOG_DIR || "./logs";
let logFile = _path.join(logDir, "batch.log");
if (process.env.LOG_FILE) {
  const provided = _path.resolve(process.env.LOG_FILE);
  logDir = _path.dirname(provided);
  logFile = provided;
}

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

/**
 * Custom log format for structured logging.
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  }),
);

/**
 * File transport (no rotation).
 */
const fileTransport = new winston.transports.File({
  filename: logFile,
  format: winston.format.combine(winston.format.uncolorize(), logFormat),
});

/**
 * Console transport for development and debugging.
 */
const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(winston.format.colorize(), logFormat),
});

/**
 * Winston logger instance.
 * Writes to console and a single log file.
 */
export const logger = winston.createLogger({
  level: logLevel,
  defaultMeta: { service: "billing-batch" },
  transports: [consoleTransport, fileTransport],
  exceptionHandlers: [
    new winston.transports.File({
      filename: _path.join(logDir, "exceptions.log"),
      format: winston.format.combine(winston.format.uncolorize(), logFormat),
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: _path.join(logDir, "rejections.log"),
      format: winston.format.combine(winston.format.uncolorize(), logFormat),
    }),
  ],
});

/**
 * Create a child logger with additional context.
 * @param context Additional metadata to include in logs.
 */
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
