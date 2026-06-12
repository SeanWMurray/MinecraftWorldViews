import type { RegionFile } from '../io/region-file';
import { bitsForPalette, unpackPackedInts } from './bit-packing';
import { NbtReader, Tag } from './reader';

/** One palette entry: a block id plus its blockstate properties, if any. */
export interface BlockState {
  name: string;
  properties: Record<string, string> | null;
}

export interface ChunkSection {
  /** Section Y index (world y spans y*16 .. y*16+15). */
  y: number;
  palette: BlockState[];
  /**
   * 4096 palette indices in YZX order (see `blockIndex`), or null when the
   * entire section is a single state — palette[0].
   */
  blocks: Uint16Array | null;
}

export interface ParsedChunk {
  /** Absolute chunk coordinates. */
  x: number;
  z: number;
  status: string | null;
  /** Sorted by ascending section y. */
  sections: ChunkSection[];
}

/** Index into a section's `blocks` array for local coordinates (0-15 each). */
export function blockIndex(x: number, y: number, z: number): number {
  return (((y << 4) | z) << 4) | x;
}

const AIR_STATES = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);

export function isAirState(state: BlockState): boolean {
  return AIR_STATES.has(state.name);
}

/**
 * Lazy chunk parser: walks the NBT tree reading only what rendering needs
 * (coordinates, status, sections' palettes and packed blockstates) and skips
 * every other branch — entities, heightmaps, lighting, tick queues — with
 * pure pointer arithmetic. Packed indices are unpacked straight out of the
 * NBT buffer into one Uint16Array per section; no tag object tree is built.
 *
 * Supports the 1.18+ layout (root `sections`/`block_states`) and the
 * 1.16-1.17 layout (`Level.Sections` with `Palette`/`BlockStates`).
 */
export function parseChunk(nbt: Uint8Array): ParsedChunk {
  const r = new NbtReader(nbt);
  if (r.u8() !== Tag.Compound) throw new Error('chunk NBT must start with a compound tag');
  r.skipString();
  const chunk: ParsedChunk = { x: 0, z: 0, status: null, sections: [] };
  readChunkCompound(r, chunk, true);
  chunk.sections.sort((a, b) => a.y - b.y);
  return chunk;
}

/** Reads a chunk's raw bytes from a region and parses them on this thread. */
export async function readParsedChunk(
  region: RegionFile,
  x: number,
  z: number,
): Promise<ParsedChunk | null> {
  const nbt = await region.readChunk(x, z);
  return nbt === null ? null : parseChunk(nbt);
}

function readChunkCompound(r: NbtReader, chunk: ParsedChunk, allowLevel: boolean): void {
  for (;;) {
    const id = r.u8();
    if (id === Tag.End) return;
    const name = r.string();
    if (id === Tag.Int && name === 'xPos') {
      chunk.x = r.i32();
    } else if (id === Tag.Int && name === 'zPos') {
      chunk.z = r.i32();
    } else if (id === Tag.String && (name === 'Status' || name === 'status')) {
      chunk.status = r.string();
    } else if (id === Tag.List && (name === 'sections' || name === 'Sections')) {
      readSections(r, chunk);
    } else if (id === Tag.Compound && name === 'Level' && allowLevel) {
      // Pre-1.18 chunks nest everything under Level.
      readChunkCompound(r, chunk, false);
    } else {
      r.skipValue(id);
    }
  }
}

function readSections(r: NbtReader, chunk: ParsedChunk): void {
  const itemType = r.u8();
  const count = r.i32();
  if (itemType !== Tag.Compound) {
    for (let i = 0; i < count; i++) r.skipValue(itemType);
    return;
  }
  for (let i = 0; i < count; i++) {
    const section = readSection(r);
    if (section !== null) chunk.sections.push(section);
  }
}

function readSection(r: NbtReader): ChunkSection | null {
  let y = 0;
  let palette: BlockState[] | null = null;
  let dataOffset = -1;
  let dataLongs = 0;

  for (;;) {
    const id = r.u8();
    if (id === Tag.End) break;
    const name = r.string();
    if (id === Tag.Byte && name === 'Y') {
      y = r.i8();
    } else if (id === Tag.Compound && name === 'block_states') {
      // 1.18+: { palette: List<Compound>, data: LongArray }
      for (;;) {
        const innerId = r.u8();
        if (innerId === Tag.End) break;
        const innerName = r.string();
        if (innerId === Tag.List && innerName === 'palette') {
          palette = readPalette(r);
        } else if (innerId === Tag.LongArray && innerName === 'data') {
          dataLongs = r.i32();
          dataOffset = r.pos;
          r.pos += dataLongs * 8;
        } else {
          r.skipValue(innerId);
        }
      }
    } else if (id === Tag.List && name === 'Palette') {
      palette = readPalette(r); // 1.16-1.17
    } else if (id === Tag.LongArray && name === 'BlockStates') {
      dataLongs = r.i32();
      dataOffset = r.pos;
      r.pos += dataLongs * 8;
    } else {
      r.skipValue(id);
    }
  }

  // Sections without block palettes (e.g. biome/light-only) carry no geometry.
  if (palette === null || palette.length === 0) return null;

  let blocks: Uint16Array | null = null;
  if (palette.length > 1 && dataOffset >= 0) {
    blocks = new Uint16Array(4096);
    unpackPackedInts(r.view, dataOffset, dataLongs, bitsForPalette(palette.length), blocks);
  }
  return { y, palette, blocks };
}

function readPalette(r: NbtReader): BlockState[] {
  const itemType = r.u8();
  const count = r.i32();
  const palette: BlockState[] = [];
  if (itemType !== Tag.Compound) {
    for (let i = 0; i < count; i++) r.skipValue(itemType);
    return palette;
  }
  for (let i = 0; i < count; i++) {
    let name = '';
    let properties: Record<string, string> | null = null;
    for (;;) {
      const id = r.u8();
      if (id === Tag.End) break;
      const key = r.string();
      if (id === Tag.String && key === 'Name') {
        name = r.string();
      } else if (id === Tag.Compound && key === 'Properties') {
        properties = {};
        for (;;) {
          const propId = r.u8();
          if (propId === Tag.End) break;
          const propKey = r.string();
          if (propId === Tag.String) {
            properties[propKey] = r.string();
          } else {
            r.skipValue(propId);
          }
        }
      } else {
        r.skipValue(id);
      }
    }
    palette.push({ name, properties });
  }
  return palette;
}
