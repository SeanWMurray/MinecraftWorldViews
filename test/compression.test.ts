import { deflateSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  Compression,
  compressionFormat,
  decompressChunkPayload,
  inflate,
} from '../src/io/compression';

const sample = new TextEncoder().encode('minecraft chunk data '.repeat(1000));

describe('inflate', () => {
  it('inflates zlib (deflate) data', async () => {
    expect(await inflate(new Uint8Array(deflateSync(sample)), 'deflate')).toEqual(sample);
  });

  it('inflates gzip data', async () => {
    expect(await inflate(new Uint8Array(gzipSync(sample)), 'gzip')).toEqual(sample);
  });

  it('rejects on garbage input', async () => {
    await expect(inflate(new Uint8Array([1, 2, 3, 4]), 'deflate')).rejects.toThrow();
  });
});

describe('decompressChunkPayload', () => {
  it('handles every supported compression id', async () => {
    expect(
      await decompressChunkPayload(Compression.Zlib, new Uint8Array(deflateSync(sample))),
    ).toEqual(sample);
    expect(
      await decompressChunkPayload(Compression.Gzip, new Uint8Array(gzipSync(sample))),
    ).toEqual(sample);
    expect(await decompressChunkPayload(Compression.None, sample)).toBe(sample);
  });

  it('rejects unsupported schemes with clear errors', () => {
    expect(() => compressionFormat(Compression.Lz4)).toThrow(/LZ4/);
    expect(() => compressionFormat(Compression.Custom)).toThrow(/custom/);
    expect(() => compressionFormat(99)).toThrow(/unknown/);
  });
});
