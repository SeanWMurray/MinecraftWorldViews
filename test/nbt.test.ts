import { describe, expect, it } from 'vitest';
import { bitsForPalette, unpackPackedInts } from '../src/nbt/bit-packing';
import { blockIndex, isAirState, parseChunk } from '../src/nbt/chunk';
import { Tag } from '../src/nbt/reader';
import { NbtWriter, packLongs, writePaletteEntry } from './build-nbt';

describe('bitsForPalette', () => {
  it('clamps to the Anvil minimum of 4 bits', () => {
    expect(bitsForPalette(2)).toBe(4);
    expect(bitsForPalette(16)).toBe(4);
  });

  it('grows with palette size', () => {
    expect(bitsForPalette(17)).toBe(5);
    expect(bitsForPalette(33)).toBe(6);
    expect(bitsForPalette(255)).toBe(8);
    expect(bitsForPalette(4096)).toBe(12);
  });
});

describe('unpackPackedInts', () => {
  function roundTrip(values: number[], bits: number): Uint16Array {
    const longs = packLongs(values, bits);
    const buf = new Uint8Array(longs.length * 8);
    const view = new DataView(buf.buffer);
    longs.forEach((v, i) => view.setBigUint64(i * 8, BigInt.asUintN(64, v)));
    const out = new Uint16Array(values.length);
    unpackPackedInts(view, 0, longs.length, bits, out);
    return out;
  }

  it('round-trips 4-bit entries (aligned within u32 halves)', () => {
    const values = Array.from({ length: 4096 }, (_, i) => i % 16);
    expect([...roundTrip(values, 4)]).toEqual(values);
  });

  it('round-trips 6-bit entries (straddling the 32-bit boundary)', () => {
    // With 6 bits, the entry at bit offset 30 spans both u32 halves of a long.
    const values = Array.from({ length: 4096 }, (_, i) => (i * 31) % 64);
    expect([...roundTrip(values, 6)]).toEqual(values);
  });

  it('round-trips 12-bit entries', () => {
    const values = Array.from({ length: 4096 }, (_, i) => (i * 997) % 4096);
    expect([...roundTrip(values, 12)]).toEqual(values);
  });
});

describe('blockIndex / isAirState', () => {
  it('uses YZX ordering', () => {
    expect(blockIndex(0, 0, 0)).toBe(0);
    expect(blockIndex(15, 0, 0)).toBe(15);
    expect(blockIndex(0, 0, 1)).toBe(16);
    expect(blockIndex(0, 1, 0)).toBe(256);
    expect(blockIndex(15, 15, 15)).toBe(4095);
  });

  it('recognises all air variants', () => {
    expect(isAirState({ name: 'minecraft:air', properties: null })).toBe(true);
    expect(isAirState({ name: 'minecraft:cave_air', properties: null })).toBe(true);
    expect(isAirState({ name: 'minecraft:void_air', properties: null })).toBe(true);
    expect(isAirState({ name: 'minecraft:stone', properties: null })).toBe(false);
  });
});

