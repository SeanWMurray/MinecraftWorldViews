import { describe, expect, it } from 'vitest';
import { Compression } from '../src/io/compression';
import { MemorySource } from '../src/io/memory-source';
import { RegionFile, chunkToRegion, regionFileName } from '../src/io/region-file';
import { buildRegion } from './build-region';

const encoder = new TextEncoder();
const nbtBytes = (text: string) => encoder.encode(text.repeat(50));

async function openRegion(...chunks: Parameters<typeof buildRegion>[0]) {
  return RegionFile.open(new MemorySource(buildRegion(chunks)));
}

describe('RegionFile', () => {
  it('reports which chunks are present', async () => {
    const region = await openRegion(
      { x: 0, z: 0, data: nbtBytes('a') },
      { x: 31, z: 31, data: nbtBytes('b') },
      { x: 5, z: 12, data: nbtBytes('c') },
    );
    expect(region.hasChunk(0, 0)).toBe(true);
    expect(region.hasChunk(31, 31)).toBe(true);
    expect(region.hasChunk(5, 12)).toBe(true);
    expect(region.hasChunk(1, 0)).toBe(false);
    expect(region.chunkCount()).toBe(3);
    expect([...region.chunks()].map(({ x, z }) => `${x},${z}`).sort()).toEqual(
      ['0,0', '31,31', '5,12'].sort(),
    );
  });

  it('round-trips a zlib-compressed chunk', async () => {
    const data = nbtBytes('zlib chunk payload');
    const region = await openRegion({ x: 3, z: 7, data });
    expect(await region.readChunk(3, 7)).toEqual(data);
  });

  it('round-trips a gzip-compressed chunk', async () => {
    const data = nbtBytes('gzip chunk payload');
    const region = await openRegion({ x: 0, z: 1, data, type: Compression.Gzip });
    expect(await region.readChunk(0, 1)).toEqual(data);
  });

  it('reads an uncompressed chunk without copying', async () => {
    const data = nbtBytes('raw chunk payload');
    const region = await openRegion({ x: 2, z: 2, data, type: Compression.None });
    expect(await region.readChunk(2, 2)).toEqual(data);
  });

  it('returns null for absent chunks', async () => {
    const region = await openRegion({ x: 0, z: 0, data: nbtBytes('x') });
    expect(await region.readChunk(9, 9)).toBeNull();
    expect(await region.readRawChunk(9, 9)).toBeNull();
  });

  it('exposes raw compressed payloads and timestamps', async () => {
    const data = nbtBytes('timestamped');
    const region = await openRegion({ x: 1, z: 1, data, timestamp: 1_700_000_000 });
    const raw = await region.readRawChunk(1, 1);
    expect(raw).not.toBeNull();
    expect(raw!.compressionType).toBe(Compression.Zlib);
    expect(raw!.payload.byteLength).toBeLessThan(data.byteLength);
    expect(raw!.timestamp).toBe(1_700_000_000);
    expect(region.timestamp(1, 1)).toBe(1_700_000_000);
    expect(region.timestamp(0, 0)).toBe(0);
  });

  it('rejects files smaller than the header', async () => {
    await expect(RegionFile.open(new MemorySource(new Uint8Array(100)))).rejects.toThrow(
      /too small/,
    );
  });

  it('rejects corrupt chunk records', async () => {
    const bytes = buildRegion([{ x: 0, z: 0, data: nbtBytes('x') }]);
    // Lie about the record length: claim more bytes than the sectors hold.
    new DataView(bytes.buffer).setUint32(8192, 0x7fffffff, false);
    const region = await RegionFile.open(new MemorySource(bytes));
    await expect(region.readChunk(0, 0)).rejects.toThrow(/corrupt chunk record/);
  });

  it('uses a custom decompressor when provided', async () => {
    const data = nbtBytes('custom');
    const calls: number[] = [];
    const region = await RegionFile.open(new MemorySource(buildRegion([{ x: 0, z: 0, data }])), {
      decompress: (type) => {
        calls.push(type);
        return Promise.resolve(new Uint8Array([42]));
      },
    });
    expect(await region.readChunk(0, 0)).toEqual(new Uint8Array([42]));
    expect(calls).toEqual([Compression.Zlib]);
  });
});

describe('coordinate helpers', () => {
  it('maps chunk coordinates to regions, including negatives', () => {
    expect(chunkToRegion(0, 0)).toEqual({ regionX: 0, regionZ: 0 });
    expect(chunkToRegion(31, 31)).toEqual({ regionX: 0, regionZ: 0 });
    expect(chunkToRegion(32, -1)).toEqual({ regionX: 1, regionZ: -1 });
    expect(chunkToRegion(-32, -33)).toEqual({ regionX: -1, regionZ: -2 });
  });

  it('formats region file names', () => {
    expect(regionFileName(0, -1)).toBe('r.0.-1.mca');
  });
});
