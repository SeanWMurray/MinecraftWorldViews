import { decompressChunkPayload } from '../io/compression';
import { parseChunk } from '../nbt/chunk';

interface RegionWorkerRequest {
  kind: 'decompress' | 'parse';
  compressionType: number;
  payload: Uint8Array;
}

// Minimal typing for the dedicated-worker global scope; keeps this file
// compiling under the DOM lib without pulling in the full webworker lib.
type WorkerScope = {
  onmessage: ((ev: MessageEvent<RegionWorkerRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

const scope = self as unknown as WorkerScope;

scope.onmessage = async (ev) => {
  const { kind, compressionType, payload } = ev.data;
  try {
    const nbt = await decompressChunkPayload(compressionType, payload);
    if (kind === 'parse') {
      const chunk = parseChunk(nbt);
      // Transfer each section's block array back instead of copying it.
      const transfer: Transferable[] = [];
      for (const section of chunk.sections) {
        if (section.blocks !== null) transfer.push(section.blocks.buffer as ArrayBuffer);
      }
      scope.postMessage({ ok: true, result: chunk }, transfer);
    } else {
      scope.postMessage({ ok: true, result: nbt }, [nbt.buffer as ArrayBuffer]);
    }
  } catch (err) {
    scope.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
