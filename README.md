# MinecraftWorldViews

High-efficiency, browser-native voxel rendering engine for Minecraft worlds.

**Core philosophy:** maximal efficiency. Typed arrays over object graphs, zero-copy views over
allocation, Web Workers over main-thread work. The main thread is reserved for UI and WebGL
draw calls.

## Roadmap status

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 1. I/O & decompression | Stream `.mca` region files, ranged reads, native `DecompressionStream`, worker pool | ✅ Implemented |
| 2. NBT & blockstates | Lazy NBT parser, bit-packed palette extraction | ⬜ Next |
| 3. Geometry & meshing | Greedy meshing + culling (Wasm) | ⬜ Planned |
| 4. WebGL rendering | Texture atlas, frustum culling, direct buffer upload | ⬜ Planned |

## Architecture

```
index.html                 Region inspector — just open it in a browser
src/
  index.ts                 Public API
  io/
    byte-source.ts         ByteSource interface — random-access byte ranges
    blob-source.ts         Local files via Blob.slice (no full-file load)
    http-range-source.ts   Remote files via HTTP Range requests
    memory-source.ts       In-memory buffers (tests, small files)
    region-file.ts         Anvil (.mca) parser — header tables in Uint32Arrays,
                           chunks fetched lazily one ranged read at a time
    compression.ts         Native DecompressionStream (gzip/zlib) wrapper
  worker/
    pool.ts                Generic Web Worker pool (transfer-based, FIFO queue)
    region-worker.ts       Off-thread chunk decompression
    region-pool.ts         Pool-backed ChunkDecompressor factory
test/                      Vitest suite with synthetic in-memory region files
```

### Efficiency notes (Phase 1)

- **No full-file loads.** `RegionFile.open()` reads only the 8 KiB header; each chunk costs
  exactly one ranged read of its sectors. Works the same over `Blob.slice` and HTTP `Range`.
- **Flat data.** Location/timestamp tables live in two `Uint32Array`s; chunk payloads are
  zero-copy `subarray` views into the sector read.
- **Off-thread inflate.** `createWorkerDecompressor()` moves payloads into workers via
  transfer lists (never structured-clone copies) and transfers result buffers back.

## Usage

```ts
import { BlobSource, RegionFile, createWorkerDecompressor } from 'minecraft-world-views';

const { decompress } = createWorkerDecompressor(); // worker pool, optional
const region = await RegionFile.open(new BlobSource(file), { decompress });

for (const { x, z } of region.chunks()) {
  const nbt = await region.readChunk(x, z); // raw NBT bytes (Phase 2 parses these)
}
```

## Running it

Download or clone the repo and open `index.html` in a browser. That's it — no install,
no build, no server. Pick an `.mca` file and click chunks to inspect them.

(`index.html` inlines the Phase 1 pipeline as a classic script because browsers block
ES module imports and Web Workers on pages opened from disk. The importable library
in `src/` is the same logic, plus the worker pool for embedding in real apps.)

## Development

Only needed if you want to run the test suite or build the library package:

```sh
npm install
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run build      # emit dist/ with declarations
```
