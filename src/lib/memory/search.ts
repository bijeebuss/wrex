import { sqlite } from "../db/index";
import { embed } from "./embedder";
import { ensureTables } from "./indexer";

/**
 * Hybrid search combining sqlite-vec vector similarity and FTS5 keyword search
 * with Reciprocal Rank Fusion (RRF) scoring.
 *
 * IMPORTANT: No console.log -- module used by MCP server (stdout = JSON-RPC).
 */

export interface SearchResult {
  id: number;
  filePath: string;
  heading: string;
  content: string;
  startLine: number;
  endLine: number;
  score: number;
  sources: ("vector" | "keyword")[];
}

/**
 * Vector similarity search using sqlite-vec KNN.
 *
 * Embeds the query with "search_query" prefix, then finds the closest
 * vectors by cosine distance in the vec_memory_chunks table.
 *
 * @param query - Natural language search query
 * @param limit - Maximum results to return (default 10)
 * @returns Ranked search results with distance scores
 */
export async function vectorSearch(
  query: string,
  limit: number = 10,
): Promise<SearchResult[]> {
  ensureTables();

  // Check if there are any indexed chunks
  const countResult = sqlite
    .prepare("SELECT count(*) as c FROM vec_memory_chunks")
    .get() as { c: number };
  if (countResult.c === 0) return [];

  // Embed the query with search_query prefix
  const queryVec = await embed(query, "search_query");
  const f32 = new Float32Array(queryVec);
  const queryBuffer = Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);

  // Execute KNN query against sqlite-vec
  const vecResults = sqlite
    .prepare(
      `
      SELECT chunk_id, distance
      FROM vec_memory_chunks
      WHERE embedding MATCH ?
        AND k = ?
      ORDER BY distance
    `,
    )
    .all(queryBuffer, limit) as { chunk_id: number; distance: number }[];

  if (vecResults.length === 0) return [];

  // Batch-fetch metadata from memory_chunks
  const ids = vecResults.map((r) => r.chunk_id);
  const placeholders = ids.map(() => "?").join(",");
  const metadataRows = sqlite
    .prepare(
      `
      SELECT id, file_path, heading, content, start_line, end_line
      FROM memory_chunks
      WHERE id IN (${placeholders})
    `,
    )
    .all(...ids) as {
    id: number;
    file_path: string;
    heading: string;
    content: string;
    start_line: number;
    end_line: number;
  }[];

  // Create lookup for metadata
  const metaMap = new Map(metadataRows.map((m) => [m.id, m]));

  // Combine vec results with metadata, preserving ranking order
  const results: SearchResult[] = [];
  for (let i = 0; i < vecResults.length; i++) {
    const vec = vecResults[i];
    const meta = metaMap.get(vec.chunk_id);
    if (!meta) continue;

    results.push({
      id: meta.id,
      filePath: meta.file_path,
      heading: meta.heading,
      content: meta.content,
      startLine: meta.start_line,
      endLine: meta.end_line,
      score: vec.distance,
      sources: ["vector"],
    });
  }

  return results;
}

/**
 * Keyword search using FTS5 with BM25 ranking.
 *
 * Executes a full-text search against the fts_memory_chunks table.
 * Falls back gracefully on FTS5 syntax errors (e.g., special characters).
 *
 * @param query - Search query (FTS5 syntax supported)
 * @param limit - Maximum results to return (default 10)
 * @returns Ranked search results with BM25 scores
 */
