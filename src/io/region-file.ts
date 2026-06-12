import type { ByteSource } from './byte-source';
import { decompressChunkPayload } from './compression';

export const SECTOR_SIZE = 4096;
/** Chunks per region edge (regions are 32x32 chunks). */
export const REGION_CHUNKS = 32;
const HEADER_SIZE = SECTOR_SIZE * 2;
const TABLE_ENTRIES = REGION_CHUNKS * REGION_CHUNKS;

/** Compressed chunk record exactly as stored on disk (payload not yet inflated). */
export interface RawChunk {
  compressionType: number;
  /** Still-compressed bytes; a zero-copy view into the sector read. */
  payload: Uint8Array;
  /** Last-modified time, seconds since epoch. */
  timestamp: number;
}

export type ChunkDecompressor = (
  compressionType: number,
  payload: Uint8Array,
) => Promise<Uint8Array>;

export interface RegionFileOptions {
  /**
   * Override decompression — pass `createWorkerDecompressor().decompress`
   * to keep inflate work off the main thread.
   */
  decompress?: ChunkDecompressor;
}

/**
 * Lazy reader for Anvil (.mca) region files.
 *
 * Opening parses only the two 4 KiB header tables (chunk locations and
 * timestamps) into flat Uint32Arrays. Chunk sectors are fetched on demand,
 * one ranged read per chunk, so an entire region is never resident at once.
 */
export class RegionFile {
  private constructor(
    private readonly source: ByteSource,
    /** Packed location entries: sectorOffset << 8 | sectorCount. */
    private readonly locations: Uint32Array,
    private readonly timestamps: Uint32Array,
    private readonly decompress: ChunkDecompressor,
  ) {}

  static async open(source: ByteSource, options: RegionFileOptions = {}): Promise<RegionFile> {
    const header = await source.read(0, HEADER_SIZE);
    if (header.byteLength < HEADER_SIZE) {
      throw new Error(
        `region file too small: ${header.byteLength} bytes (need ${HEADER_SIZE}-byte header)`,
      );
    }
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const locations = new Uint32Array(TABLE_ENTRIES);
    const timestamps = new Uint32Array(TABLE_ENTRIES);
    for (let i = 0; i < TABLE_ENTRIES; i++) {
      locations[i] = view.getUint32(i * 4, false);
      timestamps[i] = view.getUint32(SECTOR_SIZE + i * 4, false);
    }
    return new RegionFile(source, locations, timestamps, options.decompress ?? decompressChunkPayload);
  }

  private static index(x: number, z: number): number {
    return (x & 31) | ((z & 31) << 5);
  }

  /** Whether the chunk at local coordinates (0-31) exists in this region. */
  hasChunk(x: number, z: number): boolean {
    return this.locations[RegionFile.index(x, z)] !== 0;
  }

  /** Last-modified time of a chunk, seconds since epoch (0 if absent). */
  timestamp(x: number, z: number): number {
    return this.timestamps[RegionFile.index(x, z)];
  }

  /** Number of chunks present in this region. */
  chunkCount(): number {
    let count = 0;
    for (let i = 0; i < TABLE_ENTRIES; i++) {
      if (this.locations[i] !== 0) count++;
    }
    return count;
  }

  /** Iterates local coordinates of every chunk present in the region. */
  *chunks(): IterableIterator<{ x: number; z: number; timestamp: number }> {
    for (let i = 0; i < TABLE_ENTRIES; i++) {
      if (this.locations[i] !== 0) {
        yield { x: i & 31, z: i >>> 5, timestamp: this.timestamps[i] };
      }
    }
  }

  /**
   * Reads the chunk's sectors and returns its still-compressed payload, or
   * null if the chunk has never been generated.
   */
  async readRawChunk(x: number, z: number): Promise<RawChunk | null> {
    const entry = this.locations[RegionFile.index(x, z)];
    if (entry === 0) return null;
    const sectorOffset = entry >>> 8;
    const sectorCount = entry & 0xff;
    if (sectorOffset < 2 || sectorCount === 0) {
      throw new Error(`corrupt location entry for chunk (${x}, ${z})`);
    }

    const data = await this.source.read(sectorOffset * SECTOR_SIZE, sectorCount * SECTOR_SIZE);
    if (data.byteLength < 5) {
      throw new Error(`truncated chunk record at (${x}, ${z})`);
    }
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    // Big-endian length counts the compression byte plus the payload.
    const length = view.getUint32(0, false);
    if (length < 1 || 4 + length > data.byteLength) {
      throw new Error(
        `corrupt chunk record at (${x}, ${z}): length ${length} exceeds ${data.byteLength - 4} available bytes`,
      );
    }
    const compressionType = data[4];
    if ((compressionType & 0x80) !== 0) {
      throw new Error(`chunk (${x}, ${z}) is stored externally (.mcc); not supported yet`);
    }
    return {
      compressionType,
      payload: data.subarray(5, 4 + length),
      timestamp: this.timestamps[RegionFile.index(x, z)],
    };
  }

  /** Reads and decompresses a chunk into raw NBT bytes, or null if absent. */
  async readChunk(x: number, z: number): Promise<Uint8Array | null> {
    const raw = await this.readRawChunk(x, z);
    if (raw === null) return null;
    return this.decompress(raw.compressionType, raw.payload);
  }
}

/** Region coordinates containing the given absolute chunk coordinates. */
export function chunkToRegion(chunkX: number, chunkZ: number): { regionX: number; regionZ: number } {
  return { regionX: chunkX >> 5, regionZ: chunkZ >> 5 };
}

/** Conventional region file name, e.g. `r.0.-1.mca`. */
export function regionFileName(regionX: number, regionZ: number): string {
  return `r.${regionX}.${regionZ}.mca`;
}
