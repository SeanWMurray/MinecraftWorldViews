import { BlockClass } from './block-model';
import type { VoxelGrid } from './voxel-grid';

/**
 * The output of meshing one chunk: flat, interleaved-free typed arrays sized to
 * exactly the geometry produced, ready to upload to WebGL buffers in Phase 4
 * with zero further JS work.
 *
 * Layout (all parallel, one entry per vertex; 4 vertices per quad, 6 indices):
 *   positions  Float32Array  x,y,z per vertex (world-local; add chunk origin)
 *   normals    Int8Array     nx,ny,nz per vertex (one of the 6 axis dirs)
 *   colors     Uint8Array    r,g,b,a per vertex (a carries face shading)
 *   indices    Uint32Array   two triangles per quad
 */
export interface ChunkMesh {
  positions: Float32Array;
  normals: Int8Array;
  colors: Uint8Array;
  indices: Uint32Array;
  /** Number of quads emitted (positions.length === quadCount*4*3). */
  quadCount: number;
}

/** The six face directions as [dx, dy, dz]. */
const FACES = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

/**
 * Per-face brightness, the classic "fake AO" of map renderers: top brightest,
 * bottom darkest, sides graded by axis. Baked into vertex alpha so the Phase 4
 * shader can multiply without a lighting pass.
 */
const FACE_SHADE = [0.8, 0.8, 1.0, 0.5, 0.7, 0.6] as const; // +x -x +y -y +z -z

/**
 * Decides whether the face of `here` toward `there` should be drawn. A face is
 * visible when the neighbour doesn't fully hide it:
 *   - empty neighbour → always draw
 *   - opaque neighbour → hide (both opaque and transparent faces)
 *   - transparent neighbour of a *different* id → draw (so glass next to leaves
 *     shows both); same id → cull (don't z-fight inside one material)
 */
function faceVisible(
  hereClass: BlockClass,
  hereId: number,
  thereClass: BlockClass,
  thereId: number,
): boolean {
  if (thereClass === BlockClass.Empty) return true;
  if (thereClass === BlockClass.Opaque) return false;
  // neighbour is transparent
  if (hereClass === BlockClass.Transparent && hereId === thereId) return false;
  return true;
}

/**
 * Greedy-meshes a voxel grid into merged quads with internal-face culling.
 *
 * For each of the 6 face directions we sweep slice by slice along that axis. On
 * each slice we fill a 2D mask of "which cells have a visible face here, and of
 * what block id", then greedily grow maximal rectangles of identical id and
 * emit one quad per rectangle. This collapses, e.g., a flat 16×16 stone floor
 * top from 256 quads to 1.
 */
