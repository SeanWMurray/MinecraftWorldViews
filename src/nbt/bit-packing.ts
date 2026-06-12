/** Bits per palette index for a palette of the given size (Anvil minimum is 4). */
export function bitsForPalette(paletteSize: number): number {
  return Math.max(4, 32 - Math.clz32(paletteSize - 1));
}

/**
 * Unpacks 1.16+ bit-packed palette indices from a big-endian NBT long array
 * directly into `out`. Entries never span longs in this format, so each long
 * is processed as two 32-bit halves with plain integer ops — no BigInt
 * anywhere on the hot path, no intermediate allocation.
 */
export function unpackPackedInts(
  view: DataView,
  byteOffset: number,
  longCount: number,
  bitsPerEntry: number,
  out: Uint16Array,
): void {
  const entriesPerLong = (64 / bitsPerEntry) | 0;
  const mask = (1 << bitsPerEntry) - 1;
  const total = out.length;
  let i = 0;
  for (let l = 0; l < longCount && i < total; l++) {
    // Big-endian long: first 4 bytes are the high half. Bit offsets count
    // from the long's least-significant bit, i.e. from within `lo`.
    const hi = view.getUint32(byteOffset + l * 8);
    const lo = view.getUint32(byteOffset + l * 8 + 4);
    for (let e = 0; e < entriesPerLong && i < total; e++) {
      const bit = e * bitsPerEntry;
      let value: number;
      if (bit + bitsPerEntry <= 32) {
        value = (lo >>> bit) & mask;
      } else if (bit >= 32) {
        value = (hi >>> (bit - 32)) & mask;
      } else {
        value = ((lo >>> bit) | (hi << (32 - bit))) & mask;
      }
      out[i++] = value;
    }
  }
}
