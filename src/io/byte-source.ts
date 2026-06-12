/**
 * Random-access byte provider. Abstracts where region data lives (local file,
 * remote URL, in-memory buffer) so the parsing layer can stream exactly the
 * byte ranges it needs instead of loading whole files into memory.
 */
export interface ByteSource {
  /** Total size of the underlying data in bytes. */
  size(): Promise<number>;

  /**
   * Read `length` bytes starting at `offset`. Returns fewer bytes if the
   * range extends past the end of the data. The result may be a zero-copy
   * view into a larger buffer owned by the source.
   */
  read(offset: number, length: number): Promise<Uint8Array>;
}
