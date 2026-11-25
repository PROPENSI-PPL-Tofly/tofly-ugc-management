import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminGuard } from '../auth/admin.guard.js';
import { InvoicePdfController } from './invoice-pdf.controller.js';
import { InvoicePdfService } from './invoice-pdf.service.js';

const CONTRACT = '22222222-2222-4222-8222-222222222222';
const PDF = Buffer.from('%PDF-1.3 test');

function binary(res: request.Test) {
  return res.buffer(true).parse((response, done) => {
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => chunks.push(chunk));
    response.on('end', () => done(null, Buffer.concat(chunks)));
  });
}

describe('InvoicePdfController', () => {
  it('is for admins only', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, InvoicePdfController)).toEqual([AdminGuard]);
  });

  const pdfs = { forContract: vi.fn() };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [InvoicePdfController],
      providers: [{ provide: InvoicePdfService, useValue: pdfs }],
    })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    pdfs.forContract.mockReset();
  });

  // OWASP Top 10:2025 A05: the name is percent-encoded into the header, and the bytes are never
  // sniffed into something that runs or cached where another user could read them.
  it.each([
    ['invoice', 'invoice-pdf', 'Invoice_RanggaPratama_Periode2.pdf'],
    ['receipt', 'receipt-pdf', 'Receipt_RanggaPratama_Periode2.pdf'],
  ] as const)('sends any %s as a PDF to save, safely named, never cached or sniffed', async (document, route, fileName) => {
    pdfs.forContract.mockResolvedValue({ fileName, bytes: PDF });

    const res = await binary(request(app.getHttpServer()).get(`/invoices/${CONTRACT}/${route}`));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(PDF);
    expect(res.headers).toMatchObject({
      'content-type': 'application/pdf',
      'content-length': String(PDF.length),
      'content-disposition': `attachment; filename*=UTF-8''${fileName}`,
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
    });
    expect(pdfs.forContract).toHaveBeenCalledWith(CONTRACT, {}, document);
  });

  it('answers what the service refuses with', async () => {
    pdfs.forContract.mockRejectedValue(new ForbiddenException());

    await request(app.getHttpServer()).get(`/invoices/${CONTRACT}/invoice-pdf`).expect(403);
  });

  // OWASP Top 10:2025 A05 (Injection): only a UUID reaches the query.
  it('refuses a contract id that is not a UUID, before any query', async () => {
    await request(app.getHttpServer()).get('/invoices/not-a-uuid/invoice-pdf').expect(400);
    await request(app.getHttpServer()).get('/invoices/not-a-uuid/receipt-pdf').expect(400);

    expect(pdfs.forContract).not.toHaveBeenCalled();
  });
});
