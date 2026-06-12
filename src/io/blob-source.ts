import type { ByteSource } from './byte-source';

/**
 * Reads byte ranges from a File/Blob (e.g. a user-picked .mca file).
 * Blob.slice() does not copy file contents — bytes only reach memory when a
 * specific range is requested, so multi-gigabyte region folders stay cheap.
 */
export class BlobSource implements ByteSource {
  constructor(private readonly blob: Blob) {}

  size(): Promise<number> {
    return Promise.resolve(this.blob.size);
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    const slice = this.blob.slice(offset, offset + length);
    return new Uint8Array(await slice.arrayBuffer());
  }
}
