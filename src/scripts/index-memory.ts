/**
 * Bootstrap script: indexes all markdown files in the memory directory.
 *
 * Usage: npx tsx src/scripts/index-memory.ts
 *
 * Uses MEMORY_DIR env var or defaults to ./data/workspace/memory.
 *
 * IMPORTANT: Uses console.error for all output (this script may be invoked
 * in contexts where stdout is reserved).
 */

import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { indexFile, ensureTables } from "../lib/memory/indexer.js";
import { disposeEmbedder } from "../lib/memory/embedder.js";

async function main() {
  ensureTables();

  const dir = resolve(process.env.MEMORY_DIR || "./data/workspace/memory");
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));

  if (files.length === 0) {
    console.error(`No markdown files found in ${dir}.`);
    process.exit(0);
  }

  let totalChunks = 0;
  for (const file of files) {
    const count = await indexFile(join(dir, file));
    totalChunks += count;
  }

  console.error(
    `Indexed ${totalChunks} chunks from ${files.length} file(s) in ${dir}.`,
  );

  await disposeEmbedder();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
