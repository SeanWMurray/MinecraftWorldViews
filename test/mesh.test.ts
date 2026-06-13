import { describe, expect, it } from 'vitest';
import type { BlockState, ChunkSection, ParsedChunk } from '../src/nbt/chunk';
import { blockIndex } from '../src/nbt/chunk';
import { BlockClass, classifyState } from '../src/mesh/block-model';
import { VoxelGrid } from '../src/mesh/voxel-grid';
import { greedyMesh } from '../src/mesh/greedy-mesher';
import { meshChunk } from '../src/mesh/index';

function state(name: string, properties: Record<string, string> | null = null): BlockState {
  return { name, properties };
}

/** Builds a single-section chunk from a fill callback over local coords. */
function chunkFromFill(
  palette: BlockState[],
  fill: (x: number, y: number, z: number) => number,
  sectionY = 0,
): ParsedChunk {
  const blocks = new Uint16Array(4096);
  for (let y = 0; y < 16; y++)
    for (let z = 0; z < 16; z++)
      for (let x = 0; x < 16; x++) blocks[blockIndex(x, y, z)] = fill(x, y, z);
  const section: ChunkSection = { y: sectionY, palette, blocks };
  return { x: 0, z: 0, status: 'full', sections: [section] };
}

describe('classifyState', () => {
  it('treats air variants as empty', () => {
    expect(classifyState(state('minecraft:air'))).toBe(BlockClass.Empty);
    expect(classifyState(state('minecraft:cave_air'))).toBe(BlockClass.Empty);
  });

  it('treats unknown solid blocks as opaque', () => {
    expect(classifyState(state('minecraft:stone'))).toBe(BlockClass.Opaque);
    expect(classifyState(state('modded:reactor_casing'))).toBe(BlockClass.Opaque);
  });

  it('treats glass and leaves as transparent', () => {
    expect(classifyState(state('minecraft:glass'))).toBe(BlockClass.Transparent);
    expect(classifyState(state('minecraft:oak_leaves'))).toBe(BlockClass.Transparent);
  });

  it('treats plants and fluids as empty (no full-cube geometry)', () => {
    expect(classifyState(state('minecraft:water'))).toBe(BlockClass.Empty);
    expect(classifyState(state('minecraft:oak_sapling'))).toBe(BlockClass.Empty);
  });
});

describe('greedyMesh single cube', () => {
  it('emits exactly 6 quads for one isolated opaque block', () => {
    const palette = [state('minecraft:air'), state('minecraft:stone')];
    const chunk = chunkFromFill(palette, (x, y, z) =>
      x === 5 && y === 5 && z === 5 ? 1 : 0,
    );
    const grid = VoxelGrid.fromChunk(chunk)!;
    const mesh = greedyMesh(grid);
    expect(mesh.quadCount).toBe(6);
    // 6 quads * 4 vertices * 3 components.
    expect(mesh.positions.length).toBe(6 * 4 * 3);
    expect(mesh.indices.length).toBe(6 * 6);
  });
});

describe('greedyMesh internal-face culling', () => {
  it('a solid full section exposes only its 6 outer faces', () => {
    const palette = [state('minecraft:air'), state('minecraft:stone')];
    const chunk = chunkFromFill(palette, () => 1); // every cell stone
    const grid = VoxelGrid.fromChunk(chunk)!;
    const mesh = greedyMesh(grid);
    // Each of the 6 faces of the 16x16x16 cube greedy-merges to a single quad.
    expect(mesh.quadCount).toBe(6);
  });

  it('culls the shared internal face between two adjacent blocks', () => {
    const palette = [state('minecraft:air'), state('minecraft:stone')];
    const chunk = chunkFromFill(palette, (x, y, z) =>
      y === 0 && z === 0 && (x === 0 || x === 1) ? 1 : 0,
    );
    const mesh = greedyMesh(VoxelGrid.fromChunk(chunk)!);
    // Two same-id cubes in a row: the 2 touching faces are culled, and the
    // coplanar top/bottom/front/back merge into one 2-wide quad each. That
    // leaves top + bottom + front + back + 2 end caps = 6 quads. (Were they
    // unmerged it'd be 10; were the internal face kept it'd be 7+.)
    expect(mesh.quadCount).toBe(6);
  });
});

