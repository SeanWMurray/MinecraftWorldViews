// Phase 1: I/O & decompression pipeline.
export type { ByteSource } from './io/byte-source';
export { MemorySource } from './io/memory-source';
export { BlobSource } from './io/blob-source';
export { HttpRangeSource } from './io/http-range-source';
export {
  Compression,
  type CompressionId,
  inflate,
  compressionFormat,
  decompressChunkPayload,
} from './io/compression';
export {
  RegionFile,
  type RawChunk,
  type ChunkDecompressor,
  type RegionFileOptions,
  chunkToRegion,
  regionFileName,
  SECTOR_SIZE,
  REGION_CHUNKS,
} from './io/region-file';
export { WorkerPool } from './worker/pool';
export { createWorkerDecompressor, type WorkerDecompressor } from './worker/region-pool';
