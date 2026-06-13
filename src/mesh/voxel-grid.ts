import type { ParsedChunk } from '../nbt/chunk';
import { blockIndex } from '../nbt/chunk';
import { BlockClass, buildPaletteInfo, type PaletteInfo } from './block-model';

/**
 * A dense, mesher-ready view of one chunk's blocks as flat typed arrays.
 *
 * The parsed chunk stores blocks per-section as palette indices; meshing wants
 * to look up arbitrary (x, y, z) — including one block past a face to test the
 * neighbour — without per-lookup section math or object access. So we flatten
 * the whole vertical column once into a single `Uint16Array` of *global* block
 * ids (an index into this grid's combined palette), padded by one block on all
 * six sides. The 1-block apron lets the mesher read neighbours at the chunk
 * edges as Empty without bounds-special-casing, so boundary faces are emitted.
 *
 * Coordinates are local: x,z in 0..15, y in 0..(height-1) where y=0 maps to the
 * lowest section's bottom. Pass through `idx()` to read the padded array.
 */
export class VoxelGrid {
  /** Block extent in each axis (always 16 in x/z; sections*16 in y). */
  readonly sizeX = 16;
  readonly sizeZ = 16;
  readonly sizeY: number;
  /** World y of local y=0 (lowest section base). */
  readonly baseY: number;

  /** Per-global-id class and color (index 0 is always Empty/air). */
  readonly classes: Uint8Array;
  readonly colors: Uint32Array;

  /** Padded id grid; dimensions are (size+2) on every axis. */
  private readonly ids: Uint16Array;
  private readonly strideZ: number;
  private readonly strideY: number;

  private constructor(
    sizeY: number,
    baseY: number,
    ids: Uint16Array,
    classes: Uint8Array,
    colors: Uint32Array,
  ) {
    this.sizeY = sizeY;
    this.baseY = baseY;
    this.ids = ids;
    this.classes = classes;
    this.colors = colors;
    this.strideZ = this.sizeX + 2;
    this.strideY = this.strideZ * (this.sizeZ + 2);
  }

  /** Padded-array index for local coords; any axis may be -1..size for the apron. */
  private idx(x: number, y: number, z: number): number {
    return (x + 1) + (z + 1) * this.strideZ + (y + 1) * this.strideY;
  }

  /** Global block id at local coords (0 = empty, including the apron). */
  idAt(x: number, y: number, z: number): number {
    return this.ids[this.idx(x, y, z)];
  }

  classAt(x: number, y: number, z: number): BlockClass {
    return this.classes[this.ids[this.idx(x, y, z)]] as BlockClass;
  }

  /**
   * Flattens a parsed chunk into a VoxelGrid. Builds a combined palette across
   * all sections (deduplicated by name+properties identity isn't needed — we
   * just need stable per-id class/color, so we key on the palette entry's
   * name since color/class derive from name).
   */
  static fromChunk(chunk: ParsedChunk): VoxelGrid | null {
    const sections = chunk.sections;
    if (sections.length === 0) return null;

    const minSectionY = sections[0].y;
    const maxSectionY = sections[sections.length - 1].y;
    const sectionSpan = maxSectionY - minSectionY + 1;
    const sizeY = sectionSpan * 16;
    const baseY = minSectionY * 16;

    // Combined palette: id 0 reserved for empty. Reuse ids for identical names
    // so the per-id class/color tables stay small regardless of section count.
    const idByName = new Map<string, number>();
    idByName.set('', 0); // empty sentinel
    const classes: number[] = [BlockClass.Empty];
    const colors: number[] = [0];

    const strideZ = 18;
    const strideY = strideZ * 18;
    const ids = new Uint16Array(strideY * (sizeY + 2));

    for (const section of sections) {
      const info: PaletteInfo = buildPaletteInfo(section.palette);
      // Map this section's local palette indices to combined global ids.
      const localToGlobal = new Uint16Array(section.palette.length);
      for (let p = 0; p < section.palette.length; p++) {
        if (info.classes[p] === BlockClass.Empty) {
          localToGlobal[p] = 0;
          continue;
        }
        const name = section.palette[p].name;
        let gid = idByName.get(name);
        if (gid === undefined) {
          gid = classes.length;
          idByName.set(name, gid);
          classes.push(info.classes[p]);
          colors.push(info.colors[p]);
        }
        localToGlobal[p] = gid;
      }

      const yOffset = (section.y - minSectionY) * 16;
      const blocks = section.blocks;
      if (blocks === null) {
        // Uniform section: every cell is palette[0].
        const gid = localToGlobal[0];
        if (gid === 0) continue; // uniform air — leave the apron-zeros
        for (let y = 0; y < 16; y++) {
          for (let z = 0; z < 16; z++) {
            let o = (0 + 1) + (z + 1) * strideZ + (yOffset + y + 1) * strideY;
            for (let x = 0; x < 16; x++) ids[o++] = gid;
          }
        }
        continue;
      }

      for (let y = 0; y < 16; y++) {
        for (let z = 0; z < 16; z++) {
          let src = blockIndex(0, y, z);
          let dst = (0 + 1) + (z + 1) * strideZ + (yOffset + y + 1) * strideY;
          for (let x = 0; x < 16; x++) {
            ids[dst++] = localToGlobal[blocks[src++]];
          }
        }
      }
    }

    return new VoxelGrid(
      sizeY,
      baseY,
      ids,
      Uint8Array.from(classes),
      Uint32Array.from(colors),
    );
  }
}
