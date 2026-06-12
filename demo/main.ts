import { BlobSource, REGION_CHUNKS, RegionFile, createWorkerDecompressor } from '../src/index';

const CELL = 512 / REGION_CHUNKS;

const input = document.getElementById('file') as HTMLInputElement;
const canvas = document.getElementById('grid') as HTMLCanvasElement;
const status = document.getElementById('status') as HTMLPreElement;
const ctx = canvas.getContext('2d')!;

const { decompress } = createWorkerDecompressor();
let region: RegionFile | null = null;

function drawRegion(current: RegionFile): void {
  ctx.fillStyle = '#1b1b22';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#3fae6a';
  for (const { x, z } of current.chunks()) {
    ctx.fillRect(x * CELL + 1, z * CELL + 1, CELL - 2, CELL - 2);
  }
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
}

input.addEventListener('change', async () => {
  const file = input.files?.[0];
  if (!file) return;
  try {
    region = await RegionFile.open(new BlobSource(file), { decompress });
    drawRegion(region);
    status.textContent = `${file.name}: ${region.chunkCount()}/1024 chunks present. Click a chunk to decompress it.`;
  } catch (err) {
    region = null;
    status.textContent = `Failed to open ${file.name}: ${err instanceof Error ? err.message : err}`;
  }
});

canvas.addEventListener('click', async (ev) => {
  if (!region) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((ev.clientX - rect.left) / rect.width) * REGION_CHUNKS);
  const z = Math.floor(((ev.clientY - rect.top) / rect.height) * REGION_CHUNKS);
  if (!region.hasChunk(x, z)) {
    status.textContent = `Chunk (${x}, ${z}): not generated.`;
    return;
  }
  try {
    const raw = (await region.readRawChunk(x, z))!;
    const compressedSize = raw.payload.byteLength;
    const start = performance.now();
    const nbt = await decompress(raw.compressionType, raw.payload);
    const ms = (performance.now() - start).toFixed(2);
    drawRegion(region);
    ctx.fillStyle = '#e8c47a';
    ctx.fillRect(x * CELL + 1, z * CELL + 1, CELL - 2, CELL - 2);
    status.textContent =
      `Chunk (${x}, ${z})\n` +
      `  compressed:   ${compressedSize.toLocaleString()} B (type ${raw.compressionType})\n` +
      `  decompressed: ${nbt.byteLength.toLocaleString()} B in ${ms} ms (worker)\n` +
      `  modified:     ${new Date(raw.timestamp * 1000).toISOString()}\n` +
      `  NBT head:     ${hex(nbt.subarray(0, 16))}`;
  } catch (err) {
    status.textContent = `Chunk (${x}, ${z}) failed: ${err instanceof Error ? err.message : err}`;
  }
});
