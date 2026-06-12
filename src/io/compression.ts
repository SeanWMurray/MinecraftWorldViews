/** Anvil chunk compression scheme ids (the byte after the 4-byte length prefix). */
export const Compression = {
  Gzip: 1,
  Zlib: 2,
  None: 3,
  Lz4: 4,
  Custom: 127,
} as const;

export type CompressionId = (typeof Compression)[keyof typeof Compression];

/**
 * Streams `data` through the browser-native DecompressionStream and collects
 * the output with at most one final allocation. The native stream runs its
 * inflate loop outside JS, keeping the CPU cost off our thread's hot path.
 */
export async function inflate(data: Uint8Array, format: CompressionFormat): Promise<Uint8Array> {
  const stream = new DecompressionStream(format);
  const writer = stream.writable.getWriter();
  // Not awaited: for inputs larger than the internal queue, write() only
  // resolves once the readable side drains, which happens in the loop below.
  // Errors surface through reader.read(), so rejections here are swallowed.
  // The cast is safe: the stream only reads the view, it never shares it.
  void writer.write(data as Uint8Array<ArrayBuffer>).catch(() => {});
  void writer.close().catch(() => {});

  const reader = stream.readable.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    total += value.byteLength;
  }
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

/** Maps an Anvil compression id to a DecompressionStream format, or null when stored raw. */
export function compressionFormat(type: number): CompressionFormat | null {
  switch (type) {
    case Compression.Gzip:
      return 'gzip';
    case Compression.Zlib:
      return 'deflate';
    case Compression.None:
      return null;
    case Compression.Lz4:
      throw new Error('LZ4 chunk compression (type 4) is not supported yet');
    case Compression.Custom:
      throw new Error('custom chunk compression (type 127) is not supported');
    default:
      throw new Error(`unknown chunk compression type ${type}`);
  }
}

/** Decompresses a raw chunk payload according to its compression id. */
export function decompressChunkPayload(type: number, payload: Uint8Array): Promise<Uint8Array> {
  const format = compressionFormat(type);
  return format === null ? Promise.resolve(payload) : inflate(payload, format);
}
