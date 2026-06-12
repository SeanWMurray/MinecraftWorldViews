import { Tag } from '../src/nbt/reader';

/** Minimal big-endian NBT writer for building test fixtures. */
export class NbtWriter {
  private buf = new Uint8Array(1024);
  private view = new DataView(this.buf.buffer);
  private len = 0;

  private ensure(extra: number): void {
    if (this.len + extra <= this.buf.byteLength) return;
    const next = new Uint8Array(Math.max(this.buf.byteLength * 2, this.len + extra));
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  u8(v: number): this {
    this.ensure(1);
    this.buf[this.len++] = v & 0xff;
    return this;
  }

  i16(v: number): this {
    this.ensure(2);
    this.view.setInt16(this.len, v);
    this.len += 2;
    return this;
  }

  i32(v: number): this {
    this.ensure(4);
    this.view.setInt32(this.len, v);
    this.len += 4;
    return this;
  }

  i64(v: bigint): this {
    this.ensure(8);
    this.view.setBigUint64(this.len, BigInt.asUintN(64, v));
    this.len += 8;
    return this;
  }

  str(s: string): this {
    this.ensure(2 + s.length);
    this.view.setUint16(this.len, s.length);
    this.len += 2;
    for (let i = 0; i < s.length; i++) this.buf[this.len++] = s.charCodeAt(i);
    return this;
  }

  tag(id: number, name: string): this {
    return this.u8(id).str(name);
  }

  byteTag(name: string, v: number): this {
    return this.tag(Tag.Byte, name).u8(v);
  }

  intTag(name: string, v: number): this {
    return this.tag(Tag.Int, name).i32(v);
  }

  longTag(name: string, v: bigint): this {
    return this.tag(Tag.Long, name).i64(v);
  }

  stringTag(name: string, v: string): this {
    return this.tag(Tag.String, name).str(v);
  }

  longArrayTag(name: string, longs: bigint[]): this {
    this.tag(Tag.LongArray, name).i32(longs.length);
    for (const v of longs) this.i64(v);
    return this;
  }

  byteArrayTag(name: string, bytes: number): this {
    this.tag(Tag.ByteArray, name).i32(bytes);
    this.ensure(bytes);
    this.len += bytes; // zero-filled junk
    return this;
  }

  startCompound(name: string): this {
    return this.tag(Tag.Compound, name);
  }

  end(): this {
    return this.u8(Tag.End);
  }

  startList(name: string, itemType: number, count: number): this {
    return this.tag(Tag.List, name).u8(itemType).i32(count);
  }

  bytes(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

/** Packs values the way 1.16+ stores blockstates: LSB-first, never spanning longs. */
export function packLongs(values: ArrayLike<number>, bitsPerEntry: number): bigint[] {
  const entriesPerLong = Math.floor(64 / bitsPerEntry);
  const longs: bigint[] = [];
  for (let i = 0; i < values.length; i += entriesPerLong) {
    let v = 0n;
    for (let e = 0; e < entriesPerLong && i + e < values.length; e++) {
      v |= BigInt(values[i + e]) << BigInt(e * bitsPerEntry);
    }
    longs.push(v);
  }
  return longs;
}

/** Writes one palette entry (a nameless compound inside a list). */
export function writePaletteEntry(
  w: NbtWriter,
  name: string,
  properties?: Record<string, string>,
): void {
  w.stringTag('Name', name);
  if (properties) {
    w.startCompound('Properties');
    for (const [key, value] of Object.entries(properties)) w.stringTag(key, value);
    w.end();
  }
  w.end();
}
