import {
  ConflictException,
  type ExecutionContext,
  type INestApplication,
  NotFoundException,
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
    describe('accepts', () => {
      it('a PDF, handing the service its bytes, type, clean name and the admin', async () => {
        const res = await upload().attach('file', PDF, 'bukti.pdf').expect(201);

        expect(res.body).toEqual({
          fileName: 'bukti.pdf',
          url: `/api/invoices/${CONTRACT}/payment-proof`,
          uploadedAt: '2026-10-20T03:00:00.000Z',
          invoiceStatus: 'payment_uploaded',
        });
        expect(proofs.upload).toHaveBeenCalledExactlyOnceWith(
          CONTRACT,
          { bytes: PDF, contentType: 'application/pdf', fileName: 'bukti.pdf' },
          ADMIN,
        );
      });

      it('a file name in UTF-8, as the browser sends it', async () => {
        await upload().attach('file', PDF, 'Bukti transfer ✅.pdf').expect(201);

        expect(proofs.upload.mock.calls[0][1].fileName).toBe(
          'Bukti transfer ✅.pdf',
        );
      });

      it('a file of exactly 5 MB', async () => {
        await upload()
          .attach('file', sized(PNG_HEAD, PROOF_MAX_BYTES), 'besar.png')
          .expect(201);
      });
    });

    // OWASP Top 10:2025 A06 (Insecure Design): multer stops reading at the first limit, and
    // every way a form can be wrong answers in the admin's words, as 422, never a raw 400/413.
    describe('refuses', () => {
      it('a contract id that is not a UUID, before the service hears of it', async () => {
        await upload('not-a-uuid').attach('file', PDF, 'a.pdf').expect(400);
        expect(proofs.upload).not.toHaveBeenCalled();
      });

      it('a form with no file', async () => {
        const res = await upload().expect(422);

        expect(res.body).toEqual(INVALID);
      });

      it('a program renamed .png', async () => {
        const res = await upload()
          .attach('file', Buffer.from('MZ\x90\x00'), {
            filename: 'bukti.png',
            contentType: 'image/png',
          })
          .expect(422);

        expect(res.body).toEqual(INVALID);
        expect(proofs.upload).not.toHaveBeenCalled();
      });

      it('a file one byte over 5 MB', async () => {
        const res = await upload()
          .attach('file', sized(PDF, PROOF_MAX_BYTES + 1), 'besar.pdf')
          .expect(422);

        expect(res.body).toEqual(TOO_LARGE);
        expect(proofs.upload).not.toHaveBeenCalled();
      });

      it('two files at once', async () => {
        const res = await upload()
          .attach('file', PDF, 'a.pdf')
          .attach('file', PDF, 'b.pdf')
          .expect(422);

        expect(res.body).toEqual(INVALID);
      });

      it('a file under any field name other than file', async () => {
        const res = await upload().attach('proof', PDF, 'a.pdf').expect(422);

        expect(res.body).toEqual(INVALID);
      });

      it('a text field beside the file, such as a forged uploader', async () => {
        const res = await upload()
          .field('uploadedBy', 'someone-else')
          .attach('file', PDF, 'a.pdf')
          .expect(422);

        expect(res.body).toEqual(INVALID);
        expect(proofs.upload).not.toHaveBeenCalled();
      });

      it('a request the guard let through without an admin', async () => {
        principal = null;

        await upload().attach('file', PDF, 'a.pdf').expect(401);
        expect(proofs.upload).not.toHaveBeenCalled();
      });
    });

    describe('edge:', () => {
      it("passes on the service's refusal as it was worded", async () => {
        proofs.upload.mockRejectedValue(
          new ConflictException({
            code: 'INVOICE_NOT_AWAITING_PROOF',
            message: 'x',
          }),
        );

        const res = await upload().attach('file', PDF, 'a.pdf').expect(409);

        expect(res.body).toEqual({
          code: 'INVOICE_NOT_AWAITING_PROOF',
          message: 'x',
        });
      });

      it('a body that is not multipart at all', async () => {
        const res = await upload().send({ file: 'x' }).expect(422);

        expect(res.body).toEqual(INVALID);
      });
    });
  });

  describe('GET /invoices/:contractId/payment-proof', () => {
    it('redirects to the signed link, which nothing may cache or leak in a referrer', async () => {
      proofs.open.mockResolvedValue({
        kind: 'redirect',
        url: 'https://storage.googleapis.com/b/o?X-Goog-Signature=s',
      });

      const res = await request(app.getHttpServer())
        .get(`/invoices/${CONTRACT}/payment-proof`)
        .expect(302);

      expect(res.headers.location).toBe(
        'https://storage.googleapis.com/b/o?X-Goog-Signature=s',
      );
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(proofs.open).toHaveBeenCalledWith(CONTRACT, {});
    });

    it('streams a locally stored file inline, named, typed and never sniffed', async () => {
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
        })
        .expect(200);

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

    it('passes on a proof that is not there', async () => {
      proofs.open.mockRejectedValue(
        new NotFoundException({ code: 'PROOF_NOT_FOUND', message: 'x' }),
      );

      await request(app.getHttpServer())
        .get(`/invoices/${CONTRACT}/payment-proof`)
        .expect(404);
    });

    it('refuses a contract id that is not a UUID', async () => {
      await request(app.getHttpServer())
        .get('/invoices/..%2F..%2Fetc/payment-proof')
        .expect(400);
      expect(proofs.open).not.toHaveBeenCalled();
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

    it("lists any contract's thread for an admin", async () => {
      comments.list.mockResolvedValue([COMMENT]);

      const res = await request(app.getHttpServer())
        .get(`/invoices/${CONTRACT}/comments`)
        .expect(200);

      expect(res.body).toEqual([COMMENT]);
      expect(comments.list).toHaveBeenCalledWith(CONTRACT, {});
    });

    it('adds a comment as the signed-in admin, trimmed', async () => {
      comments.add.mockResolvedValue(COMMENT);

      const res = await request(app.getHttpServer())
        .post(`/invoices/${CONTRACT}/comments`)
        .send({ text: '  Halo  ' })
        .expect(201);

      expect(res.body).toEqual(COMMENT);
      expect(comments.add).toHaveBeenCalledWith(
        CONTRACT,
        { text: 'Halo' },
        { role: 'admin', userId: ADMIN },
      );
    });

    it("refuses an empty comment in the form's words", async () => {
      const res = await request(app.getHttpServer())
        .post(`/invoices/${CONTRACT}/comments`)
        .send({ text: '   ' })
        .expect(422);

      expect(res.body).toEqual({
        code: 'COMMENT_INVALID',
        message: 'Komentar wajib diisi',
      });
      expect(comments.add).not.toHaveBeenCalled();
    });

    it('refuses a comment the guard let through without an admin', async () => {
      principal = null;

      await request(app.getHttpServer())
        .post(`/invoices/${CONTRACT}/comments`)
        .send({ text: 'Halo' })
        .expect(401);
      expect(comments.add).not.toHaveBeenCalled();
    });

    it('refuses a contract id that is not a UUID', async () => {
      await request(app.getHttpServer())
        .get('/invoices/abc/comments')
        .expect(400);
      expect(comments.list).not.toHaveBeenCalled();
    });
  });
});
