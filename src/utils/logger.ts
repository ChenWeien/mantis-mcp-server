import path from "path";
import winston from "winston";

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

const logLevel = process.env.LOG_LEVEL || "info";
const enableFileLogging = process.env.ENABLE_FILE_LOGGING === "true";
const logDir = process.env.LOG_DIR || path.join(process.cwd(), "logs");

export const log = winston.createLogger({
  level: logLevel,
  format: logFormat,
  silent: !enableFileLogging,
  transports: [],
});

if (enableFileLogging) {
  log.silent = false;
  log.add(
    new winston.transports.File({
      filename: path.join(logDir, "mantis-mcp-server-combined.log"),
      maxsize: 5_242_880,
      maxFiles: 5,
    })
  );

  log.add(
    new winston.transports.File({
      filename: path.join(logDir, "mantis-mcp-server-error.log"),
      level: "error",
      maxsize: 5_242_880,
      maxFiles: 5,
    })
  );
}