export function keywordSearch(
  query: string,
  limit: number = 10,
): SearchResult[] {
  ensureTables();

  try {
    // FTS5 MATCH query with BM25 ranking (rank is negative, lower = better)
    const ftsResults = sqlite
      .prepare(
        `
        SELECT rowid, rank
        FROM fts_memory_chunks
        WHERE fts_memory_chunks MATCH ?
        ORDER BY rank
        LIMIT ?
      `,
      )
      .all(query, limit) as { rowid: number; rank: number }[];

    if (ftsResults.length === 0) return [];

    // Batch-fetch metadata from memory_chunks
    const ids = ftsResults.map((r) => r.rowid);
    const placeholders = ids.map(() => "?").join(",");
    const metadataRows = sqlite
      .prepare(
        `
        SELECT id, file_path, heading, content, start_line, end_line
        FROM memory_chunks
        WHERE id IN (${placeholders})
      `,
      )
      .all(...ids) as {
      id: number;
      file_path: string;
      heading: string;
      content: string;
      start_line: number;
      end_line: number;
    }[];

    const metaMap = new Map(metadataRows.map((m) => [m.id, m]));

    const results: SearchResult[] = [];
    for (let i = 0; i < ftsResults.length; i++) {
      const fts = ftsResults[i];
      const meta = metaMap.get(fts.rowid);
      if (!meta) continue;

      results.push({
        id: meta.id,
        filePath: meta.file_path,
        heading: meta.heading,
        content: meta.content,
        startLine: meta.start_line,
        endLine: meta.end_line,
        score: fts.rank,
        sources: ["keyword"],
      });
    }

    return results;
  } catch (err) {
    // FTS5 syntax errors (special characters, unmatched quotes, etc.)
    // Fall back to empty results rather than crashing
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[search] FTS5 query failed: ${message}`);
    return [];
  }
}

/**
 * Hybrid search combining vector similarity and FTS5 keyword search
 * using Reciprocal Rank Fusion (RRF) with k=60.
 *
 * Runs both searches in parallel with expanded result sets, then merges
 * using rank-based fusion for robust cross-method ranking.
 *
 * @param query - Natural language search query
 * @param limit - Maximum results to return (default 5)
 * @returns Unified ranked results with RRF scores and source attribution
 */
export async function hybridSearch(
  query: string,
  limit: number = 5,
): Promise<SearchResult[]> {
  ensureTables();

  const expandedLimit = limit * 2;

  // Run both searches (vector is async, keyword is sync)
  const [vecResults, ftsResults] = await Promise.all([
    vectorSearch(query, expandedLimit),
    Promise.resolve(keywordSearch(query, expandedLimit)),
  ]);

  // If both are empty, return empty
  if (vecResults.length === 0 && ftsResults.length === 0) return [];

  // Apply Reciprocal Rank Fusion (RRF) with k=60
  const RRF_K = 60;
  const scores = new Map<number, number>();
  const resultMap = new Map<number, SearchResult>();
  const sourceMap = new Map<number, Set<"vector" | "keyword">>();

  // Score vector results by rank
  for (let i = 0; i < vecResults.length; i++) {
    const r = vecResults[i];
    scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (i + 1 + RRF_K));
    resultMap.set(r.id, r);
    if (!sourceMap.has(r.id)) sourceMap.set(r.id, new Set());
    sourceMap.get(r.id)!.add("vector");
  }

  // Score keyword results by rank
  for (let i = 0; i < ftsResults.length; i++) {
    const r = ftsResults[i];
    scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (i + 1 + RRF_K));
    if (!resultMap.has(r.id)) resultMap.set(r.id, r);
    if (!sourceMap.has(r.id)) sourceMap.set(r.id, new Set());
    sourceMap.get(r.id)!.add("keyword");
  }

  // Sort by RRF score descending
  const ranked = [...scores.entries()]
    .sort((a, b) => b[1] - a[1]);

  // Deduplicate by content location (same heading + line range = same chunk,
  // even if indexed under different file path variants)
  const seen = new Set<string>();
  const deduped: SearchResult[] = [];
  for (const [id, score] of ranked) {
    const base = resultMap.get(id)!;
    const key = `${base.heading}:${base.startLine}-${base.endLine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({
      ...base,
      score,
      sources: [...sourceMap.get(id)!],
    });
    if (deduped.length >= limit) break;
  }

  return deduped;
}
