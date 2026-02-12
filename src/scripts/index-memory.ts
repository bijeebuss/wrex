/**
 * Bootstrap script: indexes all markdown files in the memory/ directory.
 *
 * Usage: npx tsx src/scripts/index-memory.ts
 *
 * IMPORTANT: Uses console.error for all output (this script may be invoked
 * in contexts where stdout is reserved).
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { indexFile, ensureTables } from "../lib/memory/indexer.js";
import { disposeEmbedder } from "../lib/memory/embedder.js";

async function main() {
  ensureTables();

  const dir = "./memory";
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));

  if (files.length === 0) {
    console.error("No markdown files found in memory/ directory.");
    process.exit(0);
  }

  let totalChunks = 0;
  for (const file of files) {
    const count = await indexFile(join(dir, file));
    totalChunks += count;
  }

  console.error(
    `Indexed ${totalChunks} chunks from ${files.length} file(s).`,
  );

  await disposeEmbedder();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
