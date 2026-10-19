import {
  ConflictException,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { Readable } from 'node:stream';
import request from 'supertest';
import { AdminGuard, type AdminRequest } from '../auth/admin.guard.js';
import { InvoiceCommentsService } from './invoice-comments.service.js';
import { InvoicePaymentsController } from './invoice-payments.controller.js';
import { PROOF_MAX_BYTES } from './payment-proof-file.js';
import { PaymentProofService } from './payment-proof.service.js';

const CONTRACT = '11111111-1111-4111-8111-111111111111';
const ADMIN = '44444444-4444-4444-8444-444444444444';
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n');
const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const INVALID = {
  code: 'PROOF_INVALID',
  message: 'File bukti pembayaran harus PDF, JPG, atau PNG.',
};
const TOO_LARGE = {
  code: 'PROOF_TOO_LARGE',
  message: 'Ukuran file maksimal 5 MB.',
};

/** A buffer of exactly `size` bytes that starts with `head`. */
function sized(head: Buffer, size: number): Buffer {
  const bytes = Buffer.alloc(size);
  head.copy(bytes);
  return bytes;
}

describe('InvoicePaymentsController', () => {
  it('is open to signed-in admins only', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, InvoicePaymentsController),
    ).toEqual([AdminGuard]);
  });

  const proofs = { upload: vi.fn(), open: vi.fn() };
  const comments = { list: vi.fn(), add: vi.fn() };
  // The admin the guard resolved; null plays a guard that let a request through unsigned.
  let principal: AdminRequest['principal'] | null;
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [InvoicePaymentsController],
      providers: [
        { provide: PaymentProofService, useValue: proofs },
        { provide: InvoiceCommentsService, useValue: comments },
      ],
    })
      .overrideGuard(AdminGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest<AdminRequest>();
          if (principal) req.principal = principal;
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    principal = { userId: ADMIN, role: 'admin' };
    proofs.upload.mockResolvedValue({
      fileName: 'bukti.pdf',
      url: `/api/invoices/${CONTRACT}/payment-proof`,
      uploadedAt: '2026-10-20T03:00:00.000Z',
      invoiceStatus: 'payment_uploaded',
    });
  });

  function upload(contractId = CONTRACT) {
    return request(app.getHttpServer()).post(
      `/invoices/${contractId}/payment-proof`,
    );
  }

  describe('POST /invoices/:contractId/payment-proof', () => {
    // multer reads browser file names as latin1 unless told otherwise: an emoji name is the bug.
    it('hands the service the bytes, type, UTF-8 name and the signed-in admin', async () => {
      const res = await upload().attach('file', PDF, 'Bukti transfer ✅.pdf');

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        fileName: 'bukti.pdf',
        url: `/api/invoices/${CONTRACT}/payment-proof`,
        uploadedAt: '2026-10-20T03:00:00.000Z',
        invoiceStatus: 'payment_uploaded',
      });
      expect(proofs.upload).toHaveBeenCalledExactlyOnceWith(
        CONTRACT,
        {
          bytes: PDF,
          contentType: 'application/pdf',
          fileName: 'Bukti transfer ✅.pdf',
        },
        ADMIN,
      );
    });

    // busboy treats its size limit inclusively, so a limit of exactly 5 MB refused a 5 MB file.
    it("takes exactly 5 MB and refuses one byte more in the admin's words (off by one)", async () => {
      const exact = await upload().attach(
        'file',
        sized(PNG_HEAD, PROOF_MAX_BYTES),
        'a.png',
      );
      const over = await upload().attach(
        'file',
        sized(PDF, PROOF_MAX_BYTES + 1),
        'b.pdf',
      );

      expect(exact.status).toBe(201);
      expect(over.status).toBe(422);
      expect(over.body).toEqual(TOO_LARGE);
      expect(proofs.upload).toHaveBeenCalledTimes(1);
    });

    // OWASP Top 10:2025 A06 (Insecure Design): every way the form can be wrong is a 422 in the
    // admin's words, never Nest's raw 400/413, and never reaches the service.
    it.each([
      ['no file', (call: request.Test) => call],
      [
        'a body that is not multipart',
        (call: request.Test) => call.send({ file: 'x' }),
      ],
      [
        'two files',
        (call: request.Test) =>
          call.attach('file', PDF, 'a.pdf').attach('file', PDF, 'b.pdf'),
      ],
      [
        'another field name',
        (call: request.Test) => call.attach('proof', PDF, 'a.pdf'),
      ],
      [
        'a forged text field',
        (call: request.Test) =>
          call.field('uploadedBy', 'x').attach('file', PDF, 'a.pdf'),
      ],
      [
        'a program renamed .png',
        (call: request.Test) =>
          call.attach('file', Buffer.from('MZ\x90\x00'), {
            filename: 'a.png',
            contentType: 'image/png',
          }),
      ],
    ])('refuses %s', async (_case, build) => {
      const res = await build(upload());

      expect(res.status).toBe(422);
      expect(res.body).toEqual(INVALID);
      expect(proofs.upload).not.toHaveBeenCalled();
    });

    it("passes on the service's conflict as it was worded", async () => {
      const refusal = { code: 'INVOICE_NOT_AWAITING_PROOF', message: 'x' };
      proofs.upload.mockRejectedValue(new ConflictException(refusal));

      const res = await upload().attach('file', PDF, 'a.pdf');

      expect(res.status).toBe(409);
      expect(res.body).toEqual(refusal);
    });
  });

  describe('GET /invoices/:contractId/payment-proof', () => {
    it('redirects to the signed link, which nothing may cache or leak in a referrer', async () => {
      proofs.open.mockResolvedValue({
        kind: 'redirect',
        url: 'https://storage.googleapis.com/signed',
      });

      const res = await request(app.getHttpServer()).get(
        `/invoices/${CONTRACT}/payment-proof`,
      );

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(
        'https://storage.googleapis.com/signed',
      );
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(proofs.open).toHaveBeenCalledWith(CONTRACT, {});
    });

    // OWASP Top 10:2025 A05 (Injection): the name is percent-encoded into the header, and the
    // browser may not sniff the bytes into something that runs.
    it('streams a local file inline, safely named, typed and never sniffed', async () => {
      proofs.open.mockResolvedValue({
        kind: 'stream',
        stream: Readable.from([PDF]),
        fileName: 'bukti "asli" ✅.pdf',
        contentType: 'application/pdf',
        size: PDF.length,
      });

      const res = await request(app.getHttpServer())
        .get(`/invoices/${CONTRACT}/payment-proof`)
        .buffer(true)
        .parse((response, done) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => done(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(PDF);
      expect(res.headers).toMatchObject({
        'content-type': 'application/pdf',
        'content-length': String(PDF.length),
        'content-disposition':
          "inline; filename*=UTF-8''bukti%20%22asli%22%20%E2%9C%85.pdf",
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, no-store',
      });
    });
  });

  describe('comments', () => {
    const COMMENT = {
      id: 'c1',
      authorName: 'Admin',
      authorRole: 'admin',
      text: 'Halo',
      createdAt: '2026-10-20T03:00:00.000Z',
    };

    it("lists any contract's thread, and adds a trimmed comment as the signed-in admin", async () => {
      comments.list.mockResolvedValue([COMMENT]);
      comments.add.mockResolvedValue(COMMENT);

      const listed = await request(app.getHttpServer()).get(
        `/invoices/${CONTRACT}/comments`,
      );
      const added = await request(app.getHttpServer())
        .post(`/invoices/${CONTRACT}/comments`)
        .send({ text: '  Halo  ' });

      expect([listed.status, added.status]).toEqual([200, 201]);
      expect(listed.body).toEqual([COMMENT]);
      expect(comments.list).toHaveBeenCalledWith(CONTRACT, {});
      expect(comments.add).toHaveBeenCalledWith(
        CONTRACT,
        { text: 'Halo' },
        { role: 'admin', userId: ADMIN },
      );
    });

    it('refuses a blank comment before the service hears of it', async () => {
      const res = await request(app.getHttpServer())
        .post(`/invoices/${CONTRACT}/comments`)
        .send({ text: '   ' });

      expect(res.status).toBe(422);
      expect(comments.add).not.toHaveBeenCalled();
    });
  });

  // OWASP Top 10:2025 A05 (Injection): no id that is not a UUID reaches a query.
  it.each([
    ['get', '/invoices/..%2F..%2Fetc/payment-proof'],
    ['get', '/invoices/abc/comments'],
    ['post', '/invoices/abc/comments'],
    ['post', '/invoices/not-a-uuid/payment-proof'],
  ] as const)('refuses %s %s with 400', async (method, path) => {
    const res = await request(app.getHttpServer())
      [method](path)
      .send({ text: 'x' });

    expect(res.status).toBe(400);
    expect(proofs.upload).not.toHaveBeenCalled();
    expect(proofs.open).not.toHaveBeenCalled();
    expect(comments.list).not.toHaveBeenCalled();
    expect(comments.add).not.toHaveBeenCalled();
  });

  // OWASP Top 10:2025 A01 (Broken Access Control): a change is always recorded as someone; with
  // no admin behind the request (the guard's local stand-in), nothing is written.
  it('refuses an upload or a comment with no admin behind it', async () => {
    principal = null;

    const uploaded = await upload().attach('file', PDF, 'a.pdf');
    const commented = await request(app.getHttpServer())
      .post(`/invoices/${CONTRACT}/comments`)
      .send({ text: 'Halo' });

    expect([uploaded.status, commented.status]).toEqual([401, 401]);
    expect(proofs.upload).not.toHaveBeenCalled();
    expect(comments.add).not.toHaveBeenCalled();
  });
});
