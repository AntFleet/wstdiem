#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { pino } from "pino";
import { loadConfigFromEnv } from "./config.js";
import { closeDatabase, openDatabase } from "./db/client.js";
import { buildIndexer } from "./indexer.js";
import { buildApi } from "./api/server.js";

const program = new Command();
program
  .name("wstdiem-indexer")
  .description("wstDIEM v0.1.0-rc1 indexer service")
  .version("0.1.0");

program
  .command("run")
  .description("Start the indexer + HTTP API")
  .option("--no-api", "skip starting the HTTP API")
  .action(async (opts: { api: boolean }) => {
    const config = loadConfigFromEnv();
    const logger = pino({ level: config.logLevel });
    const db = openDatabase(config.databasePath);

    const indexer = buildIndexer({ config, db, logger });
    const api = opts.api ? buildApi({ config, db, logger }) : null;

    const shutdown = async () => {
      logger.info("shutdown signal received");
      try {
        await indexer.stop();
        if (api) await api.stop();
      } catch (err) {
        logger.error({ err }, "shutdown error");
      } finally {
        closeDatabase(db);
        process.exit(0);
      }
    };

    process.once("SIGINT", () => void shutdown());
    process.once("SIGTERM", () => void shutdown());

    await indexer.start();
    if (api) await api.start();
    logger.info(
      {
        chainId: config.chainId,
        startBlock: config.startBlock.toString(),
        apiPort: opts.api ? config.apiPort : null,
      },
      "indexer running",
    );
  });

program
  .command("status")
  .description("Print the current indexer head + last anchor snapshot")
  .action(async () => {
    const config = loadConfigFromEnv();
    const db = openDatabase(config.databasePath);
    try {
      const head = db
        .prepare("SELECT last_indexed_block, last_indexed_block_hash FROM head_tracker WHERE id = 1")
        .get();
      const snapshot = db
        .prepare("SELECT anchor_block, manifest_hash, submitter FROM anchor_snapshots ORDER BY anchor_block DESC LIMIT 1")
        .get();
      const commit = db
        .prepare("SELECT registry_version, merkle_root FROM registry_commits ORDER BY registry_version DESC LIMIT 1")
        .get();
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ head, snapshot, registry: commit }, null, 2));
    } finally {
      closeDatabase(db);
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