/** Builds a 1.18+ chunk: junk to skip, an air-only section, and two packed sections. */
function buildModernChunk(): { nbt: Uint8Array; valuesB: number[]; valuesC: number[] } {
  const w = new NbtWriter();
  w.startCompound('');
  w.intTag('xPos', 3).intTag('zPos', -7).intTag('yPos', -4);
  w.stringTag('status', 'minecraft:full');

  // Junk branches the lazy parser must skip without tripping up.
  w.longTag('InhabitedTime', 123456789n);
  w.startCompound('Heightmaps').longArrayTag('MOTION_BLOCKING', packLongs(new Array(256).fill(99), 9)).end();
  w.startList('block_entities', Tag.End, 0);
  w.startList('fluid_ticks', Tag.Compound, 1);
  w.intTag('t', 1).stringTag('i', 'minecraft:water').end();

  w.startList('sections', Tag.Compound, 3);

  // Section y=-1: uniform air (palette of 1, no data).
  w.byteTag('Y', -1);
  w.startCompound('block_states');
  w.startList('palette', Tag.Compound, 1);
  writePaletteEntry(w, 'minecraft:air');
  w.end(); // block_states
  w.byteArrayTag('SkyLight', 2048); // junk inside section
  w.end(); // section

  // Section y=0: 3-entry palette, 4 bits.
  const valuesB = Array.from({ length: 4096 }, (_, i) => i % 3);
  w.byteTag('Y', 0);
  w.startCompound('block_states');
  w.startList('palette', Tag.Compound, 3);
  writePaletteEntry(w, 'minecraft:air');
  writePaletteEntry(w, 'minecraft:stone');
  writePaletteEntry(w, 'minecraft:water', { level: '0' });
  w.longArrayTag('data', packLongs(valuesB, 4));
  w.end(); // block_states
  w.end(); // section

  // Section y=1: 33-entry palette forces 6 bits (entries straddle u32 halves).
  const valuesC = Array.from({ length: 4096 }, (_, i) => i % 33);
  w.byteTag('Y', 1);
  w.startCompound('block_states');
  w.startList('palette', Tag.Compound, 33);
  for (let i = 0; i < 33; i++) writePaletteEntry(w, `minecraft:block_${i}`);
  w.longArrayTag('data', packLongs(valuesC, 6));
  w.end(); // block_states
  w.end(); // section

  w.startCompound('structures').end();
  w.end(); // root
  return { nbt: w.bytes(), valuesB, valuesC };
}

describe('parseChunk (1.18+ layout)', () => {
  const { nbt, valuesB, valuesC } = buildModernChunk();
  const chunk = parseChunk(nbt);

  it('reads coordinates and status, skipping unrelated branches', () => {
    expect(chunk.x).toBe(3);
    expect(chunk.z).toBe(-7);
    expect(chunk.status).toBe('minecraft:full');
  });

  it('returns sections sorted by y', () => {
    expect(chunk.sections.map((s) => s.y)).toEqual([-1, 0, 1]);
  });

  it('represents uniform sections without a block array', () => {
    const air = chunk.sections[0];
    expect(air.palette).toEqual([{ name: 'minecraft:air', properties: null }]);
    expect(air.blocks).toBeNull();
  });

  it('unpacks 4-bit packed sections and palette properties', () => {
    const section = chunk.sections[1];
    expect(section.palette.map((p) => p.name)).toEqual([
      'minecraft:air',
      'minecraft:stone',
      'minecraft:water',
    ]);
    expect(section.palette[2].properties).toEqual({ level: '0' });
    expect(section.blocks).toHaveLength(4096);
    expect([...section.blocks!]).toEqual(valuesB);
  });

  it('unpacks 6-bit packed sections', () => {
    const section = chunk.sections[2];
    expect(section.palette).toHaveLength(33);
    expect([...section.blocks!]).toEqual(valuesC);
  });
});

describe('parseChunk (legacy Level layout, 1.16-1.17)', () => {
  it('reads sections nested under Level with Palette/BlockStates keys', () => {
    const values = Array.from({ length: 4096 }, (_, i) => i % 2);
    const w = new NbtWriter();
    w.startCompound('');
    w.startCompound('Level');
    w.intTag('xPos', 11).intTag('zPos', 22);
    w.stringTag('Status', 'full');
    w.startList('Sections', Tag.Compound, 1);
    w.byteTag('Y', 4);
    w.startList('Palette', Tag.Compound, 2);
    writePaletteEntry(w, 'minecraft:air');
    writePaletteEntry(w, 'minecraft:dirt');
    w.longArrayTag('BlockStates', packLongs(values, 4));
    w.end(); // section
    w.end(); // Level
    w.end(); // root

    const chunk = parseChunk(w.bytes());
    expect(chunk.x).toBe(11);
    expect(chunk.z).toBe(22);
    expect(chunk.status).toBe('full');
    expect(chunk.sections).toHaveLength(1);
    expect(chunk.sections[0].y).toBe(4);
    expect(chunk.sections[0].palette[1].name).toBe('minecraft:dirt');
    expect([...chunk.sections[0].blocks!]).toEqual(values);
  });
});

describe('parseChunk validation', () => {
  it('rejects bytes that are not a compound', () => {
    expect(() => parseChunk(new Uint8Array([Tag.Byte, 0, 0, 5]))).toThrow(/compound/);
  });
});
