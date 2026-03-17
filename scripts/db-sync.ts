#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type SyncDirection = "pull" | "push";

const argv = process.argv.slice(2);
const direction = (argv[0] as SyncDirection | undefined) ?? "pull";
const force = argv.includes("--force");

if (direction !== "pull" && direction !== "push") {
  printUsageAndExit(1);
}

const localDatabaseUrl = process.env.LOCAL_DATABASE_URL ?? process.env.DATABASE_URL;
const productionDatabaseUrl =
  process.env.PRODUCTION_DATABASE_URL ?? process.env.RAILWAY_DATABASE_URL;

if (!localDatabaseUrl) {
  console.error("Erro: LOCAL_DATABASE_URL (ou DATABASE_URL) nao definido.");
  process.exit(1);
}

if (!productionDatabaseUrl) {
  console.error(
    "Erro: PRODUCTION_DATABASE_URL (ou RAILWAY_DATABASE_URL) nao definido."
  );
  process.exit(1);
}

if (localDatabaseUrl === productionDatabaseUrl) {
  console.error("Erro: banco local e producao apontam para a mesma URL.");
  process.exit(1);
}

if (direction === "push" && !force) {
  console.error(
    "Abortado: push para producao exige --force para evitar sobrescrita acidental."
  );
  console.error("Use: bun scripts/db-sync.ts push --force");
  process.exit(1);
}

ensureCommandExists("pg_dump");
ensureCommandExists("pg_restore");

const sourceUrl = direction === "pull" ? productionDatabaseUrl : localDatabaseUrl;
const targetUrl = direction === "pull" ? localDatabaseUrl : productionDatabaseUrl;
const sourceUrlForPgTools = normalizeForPgTools(sourceUrl);
const targetUrlForPgTools = normalizeForPgTools(targetUrl);

const sourceLabel = direction === "pull" ? "producao" : "local";
const targetLabel = direction === "pull" ? "local" : "producao";

const workspace = mkdtempSync(join(tmpdir(), "boatstats-db-sync-"));
const dumpPath = join(workspace, "database.dump");

try {
  console.log(`Iniciando sync ${direction}: ${sourceLabel} -> ${targetLabel}`);

  runCommand("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    `--dbname=${sourceUrlForPgTools}`,
    `--file=${dumpPath}`,
  ]);

  runCommand("pg_restore", [
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--single-transaction",
    `--dbname=${targetUrlForPgTools}`,
    dumpPath,
  ]);

  console.log("Sync finalizado com sucesso.");
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

function runCommand(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: "inherit" });

  if (result.error) {
    console.error(`Falha ao executar ${command}:`, result.error.message);
    process.exit(1);
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}

function ensureCommandExists(command: string): void {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore",
  });

  if (result.error || result.status !== 0) {
    console.error(
      `Erro: comando ${command} nao encontrado. Instale PostgreSQL client tools e tente novamente.`
    );
    process.exit(1);
  }
}

function printUsageAndExit(exitCode: number): never {
  console.error("Uso:");
  console.error("  bun scripts/db-sync.ts pull");
  console.error("  bun scripts/db-sync.ts push --force");
  process.exit(exitCode);
}

function normalizeForPgTools(databaseUrl: string): string {
  try {
    const parsedUrl = new URL(databaseUrl);
    const unsupportedParams = [
      "connection_limit",
      "pool_timeout",
      "schema",
      "pgbouncer",
      "statement_cache_size",
      "socket_timeout",
    ];

    for (const key of unsupportedParams) {
      parsedUrl.searchParams.delete(key);
    }

    return parsedUrl.toString();
  } catch {
    return databaseUrl;
  }
}