export function greedyMesh(grid: VoxelGrid): ChunkMesh {
  const { sizeX, sizeY, sizeZ } = grid;
  const dims = [sizeX, sizeY, sizeZ];

  // Growable scratch; we trim to exact length at the end.
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  let quadCount = 0;

  // mask holds the block id (0 = no face) for the slice currently being merged;
  // a parallel `flip` records face winding for the negative-direction sweeps.
  const maskSize = Math.max(sizeX * sizeY, sizeY * sizeZ, sizeX * sizeZ);
  const mask = new Int32Array(maskSize);

  for (let f = 0; f < 6; f++) {
    const [dx, dy, dz] = FACES[f];
    const shade = FACE_SHADE[f];
    // axis along the face normal; u,v are the two in-plane axes.
    const axis = dx !== 0 ? 0 : dy !== 0 ? 1 : 2;
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    const dir = dx + dy + dz; // +1 or -1
    const sliceCount = dims[axis];
    const uSize = dims[u];
    const vSize = dims[v];

    const coord = [0, 0, 0];
    const ncoord = [0, 0, 0];

    for (let slice = 0; slice < sliceCount; slice++) {
      // Build the mask for this slice: for each (u,v), is the face toward `dir`
      // visible, and if so what id (encoded positive)?
      let m = 0;
      for (let vv = 0; vv < vSize; vv++) {
        for (let uu = 0; uu < uSize; uu++, m++) {
          coord[axis] = slice;
          coord[u] = uu;
          coord[v] = vv;
          const hereId = grid.idAt(coord[0], coord[1], coord[2]);
          if (hereId === 0) {
            mask[m] = 0;
            continue;
          }
          ncoord[0] = coord[0] + dx;
          ncoord[1] = coord[1] + dy;
          ncoord[2] = coord[2] + dz;
          const thereId = grid.idAt(ncoord[0], ncoord[1], ncoord[2]);
          const hereClass = grid.classes[hereId] as BlockClass;
          const thereClass = grid.classes[thereId] as BlockClass;
          mask[m] = faceVisible(hereClass, hereId, thereClass, thereId) ? hereId : 0;
        }
      }

      // Greedily merge the mask into maximal rectangles.
      for (let j = 0; j < vSize; j++) {
        for (let i = 0; i < uSize; ) {
          const start = j * uSize + i;
          const id = mask[start];
          if (id === 0) {
            i++;
            continue;
          }
          // Grow width along u.
          let w = 1;
          while (i + w < uSize && mask[start + w] === id) w++;
          // Grow height along v while the whole row matches.
          let h = 1;
          grow: while (j + h < vSize) {
            const rowBase = (j + h) * uSize + i;
            for (let k = 0; k < w; k++) {
              if (mask[rowBase + k] !== id) break grow;
            }
            h++;
          }

          // Emit the quad. Build its four corners in 3D.
          const base = [0, 0, 0];
          base[axis] = slice + (dir > 0 ? 1 : 0);
          base[u] = i;
          base[v] = j;

          const du = [0, 0, 0];
          du[u] = w;
          const dv = [0, 0, 0];
          dv[v] = h;

          const color = grid.colors[id];
          emitQuad(
            positions, normals, colors, indices,
            grid.baseY, base, du, dv, dx, dy, dz, dir, color, shade,
          );
          quadCount++;

          // Zero out the consumed rectangle so it isn't re-emitted.
          for (let b = 0; b < h; b++) {
            const rowBase = (j + b) * uSize + i;
            for (let a = 0; a < w; a++) mask[rowBase + a] = 0;
          }
          i += w;
        }
      }
    }
  }

  return {
    positions: Float32Array.from(positions),
    normals: Int8Array.from(normals),
    colors: Uint8Array.from(colors),
    indices: Uint32Array.from(indices),
    quadCount,
  };
}

function emitQuad(
  positions: number[],
  normals: number[],
  colors: number[],
  indices: number[],
  baseY: number,
  base: number[],
  du: number[],
  dv: number[],
  nx: number,
  ny: number,
  nz: number,
  dir: number,
  color: number,
  shade: number,
): void {
  const startVertex = positions.length / 3;

  // Four corners: base, base+du, base+du+dv, base+dv. baseY shifts world y.
  const x0 = base[0], y0 = base[1] + baseY, z0 = base[2];
  const corners = [
    [x0, y0, z0],
    [x0 + du[0], y0 + du[1], z0 + du[2]],
    [x0 + du[0] + dv[0], y0 + du[1] + dv[1], z0 + du[2] + dv[2]],
    [x0 + dv[0], y0 + dv[1], z0 + dv[2]],
  ];

  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const a = Math.round(shade * 255);

  for (const c of corners) {
    positions.push(c[0], c[1], c[2]);
    normals.push(nx, ny, nz);
    colors.push(r, g, b, a);
  }

  // Wind so the front face points along the normal. For negative directions we
  // flip the triangle order so back-face culling keeps the visible side.
  if (dir > 0) {
    indices.push(startVertex, startVertex + 1, startVertex + 2);
    indices.push(startVertex, startVertex + 2, startVertex + 3);
  } else {
    indices.push(startVertex, startVertex + 2, startVertex + 1);
    indices.push(startVertex, startVertex + 3, startVertex + 2);
  }
}
