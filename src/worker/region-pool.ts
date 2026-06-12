import type { ChunkDecompressor } from '../io/region-file';
import { WorkerPool } from './pool';

export interface WorkerDecompressor {
  /** Plug this into `RegionFile.open(source, { decompress })`. */
  decompress: ChunkDecompressor;
  /** Terminates the underlying workers. */
  dispose: () => void;
}

/**
 * Chunk decompressor backed by a pool of Web Workers. Payload buffers are
 * transferred (not copied) into a worker, and the inflated result buffer is
 * transferred back, so chunk data never crosses threads by copy.
 *
 * Note: the payload's underlying ArrayBuffer is detached by the transfer —
 * callers must not touch the RawChunk payload after handing it over.
 */
export function createWorkerDecompressor(poolSize?: number): WorkerDecompressor {
  const pool = new WorkerPool(
    () => new Worker(new URL('./region-worker.ts', import.meta.url), { type: 'module' }),
    poolSize,
  );
  return {
    decompress: (compressionType, payload) =>
      pool.run<Uint8Array>({ compressionType, payload }, [payload.buffer as ArrayBuffer]),
    dispose: () => pool.terminate(),
  };
}
