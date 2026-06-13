import type { ParsedChunk } from '../nbt/chunk';
import { greedyMesh, type ChunkMesh } from './greedy-mesher';
import { VoxelGrid } from './voxel-grid';

export { BlockClass, classifyState, colorForName, buildPaletteInfo } from './block-model';
export type { PaletteInfo } from './block-model';
export { VoxelGrid } from './voxel-grid';
export { greedyMesh } from './greedy-mesher';
export type { ChunkMesh } from './greedy-mesher';

/**
 * Full Phase 3 pipeline for one chunk: flatten its sections into a padded voxel
 * grid, then greedy-mesh it into upload-ready typed arrays. Returns null for
 * chunks with no renderable geometry (all air / no sections).
 *
 * Mesh coordinates are chunk-local: x,z in 0..16, y is the world y. Add
 * (chunk.x*16, 0, chunk.z*16) to place the chunk in the world.
 */
export function meshChunk(chunk: ParsedChunk): ChunkMesh | null {
  const grid = VoxelGrid.fromChunk(chunk);
  if (grid === null) return null;
  const mesh = greedyMesh(grid);
  return mesh.quadCount === 0 ? null : mesh;
}
