import { describe, expect, it } from 'vitest';
import { MemorySource } from '../src/io/memory-source';
import { RegionFile } from '../src/io/region-file';
import { readParsedChunk } from '../src/nbt/chunk';
import { meshChunk } from '../src/mesh/index';
import { Tag } from '../src/nbt/reader';
import { buildRegion } from './build-region';
import { NbtWriter, packLongs, writePaletteEntry } from './build-nbt';

/** A 1.18+ chunk: one section that is the bottom half stone, top half air. */
function buildSlabChunk(x: number, z: number): Uint8Array {
  const w = new NbtWriter();
  w.startCompound('');
  w.intTag('xPos', x).intTag('zPos', z);
  w.stringTag('status', 'minecraft:full');
  w.startList('sections', Tag.Compound, 1);

  // y < 8 → stone (palette index 1), else air (0).
  const values = new Array(4096);
  for (let yy = 0; yy < 16; yy++)
    for (let zz = 0; zz < 16; zz++)
      for (let xx = 0; xx < 16; xx++) values[(((yy << 4) | zz) << 4) | xx] = yy < 8 ? 1 : 0;

  w.byteTag('Y', 0);
  w.startCompound('block_states');
  w.startList('palette', Tag.Compound, 2);
  writePaletteEntry(w, 'minecraft:air');
  writePaletteEntry(w, 'minecraft:stone');
  w.longArrayTag('data', packLongs(values, 4));
  w.end(); // block_states
  w.end(); // section
  w.end(); // root
  return w.bytes();
}

describe('full pipeline: region → parse → mesh', () => {
  it('meshes a chunk read out of a synthetic region file', async () => {
    const region = await RegionFile.open(
      new MemorySource(buildRegion([{ x: 2, z: 3, data: buildSlabChunk(2, 3) }])),
    );

    const chunk = await readParsedChunk(region, 2, 3);
    expect(chunk).not.toBeNull();
    expect(chunk!.x).toBe(2);
    expect(chunk!.z).toBe(3);

    const mesh = meshChunk(chunk!)!;
    expect(mesh).not.toBeNull();

    // A solid 16x16x8 stone slab: the 6 outer faces each greedy-merge to one
    // quad. Top is the air-facing surface; bottom and 4 sides cap the slab.
    expect(mesh.quadCount).toBe(6);

    // Geometry should sit within the chunk's local bounds: x,z in [0,16],
    // y in [0,8] (8 stone layers from section y=0, world base 0).
    let maxY = -Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      maxX = Math.max(maxX, mesh.positions[i]);
      maxY = Math.max(maxY, mesh.positions[i + 1]);
      maxZ = Math.max(maxZ, mesh.positions[i + 2]);
    }
    expect(maxX).toBe(16);
    expect(maxZ).toBe(16);
    expect(maxY).toBe(8); // top of the 8-block slab

    // Every quad is 4 vertices; indices reference valid vertices.
    const vertexCount = mesh.positions.length / 3;
    expect(vertexCount).toBe(mesh.quadCount * 4);
    for (const idx of mesh.indices) expect(idx).toBeLessThan(vertexCount);
  });
});
