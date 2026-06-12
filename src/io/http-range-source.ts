import type { ByteSource } from './byte-source';

/**
 * Reads byte ranges from a remote URL via HTTP Range requests, so only the
 * sectors needed for visible chunks ever cross the network. If the server
 * ignores Range, the body is downloaded once and sliced from memory.
 */
export class HttpRangeSource implements ByteSource {
  #size: number | null = null;
  #fullBody: Uint8Array | null = null;

  constructor(
    private readonly url: string | URL,
    private readonly init: RequestInit = {},
  ) {}

  async size(): Promise<number> {
    if (this.#fullBody !== null) return this.#fullBody.byteLength;
    if (this.#size !== null) return this.#size;
    const res = await fetch(this.url, { ...this.init, method: 'HEAD' });
    if (!res.ok) throw new Error(`HEAD ${this.url} failed: ${res.status}`);
    const length = Number(res.headers.get('content-length'));
    if (!Number.isFinite(length)) {
      throw new Error(`HEAD ${this.url}: missing content-length header`);
    }
    this.#size = length;
    return length;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    if (this.#fullBody !== null) {
      return this.#fullBody.subarray(offset, offset + length);
    }
    const headers = new Headers(this.init.headers);
    headers.set('range', `bytes=${offset}-${offset + length - 1}`);
    const res = await fetch(this.url, { ...this.init, headers });
    if (res.status === 200) {
      // Server ignored the Range header: keep the full body and serve views.
      this.#fullBody = new Uint8Array(await res.arrayBuffer());
      return this.#fullBody.subarray(offset, offset + length);
    }
    if (res.status !== 206) {
      throw new Error(`GET ${this.url} range ${offset}-${offset + length - 1} failed: ${res.status}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }
}
