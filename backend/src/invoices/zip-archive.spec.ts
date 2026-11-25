import { inflateRawSync } from 'node:zlib';
import { zipFiles, type ZipEntry } from './zip-archive.js';

/** Reads a local header back so a test proves the bytes are a real ZIP, not a stub. */
function readZip(archive: Buffer): Map<string, string> {
  const entries = new Map<string, string>();
  let offset = 0;
  let method = 8;
  while (archive.readUInt32LE(offset) === 0x04034b50) {
    method = archive.readUInt16LE(offset + 8);
    const compressed = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const name = archive.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    const data = archive.subarray(start, start + compressed);
    entries.set(name, inflateRawSync(data, { finishFlush: 4 }).toString('utf8'));
    offset = start + compressed;
  }
  expect(archive.readUInt32LE(offset)).toBe(
    entries.size > 0 ? 0x02014b50 : 0x06054b50,
  );
  expect(method).toBe(8);
  return entries;
}

describe('zipFiles (31.4)', () => {
  it('writes an empty archive when there is nothing to export', () => {
    const archive = zipFiles([]);
    expect(readZip(archive).size).toBe(0);
    expect(archive.readUInt32LE(0)).toBe(0x06054b50);
  });

  it('writes string and Buffer entries under their UTF-8 names', () => {
    const files: ZipEntry[] = [
      { name: 'Rekap_Invoice_20260720.xlsx', content: 'sheet' },
      { name: 'Catatan_Budi.txt', content: Buffer.from('catatan') },
    ];
    const entries = readZip(zipFiles(files));
    expect([...entries.keys()]).toEqual(files.map(({ name }) => name));
    expect(entries.get('Rekap_Invoice_20260720.xlsx')).toBe('sheet');
    expect(entries.get('Catatan_Budi.txt')).toBe('catatan');
  });
});
