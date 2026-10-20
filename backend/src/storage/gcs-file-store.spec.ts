import { GcsFileStore, type GcsBucket } from './gcs-file-store.js';

const KEY = 'payment-proofs/0f0e0d0c-0b0a-4908-8706-050403020100';
const NOW = new Date('2026-10-20T03:00:00.000Z');

function stubBucket() {
  const file = {
    save: vi.fn().mockResolvedValue(undefined),
    getSignedUrl: vi
      .fn()
      .mockResolvedValue(['https://storage.googleapis.com/signed']),
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

  it('uploads in one request with its type, never overwriting an object', async () => {
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

  // OWASP Top 10:2025 A05 (Injection): the name goes into a header GCS sets, so it is fully
  // percent-encoded and cannot end the value or add a header.
  it('opens a file as a 15-minute v4 read link that names it safely', async () => {
    await expect(
      store.open(KEY, {
        fileName: "bukti 'Ag;ustus' (*) ✅.png",
        contentType: 'image/png',
      }),
    ).resolves.toEqual({
      kind: 'redirect',
      url: 'https://storage.googleapis.com/signed',
    });

    expect(stub.file.getSignedUrl).toHaveBeenCalledWith({
      version: 'v4',
      action: 'read',
      expires: new Date('2026-10-20T03:15:00.000Z'),
      responseDisposition:
        "inline; filename*=UTF-8''bukti%20%27Ag%3Bustus%27%20%28%2A%29%20%E2%9C%85.png",
      responseType: 'image/png',
    });
  });

  it('dates each link from its own request, with the real clock by default', async () => {
    const real = new GcsFileStore(stub.bucket);
    const before = Date.now();

    await real.open(KEY, { fileName: 'a.png', contentType: 'image/png' });

    const { expires } = stub.file.getSignedUrl.mock.calls[0][0];
    expect(expires.getTime()).toBeGreaterThanOrEqual(before + 15 * 60_000);
  });

  it('removes a file, ignoring one already gone', async () => {
    await store.remove(KEY);

    expect(stub.file.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
  });

  it('refuses a key that is not a prefix and a UUID before asking the bucket', async () => {
    await expect(
      store.put('../x', Buffer.from('x'), 'image/png'),
    ).rejects.toThrow('Invalid storage key');
    await expect(
      store.open('../x', { fileName: 'a.png', contentType: 'image/png' }),
    ).rejects.toThrow('Invalid storage key');
    await expect(store.remove('../x')).rejects.toThrow('Invalid storage key');
    expect(stub.bucket.file).not.toHaveBeenCalled();
  });

  it('passes on a failed upload or signing, for the caller to answer', async () => {
    stub.file.save.mockRejectedValue(new Error('403 Forbidden'));
    stub.file.getSignedUrl.mockRejectedValue(new Error('signBlob denied'));

    await expect(store.put(KEY, Buffer.from('x'), 'image/png')).rejects.toThrow(
      '403 Forbidden',
    );
    await expect(
      store.open(KEY, { fileName: 'a.png', contentType: 'image/png' }),
    ).rejects.toThrow('signBlob denied');
  });
});
