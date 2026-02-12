import type { Chunk } from "./types";

/**
 * Approximate max characters per chunk.
 * Estimated at ~4 chars per token, targeting ~512 tokens.
 */
const MAX_CHUNK_CHARS = 2048;

/**
 * Heading-aware markdown chunker.
 *
 * Splits markdown content at heading boundaries (#, ##, ###).
 * When a section between headings exceeds MAX_CHUNK_CHARS, it is further
 * split at paragraph boundaries (double newlines) with a small overlap
 * (the last line of the previous sub-chunk is included as the first line
 * of the next).
 */
export function chunkMarkdown(
  content: string,
  filePath: string,
): Chunk[] {
  if (!content.trim()) {
    return [];
  }

  const lines = content.split("\n");
  const chunks: Chunk[] = [];
  let currentHeading = "";
  let currentLines: string[] = [];
  let chunkStartLine = 1; // 1-indexed

  const flushChunk = (endLine: number) => {
    if (currentLines.length === 0) return;

    const chunkContent = currentLines.join("\n");

    if (chunkContent.length > MAX_CHUNK_CHARS) {
      // Split further at paragraph boundaries
      const subChunks = splitAtParagraphs(
        currentLines,
        chunkStartLine,
        filePath,
        currentHeading,
      );
      chunks.push(...subChunks);
    } else {
      chunks.push({
        content: chunkContent,
        filePath,
        heading: currentHeading,
        startLine: chunkStartLine,
        endLine,
      });
    }

    currentLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);

    if (headingMatch && currentLines.length > 0) {
      // Flush the accumulated chunk before this heading
      flushChunk(i); // endLine is the line before this one (i is 0-indexed, but endLine = i means line i in 1-indexed)
      chunkStartLine = i + 1; // next chunk starts at this heading (1-indexed)
    }

    if (headingMatch) {
      currentHeading = headingMatch[2];
    }

    currentLines.push(line);
  }

  // Flush remaining content
  if (currentLines.length > 0) {
    flushChunk(lines.length);
  }

  return chunks;
}

/**
 * Split lines at paragraph boundaries (double newlines) when content is too long.
 * Includes a small overlap: the last line of the previous sub-chunk becomes
 * the first line of the next.
 */
function splitAtParagraphs(
  lines: string[],
  startLine: number,
  filePath: string,
  heading: string,
): Chunk[] {
  const chunks: Chunk[] = [];
  let currentSubLines: string[] = [];
  let subStartLine = startLine;
  let currentLength = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    currentSubLines.push(line);
    currentLength += line.length + 1; // +1 for newline

    // Check if we hit a paragraph boundary and are over the limit
    const isBlankLine = line.trim() === "";
    const nextIsBlank = i + 1 < lines.length && lines[i + 1].trim() === "";
    const atParagraphBoundary = isBlankLine && !nextIsBlank;

    if (atParagraphBoundary && currentLength > MAX_CHUNK_CHARS) {
      const endLine = subStartLine + currentSubLines.length - 1;
      chunks.push({
        content: currentSubLines.join("\n"),
        filePath,
        heading,
        startLine: subStartLine,
        endLine,
      });

      // Overlap: carry the last line forward
      const lastLine = currentSubLines[currentSubLines.length - 1];
      currentSubLines = [lastLine];
      subStartLine = endLine;
      currentLength = lastLine.length + 1;
    }
  }

  // Flush remaining
  if (currentSubLines.length > 0) {
    chunks.push({
      content: currentSubLines.join("\n"),
      filePath,
      heading,
      startLine: subStartLine,
      endLine: startLine + lines.length - 1,
    });
  }

  return chunks;
}
