#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config, isMantisConfigured } from "./config/index.js";
import { createServer } from "./server.js";
import { log } from "./utils/logger.js";

async function main() {
  log.info("Starting Mantis MCP Server", {
    apiUrl: config.MANTIS_API_URL,
    apiConfigured: isMantisConfigured(),
    environment: config.NODE_ENV,
    logLevel: config.LOG_LEVEL,
    cacheEnabled: config.CACHE_ENABLED,
    cacheTtlSeconds: config.CACHE_TTL_SECONDS,
    fileLogging: config.ENABLE_FILE_LOGGING,
  });

  if (!isMantisConfigured()) {
    log.warn("Mantis API key is missing. Set MANTIS_API_KEY before using Mantis tools.");
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("Mantis MCP Server connected over stdio.");
}

main().catch((error) => {
  log.error("Mantis MCP Server failed to start.", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
