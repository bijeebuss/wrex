import { KokoroTTS, TextSplitterStream } from "kokoro-js";

/**
 * Singleton Kokoro TTS service.
 * Lazy-loads the 82M ONNX model on first request.
 */

let tts: KokoroTTS | null = null;
let initPromise: Promise<KokoroTTS> | null = null;

async function getTTS(): Promise<KokoroTTS> {
  if (tts) return tts;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      console.error("[kokoro] Loading Kokoro-82M-v1.0-ONNX (q8, cpu)...");
      tts = await KokoroTTS.from_pretrained(
        "onnx-community/Kokoro-82M-v1.0-ONNX",
        { dtype: "q8", device: "cpu" },
      );
      console.error("[kokoro] Model loaded successfully");
      return tts;
    } catch (err) {
      initPromise = null;
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to load Kokoro TTS model: ${message}`);
    }
  })();

  return initPromise;
}

/**
 * Stream synthesized audio as individual WAV chunks (one per sentence).
 * Uses Kokoro's built-in stream() which handles sentence splitting internally.
 * Each yielded Uint8Array is a complete WAV file for one sentence.
 */
export async function* synthesizeStream(
  text: string,
  voice: string = "af_heart",
  speed: number = 1.0,
): AsyncGenerator<Uint8Array> {
  const model = await getTTS();
  // Create a TextSplitterStream and close() it so the last sentence
  // is flushed from the buffer. Passing a plain string to model.stream()
  // has a bug where close() is never called, causing the last sentence
  // to hang in the buffer indefinitely.
  const splitter = new TextSplitterStream();
  splitter.push(text);
  splitter.close();
  for await (const chunk of model.stream(splitter, { voice: voice as any, speed })) {
    yield new Uint8Array(chunk.audio.toWav());
  }
}

