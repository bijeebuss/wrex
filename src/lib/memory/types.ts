export interface Chunk {
  content: string;
  filePath: string;
  heading: string; // nearest parent heading (empty string if none)
  startLine: number; // 1-indexed
  endLine: number; // 1-indexed, inclusive
}

export interface EmbeddedChunk extends Chunk {
  embedding: number[]; // 768-dimensional float vector
}

export const EMBEDDING_DIM = 768;
