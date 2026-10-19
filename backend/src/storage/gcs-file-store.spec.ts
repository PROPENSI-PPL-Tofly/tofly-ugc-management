import { GcsFileStore, type GcsBucket } from './gcs-file-store.js';

const KEY = 'payment-proofs/0f0e0d0c-0b0a-4908-8706-050403020100';
const NOW = new Date('2026-10-20T03:00:00.000Z');

function stubBucket() {
  const file = {
    save: vi.fn().mockResolvedValue(undefined),
    getSignedUrl: vi
      .fn()
      .mockResolvedValue([
        'https://storage.googleapis.com/b/o?X-Goog-Signature=s',
      ]),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const bucket = { file: vi.fn().mockReturnValue(file) };
  return { bucket: bucket as GcsBucket & typeof bucket, file };
}

describe('GcsFileStore', () => {
  let stub: ReturnType<typeof stubBucket>;
  let store: GcsFileStore;

  beforeEach(() => {
    stub = stubBucket();
    store = new GcsFileStore(stub.bucket, () => NOW);
  });

  describe('accepts', () => {
    it('uploads in one request with the type, never overwriting an object', async () => {
      const bytes = Buffer.from('%PDF-1.7');

      await store.put(KEY, bytes, 'application/pdf');

      expect(stub.bucket.file).toHaveBeenCalledWith(KEY);
      expect(stub.file.save).toHaveBeenCalledWith(bytes, {
        resumable: false,
        contentType: 'application/pdf',
        metadata: { cacheControl: 'private, no-store' },
        preconditionOpts: { ifGenerationMatch: 0 },
      });
    });

    it('opens a file as a 15-minute v4 read link that names it and its type', async () => {
      await expect(
        store.open(KEY, {
          fileName: 'bukti agustus.pdf',
          contentType: 'application/pdf',
        }),
      ).resolves.toEqual({
        kind: 'redirect',
        url: 'https://storage.googleapis.com/b/o?X-Goog-Signature=s',
      });

      expect(stub.file.getSignedUrl).toHaveBeenCalledWith({
        version: 'v4',
        action: 'read',
        expires: new Date('2026-10-20T03:15:00.000Z'),
        responseDisposition: "inline; filename*=UTF-8''bukti%20agustus.pdf",
        responseType: 'application/pdf',
      });
    });

    it('removes a file, ignoring one already gone', async () => {
      await store.remove(KEY);

      expect(stub.file.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
    });
  });

  describe('refuses', () => {
    it('passes on a failed upload', async () => {
      stub.file.save.mockRejectedValue(new Error('403 Forbidden'));

      await expect(
        store.put(KEY, Buffer.from('x'), 'image/png'),
      ).rejects.toThrow('403 Forbidden');
    });

    it('passes on a link that could not be signed', async () => {
      stub.file.getSignedUrl.mockRejectedValue(new Error('signBlob denied'));

      await expect(
        store.open(KEY, { fileName: 'a.png', contentType: 'image/png' }),
      ).rejects.toThrow('signBlob denied');
    });

    it.each(['../x', 'payment-proofs/not-a-uuid', ''])(
      'the key %j before asking the bucket',
      async (key) => {
        await expect(
          store.put(key, Buffer.from('x'), 'image/png'),
        ).rejects.toThrow('Invalid storage key');
        await expect(
          store.open(key, { fileName: 'a.png', contentType: 'image/png' }),
        ).rejects.toThrow('Invalid storage key');
        await expect(store.remove(key)).rejects.toThrow('Invalid storage key');
        expect(stub.bucket.file).not.toHaveBeenCalled();
      },
    );
  });

  describe('edge:', () => {
    // OWASP Top 10:2025 A05 (Injection): the shown name goes into a response header GCS sets,
    // so it is percent-encoded and cannot add a header or end the value early.
    it('encodes a name with quotes, a semicolon and non-ASCII characters', async () => {
      await store.open(KEY, {
        fileName: "bukti 'Ag;ustus' (*) ✅.png",
        contentType: 'image/png',
      });

      // Upper-case hex throughout, as RFC 3986 recommends and encodeURIComponent writes.
      expect(stub.file.getSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          responseDisposition:
            "inline; filename*=UTF-8''bukti%20%27Ag%3Bustus%27%20%28%2A%29%20%E2%9C%85.png",
        }),
      );
    });

    it('reads the clock on every open, so each link lasts 15 minutes from its request', async () => {
      let now = NOW;
      const ticking = new GcsFileStore(stub.bucket, () => now);

      await ticking.open(KEY, { fileName: 'a.png', contentType: 'image/png' });
      now = new Date('2026-10-20T04:00:00.000Z');
      await ticking.open(KEY, { fileName: 'a.png', contentType: 'image/png' });

      expect(stub.file.getSignedUrl.mock.calls.map(([o]) => o.expires)).toEqual(
        [
          new Date('2026-10-20T03:15:00.000Z'),
          new Date('2026-10-20T04:15:00.000Z'),
        ],
      );
    });

    it('uses the real clock when none is given', async () => {
      const real = new GcsFileStore(stub.bucket);
      const before = Date.now();

      await real.open(KEY, { fileName: 'a.png', contentType: 'image/png' });

      const { expires } = stub.file.getSignedUrl.mock.calls[0][0];
      expect(expires.getTime()).toBeGreaterThanOrEqual(before + 15 * 60_000);
    });
  });
});
