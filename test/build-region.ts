import { deflateSync, gzipSync } from 'node:zlib';
import { Compression } from '../src/io/compression';

export interface TestChunk {
  x: number;
  z: number;
  data: Uint8Array;
  type?: number;
  timestamp?: number;
}

/** Builds a syntactically valid Anvil region file in memory for tests. */
export function buildRegion(chunks: TestChunk[]): Uint8Array {
  const SECTOR = 4096;
  const header = new Uint8Array(SECTOR * 2);
  const view = new DataView(header.buffer);
  const records: Uint8Array[] = [];
  let nextSector = 2;

  for (const chunk of chunks) {
    const type = chunk.type ?? Compression.Zlib;
    const compressed =
      type === Compression.Gzip
        ? new Uint8Array(gzipSync(chunk.data))
        : type === Compression.Zlib
          ? new Uint8Array(deflateSync(chunk.data))
          : chunk.data;

    const sectorCount = Math.ceil((5 + compressed.byteLength) / SECTOR);
    const record = new Uint8Array(sectorCount * SECTOR);
    new DataView(record.buffer).setUint32(0, compressed.byteLength + 1, false);
    record[4] = type;
    record.set(compressed, 5);
    records.push(record);

    const index = (chunk.x & 31) | ((chunk.z & 31) << 5);
    view.setUint32(index * 4, (nextSector << 8) | sectorCount, false);
    view.setUint32(SECTOR + index * 4, chunk.timestamp ?? 0, false);
    nextSector += sectorCount;
  }

  const total = header.byteLength + records.reduce((n, r) => n + r.byteLength, 0);
  const out = new Uint8Array(total);
  out.set(header, 0);
  let offset = header.byteLength;
  for (const record of records) {
    out.set(record, offset);
    offset += record.byteLength;
  }
  return out;
}
