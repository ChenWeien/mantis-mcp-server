import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { log } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const booleanFromEnv = z
  .union([z.boolean(), z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
    }
    return undefined;
  });

const ConfigSchema = z.object({
  MANTIS_API_URL: z.string().url().default("https://mantisbt.org/bugs/api/rest"),
  MANTIS_API_KEY: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  CACHE_ENABLED: booleanFromEnv.default(true),
  CACHE_TTL_SECONDS: z.coerce.number().default(300),
  LOG_DIR: z.string().default(path.join(__dirname, "../../logs")),
  ENABLE_FILE_LOGGING: booleanFromEnv.default(false),
});

const parseConfig = () => {
  try {
    const parsedConfig = ConfigSchema.parse({
      MANTIS_API_URL: process.env.MANTIS_API_URL,
      MANTIS_API_KEY: process.env.MANTIS_API_KEY,
      NODE_ENV: process.env.NODE_ENV,
      LOG_LEVEL: process.env.LOG_LEVEL,
      CACHE_ENABLED: process.env.CACHE_ENABLED,
      CACHE_TTL_SECONDS: process.env.CACHE_TTL_SECONDS,
      LOG_DIR: process.env.LOG_DIR,
      ENABLE_FILE_LOGGING: process.env.ENABLE_FILE_LOGGING,
    });

    if (parsedConfig.ENABLE_FILE_LOGGING) {
      try {
        const logDir = path.resolve(parsedConfig.LOG_DIR);
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
      } catch (error: unknown) {
        log.warn("Unable to create log directory; file logging disabled.", {
          dir: parsedConfig.LOG_DIR,
          error: error instanceof Error ? error.message : String(error),
        });
        parsedConfig.ENABLE_FILE_LOGGING = false;
      }
    }

    if (!parsedConfig.MANTIS_API_KEY) {
      log.warn("MANTIS_API_KEY is not set. Mantis API calls will fail until it is configured.");
    }

    if (parsedConfig.MANTIS_API_URL === "https://mantisbt.org/bugs/api/rest") {
      log.warn("Using the default Mantis API URL. Set MANTIS_API_URL for your own Mantis instance.");
    }

    return parsedConfig;
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      log.warn("Invalid configuration; falling back to defaults.", {
        errors: error.errors.map((err) => `${err.path.join(".")}: ${err.message}`),
      });
      return ConfigSchema.parse({});
    }

    log.error("Unexpected configuration error; falling back to defaults.", {
      error: error instanceof Error ? error.message : String(error),
    });
    return ConfigSchema.parse({});
  }
};

export const config = parseConfig();

export const isMantisConfigured = () => {
  return Boolean(config.MANTIS_API_KEY);
};

export default config;