describe('greedyMesh merging', () => {
  it('merges a flat 16x16 floor top into a single quad per face', () => {
    const palette = [state('minecraft:air'), state('minecraft:stone')];
    const chunk = chunkFromFill(palette, (x, y, z) => (y === 0 ? 1 : 0));
    const mesh = greedyMesh(VoxelGrid.fromChunk(chunk)!);
    // A 16x16x1 slab: top 1 + bottom 1 + 4 sides = 6 quads after merging.
    expect(mesh.quadCount).toBe(6);
  });
});

describe('greedyMesh transparency', () => {
  it('culls the face between two glass blocks of the same type', () => {
    const palette = [state('minecraft:air'), state('minecraft:glass')];
    const chunk = chunkFromFill(palette, (x, y, z) =>
      y === 0 && z === 0 && (x === 0 || x === 1) ? 1 : 0,
    );
    const mesh = greedyMesh(VoxelGrid.fromChunk(chunk)!);
    // Same as two opaque cubes: shared face culled, coplanar faces merge → 6.
    expect(mesh.quadCount).toBe(6);
  });

  it('draws both faces between glass and leaves (different transparent types)', () => {
    const palette = [
      state('minecraft:air'),
      state('minecraft:glass'),
      state('minecraft:oak_leaves'),
    ];
    const chunk = chunkFromFill(palette, (x, y, z) => {
      if (y !== 0 || z !== 0) return 0;
      if (x === 0) return 1;
      if (x === 1) return 2;
      return 0;
    });
    const mesh = greedyMesh(VoxelGrid.fromChunk(chunk)!);
    // Two cubes, but the shared face is drawn from both sides: 6+6 = 12.
    expect(mesh.quadCount).toBe(12);
  });

  it('hides an opaque neighbour behind glass (opaque face culled)', () => {
    const palette = [
      state('minecraft:air'),
      state('minecraft:glass'),
      state('minecraft:stone'),
    ];
    const chunk = chunkFromFill(palette, (x, y, z) => {
      if (y !== 0 || z !== 0) return 0;
      if (x === 0) return 2; // stone
      if (x === 1) return 1; // glass
      return 0;
    });
    const mesh = greedyMesh(VoxelGrid.fromChunk(chunk)!);
    // Stone: 6 faces but the one toward glass is hidden (glass is not empty
    // and not same-id-transparent → from stone's side, neighbour glass is
    // transparent & different id → drawn). Glass: 6, minus face toward stone
    // (opaque) culled = 5. Stone shows all 6 (glass doesn't occlude). 6+5=11.
    expect(mesh.quadCount).toBe(11);
  });
});

describe('greedyMesh world coordinates', () => {
  it('places vertices at the section world y', () => {
    const palette = [state('minecraft:air'), state('minecraft:stone')];
    // Section y=4 → world y base 64.
    const chunk = chunkFromFill(palette, (x, y, z) => (y === 0 && x === 0 && z === 0 ? 1 : 0), 4);
    const mesh = greedyMesh(VoxelGrid.fromChunk(chunk)!);
    let minY = Infinity;
    for (let i = 1; i < mesh.positions.length; i += 3) minY = Math.min(minY, mesh.positions[i]);
    expect(minY).toBe(64);
  });
});

describe('meshChunk', () => {
  it('returns null for an all-air chunk', () => {
    const palette = [state('minecraft:air')];
    const chunk = chunkFromFill(palette, () => 0);
    expect(meshChunk(chunk)).toBeNull();
  });

  it('returns null for a chunk with no sections', () => {
    expect(meshChunk({ x: 0, z: 0, status: 'full', sections: [] })).toBeNull();
  });

  it('meshes a populated chunk', () => {
    const palette = [state('minecraft:air'), state('minecraft:stone')];
    const chunk = chunkFromFill(palette, (x, y, z) => (y < 4 ? 1 : 0));
    const mesh = meshChunk(chunk)!;
    expect(mesh).not.toBeNull();
    expect(mesh.quadCount).toBeGreaterThan(0);
    expect(mesh.colors.length).toBe(mesh.positions.length / 3 * 4);
  });
});
