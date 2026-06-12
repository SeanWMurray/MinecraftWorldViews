import { decompressChunkPayload } from '../io/compression';

interface DecompressRequest {
  compressionType: number;
  payload: Uint8Array;
}

// Minimal typing for the dedicated-worker global scope; keeps this file
// compiling under the DOM lib without pulling in the full webworker lib.
type WorkerScope = {
  onmessage: ((ev: MessageEvent<DecompressRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

const scope = self as unknown as WorkerScope;

scope.onmessage = async (ev) => {
  const { compressionType, payload } = ev.data;
  try {
    const result = await decompressChunkPayload(compressionType, payload);
    scope.postMessage({ ok: true, result }, [result.buffer as ArrayBuffer]);
  } catch (err) {
    scope.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
