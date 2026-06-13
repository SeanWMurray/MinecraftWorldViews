import type { BlockState } from '../nbt/chunk';
import { isAirState } from '../nbt/chunk';

/**
 * A compact, render-oriented classification of a block state. The mesher needs
 * three things about every palette entry, and computing them once per palette
 * (not once per block) keeps the hot loop branch-light.
 */
export const enum BlockClass {
  /** Nothing is drawn; never produces a face and never hides a neighbour. */
  Empty = 0,
  /** A full opaque cube — hides the faces of opaque neighbours it touches. */
  Opaque = 1,
  /**
   * A full cube that draws but does not hide neighbours (leaves, glass, ice).
   * Two transparent cubes of the *same* type still cull the shared face so we
   * don't z-fight inside a block of leaves; different types both draw.
   */
  Transparent = 2,
}

/** Per-palette render data the mesher consumes. Parallel arrays, no objects. */
export interface PaletteInfo {
  /** BlockClass per palette index. */
  classes: Uint8Array;
  /** Packed 0xRRGGBB tint per palette index (alpha handled separately). */
  colors: Uint32Array;
}

/**
 * Blocks that render but do not occlude. Everything not air and not in this set
 * is treated as a full opaque cube. This is deliberately a denylist: unknown
 * modded blocks default to opaque, which is the safe choice for a solid mesh.
 */
const TRANSPARENT = new Set([
  'minecraft:glass',
  'minecraft:ice',
  'minecraft:frosted_ice',
  'minecraft:slime_block',
  'minecraft:honey_block',
]);

const TRANSPARENT_SUFFIX = ['_leaves', '_glass', '_glass_pane'];

/**
 * Blocks with no collision/solid geometry that we skip entirely. Plants,
 * fluids' surface decoration, redstone wire, etc. — they'd need cross/custom
 * models the cube mesher can't represent, so we treat them as empty rather
 * than drawing wrong full cubes.
 */
const NON_SOLID = new Set([
  'minecraft:water',
  'minecraft:lava',
  'minecraft:fire',
  'minecraft:redstone_wire',
  'minecraft:rail',
  'minecraft:torch',
  'minecraft:wall_torch',
  'minecraft:ladder',
  'minecraft:snow', // layer block, not a full cube
]);

const NON_SOLID_SUFFIX = ['_sapling', '_button', '_pressure_plate', '_carpet'];

function classifyName(name: string): BlockClass {
  if (NON_SOLID.has(name)) return BlockClass.Empty;
  for (const s of NON_SOLID_SUFFIX) if (name.endsWith(s)) return BlockClass.Empty;
  if (TRANSPARENT.has(name)) return BlockClass.Transparent;
  for (const s of TRANSPARENT_SUFFIX) if (name.endsWith(s)) return BlockClass.Transparent;
  return BlockClass.Opaque;
}

export function classifyState(state: BlockState): BlockClass {
  if (isAirState(state)) return BlockClass.Empty;
  return classifyName(state.name);
}

/**
 * FNV-1a hash → a stable, distinct-ish color for blocks we have no explicit
 * entry for. Same algorithm the inspector page uses so meshes and the 2D map
 * agree on colors.
 */
function hashColor(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Bias toward mid-bright, desaturated tones so the mesh doesn't look neon.
  const r = 80 + ((h >>> 16) & 0x7f);
  const g = 80 + ((h >>> 8) & 0x7f);
  const b = 80 + (h & 0x7f);
  return (r << 16) | (g << 8) | b;
}

const BLOCK_COLORS: Record<string, number> = {
  'minecraft:stone': 0x7d7d7d,
  'minecraft:dirt': 0x866043,
  'minecraft:grass_block': 0x5d923a,
  'minecraft:sand': 0xdbcf8e,
  'minecraft:gravel': 0x847e7c,
  'minecraft:bedrock': 0x565656,
  'minecraft:oak_log': 0x6b5430,
  'minecraft:oak_leaves': 0x3f6420,
  'minecraft:oak_planks': 0xa0814d,
  'minecraft:cobblestone': 0x7a7a7a,
  'minecraft:coal_ore': 0x47474a,
  'minecraft:iron_ore': 0xb6a187,
  'minecraft:snow_block': 0xf0f5f5,
  'minecraft:glass': 0xc7e4ec,
  'minecraft:ice': 0x9bbdf0,
  'minecraft:sandstone': 0xd6ca8a,
  'minecraft:clay': 0x9aa1ad,
};

export function colorForName(name: string): number {
  return BLOCK_COLORS[name] ?? hashColor(name);
}

/** Precompute class + color for every entry in a section palette. */
export function buildPaletteInfo(palette: BlockState[]): PaletteInfo {
  const classes = new Uint8Array(palette.length);
  const colors = new Uint32Array(palette.length);
  for (let i = 0; i < palette.length; i++) {
    classes[i] = classifyState(palette[i]);
    colors[i] = colorForName(palette[i].name);
  }
  return { classes, colors };
}
