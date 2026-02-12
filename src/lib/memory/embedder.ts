import { getLlama, resolveModelFile } from "node-llama-cpp";
import path from "node:path";
import { EMBEDDING_DIM } from "./types";

/**
 * Singleton embedding service wrapping node-llama-cpp.
 *
 * Uses nomic-embed-text-v1.5 Q8_0 GGUF model for local 768-dim embeddings.
 * Enforces task prefix (search_document / search_query) as required by
 * the nomic-embed-text model family.
 *
 * IMPORTANT: Never use console.log in this module -- it will be used by
 * the MCP server which communicates over stdout.
 */

type EmbeddingContext = Awaited<
  ReturnType<
    Awaited<ReturnType<Awaited<ReturnType<typeof getLlama>>["loadModel"]>>["createEmbeddingContext"]
  >
>;

let embeddingContext: EmbeddingContext | null = null;
let initPromise: Promise<EmbeddingContext> | null = null;

/**
 * Get or create the singleton embedding context.
 * Loads the GGUF model on first call (takes a few seconds).
 * Subsequent calls return the cached context instantly.
 */
export async function getEmbedder(): Promise<EmbeddingContext> {
  if (embeddingContext) return embeddingContext;

  // Prevent concurrent initialization
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const modelPath = await resolveModelFile(
        "hf:nomic-ai/nomic-embed-text-v1.5-GGUF:Q8_0",
        path.join(process.cwd(), "models"),
      );

      const llama = await getLlama();
      const model = await llama.loadModel({ modelPath });
      embeddingContext = await model.createEmbeddingContext();

      console.error(
        `[embedder] Model loaded: nomic-embed-text-v1.5 Q8_0 (${EMBEDDING_DIM}-dim)`,
      );

      return embeddingContext;
    } catch (err) {
      initPromise = null;
      const message =
        err instanceof Error ? err.message : String(err);

      if (message.includes("ENOENT") || message.includes("not found")) {
        throw new Error(
          `Embedding model not found. Run "npm run models:pull" to download the model.\nOriginal error: ${message}`,
        );
      }

      throw new Error(`Failed to load embedding model: ${message}`);
    }
  })();

  return initPromise;
}

/**
 * Embed text with the required task prefix.
 *
 * nomic-embed-text models require task prefixes for correct embedding behavior:
 * - "search_document" for indexing documents
 * - "search_query" for search queries
 *
 * @returns 768-dimensional float vector
 */
export async function embed(
  text: string,
  type: "search_document" | "search_query",
): Promise<number[]> {
  const ctx = await getEmbedder();
  const prefixedText = `${type}: ${text}`;

  try {
    const result = await ctx.getEmbeddingFor(prefixedText);
    const vector = Array.from(result.vector);

    if (vector.length !== EMBEDDING_DIM) {
      throw new Error(
        `Expected ${EMBEDDING_DIM}-dim vector, got ${vector.length}-dim`,
      );
    }

    return vector;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[embedder] Embedding failed for text: "${text.slice(0, 80)}...": ${message}`);
    throw err;
  }
}

/**
 * Embed multiple texts with the required task prefix.
 * Processes sequentially since node-llama-cpp's embedding context
 * handles one request at a time.
 *
 * @returns Array of 768-dimensional float vectors
 */
export async function embedBatch(
  texts: string[],
  type: "search_document" | "search_query",
): Promise<number[][]> {
  const results: number[][] = [];

  for (const text of texts) {
    results.push(await embed(text, type));
  }

  return results;
}

/**
 * Release the embedding model resources.
 * Call this for clean shutdown of the MCP server.
 */
export async function disposeEmbedder(): Promise<void> {
  if (embeddingContext) {
    embeddingContext.dispose();
    embeddingContext = null;
    initPromise = null;
    console.error("[embedder] Embedding context disposed");
  }
}
