import type { ChunkDecompressor } from '../io/region-file';
import type { ParsedChunk } from '../nbt/chunk';
import { WorkerPool } from './pool';

export interface RegionWorkerPool {
  /** Plug this into `RegionFile.open(source, { decompress })`. */
  decompress: ChunkDecompressor;
  /**
   * Decompresses and parses a raw chunk payload in a worker, returning the
   * sections with their block arrays transferred (not copied) back.
   */
  parse(compressionType: number, payload: Uint8Array): Promise<ParsedChunk>;
  /** Terminates the underlying workers. */
  dispose(): void;
}

/**
 * Chunk pipeline backed by a pool of Web Workers. Payload buffers are
 * transferred (not copied) into a worker, and result buffers are transferred
 * back, so chunk data never crosses threads by copy.
 *
 * Note: the payload's underlying ArrayBuffer is detached by the transfer —
 * callers must not touch a RawChunk payload after handing it over.
 */
export function createRegionWorkerPool(poolSize?: number): RegionWorkerPool {
  const pool = new WorkerPool(
    () => new Worker(new URL('./region-worker.js', import.meta.url), { type: 'module' }),
    poolSize,
  );
  return {
    decompress: (compressionType, payload) =>
      pool.run<Uint8Array>({ kind: 'decompress', compressionType, payload }, [
        payload.buffer as ArrayBuffer,
      ]),
    parse: (compressionType, payload) =>
      pool.run<ParsedChunk>({ kind: 'parse', compressionType, payload }, [
        payload.buffer as ArrayBuffer,
      ]),
    dispose: () => pool.terminate(),
  };
}
