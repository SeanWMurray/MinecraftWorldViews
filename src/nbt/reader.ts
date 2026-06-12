/** NBT binary tag ids. */
export const Tag = {
  End: 0,
  Byte: 1,
  Short: 2,
  Int: 3,
  Long: 4,
  Float: 5,
  Double: 6,
  ByteArray: 7,
  String: 8,
  List: 9,
  Compound: 10,
  IntArray: 11,
  LongArray: 12,
} as const;

export type TagId = (typeof Tag)[keyof typeof Tag];

const textDecoder = new TextDecoder();

/**
 * Forward-only cursor over big-endian NBT bytes. The lazy-parsing primitive:
 * callers read only the tags they care about and `skipValue()` everything
 * else. Skipping allocates nothing — fixed-size tags and primitive lists are
 * skipped with pure pointer arithmetic, never element by element.
 */
export class NbtReader {
  pos = 0;
  readonly view: DataView;

  constructor(readonly data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  u8(): number {
    return this.data[this.pos++];
  }

  i8(): number {
    return this.view.getInt8(this.pos++);
  }

  u16(): number {
    const v = this.view.getUint16(this.pos);
    this.pos += 2;
    return v;
  }

  i32(): number {
    const v = this.view.getInt32(this.pos);
    this.pos += 4;
    return v;
  }

  /** Reads a length-prefixed string. Manual ASCII fast path: tag names and block ids are almost always ASCII. */
  string(): string {
    const length = this.u16();
    const start = this.pos;
    this.pos += length;
    const data = this.data;
    for (let i = start; i < start + length; i++) {
      if (data[i] > 0x7f) return textDecoder.decode(data.subarray(start, start + length));
    }
    let s = '';
    for (let i = start; i < start + length; i++) s += String.fromCharCode(data[i]);
    return s;
  }

  skipString(): void {
    this.pos += 2 + this.view.getUint16(this.pos);
  }

  /** Skips one tag value of the given type without allocating. */
  skipValue(type: number): void {
    switch (type) {
      case Tag.Byte:
        this.pos += 1;
        return;
      case Tag.Short:
        this.pos += 2;
        return;
      case Tag.Int:
      case Tag.Float:
        this.pos += 4;
        return;
      case Tag.Long:
      case Tag.Double:
        this.pos += 8;
        return;
      case Tag.ByteArray:
        this.pos += 4 + this.view.getInt32(this.pos);
        return;
      case Tag.String:
        this.skipString();
        return;
      case Tag.List: {
        const itemType = this.u8();
        const count = this.i32();
        if (count <= 0) return;
        switch (itemType) {
          case Tag.Byte:
            this.pos += count;
            return;
          case Tag.Short:
            this.pos += count * 2;
            return;
          case Tag.Int:
          case Tag.Float:
            this.pos += count * 4;
            return;
          case Tag.Long:
          case Tag.Double:
            this.pos += count * 8;
            return;
          default:
            for (let i = 0; i < count; i++) this.skipValue(itemType);
            return;
        }
      }
      case Tag.Compound:
        for (;;) {
          const id = this.u8();
          if (id === Tag.End) return;
          this.skipString();
          this.skipValue(id);
        }
      case Tag.IntArray:
        this.pos += 4 + this.view.getInt32(this.pos) * 4;
        return;
      case Tag.LongArray:
        this.pos += 4 + this.view.getInt32(this.pos) * 8;
        return;
      default:
        throw new Error(`invalid NBT tag ${type} at byte ${this.pos}`);
    }
  }
}
