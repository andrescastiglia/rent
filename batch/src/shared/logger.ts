import winston from 'winston';
import 'winston-daily-rotate-file';
import * as _path from 'path';

const logLevel = process.env.LOG_LEVEL || 'info';

// Allow overriding an exact log path via CLI/env: LOG_FILE
// If LOG_FILE is provided and doesn't include "%DATE%", insert `-%DATE%` before the extension
let logDir = process.env.LOG_DIR || './logs';
let filenamePattern = 'batch-%DATE%.log';
if (process.env.LOG_FILE) {
    const provided = _path.resolve(process.env.LOG_FILE);
    logDir = _path.dirname(provided);
    let base = _path.basename(provided);
    if (!base.includes('%DATE%')) {
        const m = base.match(/(.*?)(\.[^.]*)$/);
        if (m) {
            base = `${m[1]}-%DATE%${m[2]}`;
        } else {
            base = `${base}-%DATE%`;
        }
    }
    filenamePattern = base;
}

/**
 * Custom log format for structured logging.
 */
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, ...metadata }) => {
        let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
        if (Object.keys(metadata).length > 0) {
            msg += ` ${JSON.stringify(metadata)}`;
        }
        return msg;
    })
);

/**
 * Rotating file transport for production logs.
 */
const fileTransport = new winston.transports.DailyRotateFile({
    dirname: logDir,
    filename: filenamePattern,
    datePattern: 'YYYY-MM-DD',
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    maxFiles: process.env.LOG_MAX_FILES || '14d',
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
 * Writes to console and rotating files.
 */
export const logger = winston.createLogger({
    level: logLevel,
    defaultMeta: { service: 'billing-batch' },
    transports: [consoleTransport, fileTransport],
    exceptionHandlers: [
        new winston.transports.DailyRotateFile({
            dirname: logDir,
            filename: 'exceptions-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '14d',
        }),
    ],
    rejectionHandlers: [
        new winston.transports.DailyRotateFile({
            dirname: logDir,
            filename: 'rejections-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '14d',
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
