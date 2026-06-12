import type { ByteSource } from './byte-source';

/** Serves reads from a buffer already in memory. All reads are zero-copy subarray views. */
export class MemorySource implements ByteSource {
  constructor(private readonly data: Uint8Array) {}

  size(): Promise<number> {
    return Promise.resolve(this.data.byteLength);
  }

  read(offset: number, length: number): Promise<Uint8Array> {
    return Promise.resolve(
      this.data.subarray(offset, Math.min(offset + length, this.data.byteLength)),
    );
  }
}
