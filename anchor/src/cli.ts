#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { pino } from "pino";
import { loadConfigFromEnv } from "./config.js";
import { buildAnchorService } from "./main.js";

const program = new Command();
program
  .name("wstdiem-anchor")
  .description("wstDIEM v0.1.0-rc1 anchor submitter service")
  .version("0.1.0");

program
  .command("run")
  .description("Start the anchor submitter loop")
  .action(async () => {
    const config = loadConfigFromEnv();
    const logger = pino({ level: config.logLevel });
    const service = buildAnchorService({ config, logger });

    const shutdown = async () => {
      logger.info("shutdown signal received");
      try {
        await service.stop();
      } finally {
        process.exit(0);
      }
    };
    process.once("SIGINT", () => void shutdown());
    process.once("SIGTERM", () => void shutdown());

    await service.start();
    logger.info(
      {
        chainId: config.chainId,
        indexerApiUrl: config.indexerApiUrl,
        anchorRegistry: config.anchorRegistryAddress,
      },
      "anchor submitter running",
    );
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
