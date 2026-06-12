# MinecraftWorldViews

High-efficiency, browser-native voxel rendering engine for Minecraft worlds.

**Core philosophy:** maximal efficiency. Typed arrays over object graphs, zero-copy views over
allocation, Web Workers over main-thread work. The main thread is reserved for UI and WebGL
draw calls.

## Roadmap status

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 1. I/O & decompression | Stream `.mca` region files, ranged reads, native `DecompressionStream`, worker pool | ya |
| 2. NBT & blockstates | Lazy NBT parser, bit-packed palette extraction | kinda |
| 3. Geometry & meshing | Greedy meshing + culling (Wasm) | not yet |
| 4. WebGL rendering | Texture atlas, frustum culling, direct buffer upload | not yet|

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
  nbt/
    reader.ts              Forward-only NBT cursor; skips unwanted branches
                           with pointer arithmetic, zero allocation
    chunk.ts               Lazy chunk parser — reads only sections/palettes/
                           blockstates, ignores entities, lighting, ticks
    bit-packing.ts         1.16+ packed-index unpacking via 32-bit halves
  worker/
    pool.ts                Generic Web Worker pool (transfer-based, FIFO queue)
    region-worker.ts       Off-thread chunk decompression + parsing
    region-pool.ts         Pool-backed decompress/parse pipeline factory
test/                      Vitest suite with synthetic region files & NBT
```

### Efficiency notes

- **No full-file loads.** `RegionFile.open()` reads only the 8 KiB header; each chunk costs
  exactly one ranged read of its sectors. Works the same over `Blob.slice` and HTTP `Range`.
- **Flat data.** Location/timestamp tables live in two `Uint32Array`s; chunk payloads are
  zero-copy `subarray` views into the sector read.
- **Lazy NBT.** The parser never builds a tag tree. Unwanted branches (entities, heightmaps,
  lighting, tick queues) are skipped with pure pointer arithmetic; packed blockstates are
  unpacked straight out of the NBT buffer into one `Uint16Array` per section.
- **No BigInt on the hot path.** Packed 64-bit longs are processed as pairs of 32-bit halves
  with plain integer ops (entries never span longs in the 1.16+ format).
- **Off-thread everything.** `createRegionWorkerPool()` decompresses *and* parses in workers;
  payloads move via transfer lists (never structured-clone copies) and section arrays are
  transferred back.

## Usage

```ts
import { BlobSource, RegionFile, createRegionWorkerPool, isAirState, blockIndex } from 'minecraft-world-views';

const pool = createRegionWorkerPool();
const region = await RegionFile.open(new BlobSource(file), { decompress: pool.decompress });

for (const { x, z } of region.chunks()) {
  const raw = await region.readRawChunk(x, z);
  const chunk = await pool.parse(raw.compressionType, raw.payload); // off-thread
  for (const section of chunk.sections) {
    // section.palette: BlockState[]; section.blocks: Uint16Array of palette
    // indices in YZX order (null = whole section is palette[0])
    const state = section.palette[section.blocks?.[blockIndex(0, 0, 0)] ?? 0];
  }
}
```

Supports worlds from Minecraft 1.16 onwards (1.18+ `sections` layout and the older
`Level.Sections` layout).

## Running it

Download or clone the repo and open `index.html` in a browser. That's it — no install,
no build, no server. Pick an `.mca` file and it renders a top-down terrain map of the
region, one pixel per block, with map-style hillshading. Scroll to zoom (anchored at the
cursor), drag to pan, double-click to reset the view, and click anywhere to identify the
surface block and its height.

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
