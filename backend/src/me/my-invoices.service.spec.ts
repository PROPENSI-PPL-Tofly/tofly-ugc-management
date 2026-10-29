import type {
  InvoiceAdjustmentDto,
  InvoiceSnapshotDto,
  InvoiceView,
} from '../invoices/dto/invoice-list.dto.js';
import type { InvoiceCommentDto } from '../invoices/dto/invoice-payment.dto.js';
import type { InvoiceCommentReader } from '../invoices/invoice-comments.service.js';
import type { PaymentProofReader } from '../invoices/payment-proof.service.js';
import { MyInvoicesService } from './my-invoices.service.js';

const CREATOR = '5b0c8a4e-2f1d-4c3b-9a8e-7d6f5e4c3b2a';
const ADMIN = '99999999-9999-4999-8999-999999999999';
const TODAY = new Date('2026-10-20T03:00:00.000Z');

const ADJUSTMENT: InvoiceAdjustmentDto = {
  id: 'adj-1',
  amount: 50_000,
  reason: 'Ongkos kirim produk',
  actorId: ADMIN,
  createdAt: '2026-10-01T02:00:00.000Z',
};
/** What the creator reads of an adjustment: what and why, not which admin recorded it. */
const ADJUSTMENT_FOR_CREATOR = {
  id: 'adj-1',
  amount: 50_000,
  reason: 'Ongkos kirim produk',
  createdAt: '2026-10-01T02:00:00.000Z',
};

const component = (amount: number) => ({
  amount,
  status: 'calculated' as const,
  lines: [],
});

function snapshot(): InvoiceSnapshotDto {
  return {
    fixedRate: component(1_000_000),
    additionalContent: component(0),
    performanceBonus: component(0),
    penalty: component(0),
    adjustments: [ADJUSTMENT],
    rawTotal: 1_050_000,
    total: 1_050_000,
    floored: false,
    finalizedAt: '2026-10-05T03:00:00.000Z',
  };
}

function view(contractId: string, overrides: Partial<InvoiceView> = {}) {
  return {
    creatorId: CREATOR,
    creatorName: 'Rangga Pratama',
    contract: {
      id: contractId,
      status: 'expired',
      startDate: '2026-07-01',
      endDate: '2026-09-30',
      lastDay: '2026-09-30',
      period: 1,
    },
    components: {
      fixedRate: component(1_000_000),
      additionalContent: component(0),
      performanceBonus: component(0),
      penalty: component(0),
    },
    rawTotal: 1_000_000,
    total: 1_000_000,
    floored: false,
    invoiceStatus: 'accruing',
    adjustments: [],
    snapshot: null,
    periodNumber: 1,
    formula: null,
    acknowledgedAt: null,
    paidAt: null,
    ...overrides,
  } as InvoiceView;
}

const COMMENT: InvoiceCommentDto = {
  id: 'comment-1',
  authorName: 'Admin',
  authorRole: 'admin',
  text: 'Sudah ditransfer ya.',
  createdAt: '2026-10-06T03:00:00.000Z',
};

function stubs(views: InvoiceView[]) {
  const invoices = { forCreator: vi.fn().mockResolvedValue(views) };
  const proofs = {
    forContracts: vi
      .fn<PaymentProofReader['forContracts']>()
      .mockResolvedValue(new Map()),
  };
  const comments = {
    forContracts: vi
      .fn<InvoiceCommentReader['forContracts']>()
      .mockResolvedValue(new Map()),
  };
  const service = new MyInvoicesService(invoices, proofs, comments);
  return { invoices, proofs, comments, service };
}

describe('MyInvoicesService', () => {
  it("answers the creator's invoices with the creator's proof link and each thread, in the order given", async () => {
    const { invoices, proofs, comments, service } = stubs([
      view('current'),
      view('earlier', {
        invoiceStatus: 'paid',
        acknowledgedAt: '2026-10-06T03:00:00.000Z',
        paidAt: '2026-10-08T03:00:00.000Z',
      }),
    ]);
    const proof = {
      fileName: 'transfer.pdf',
      url: '/api/me/invoices/earlier/payment-proof',
      uploadedAt: '2026-10-07T03:00:00.000Z',
    };
    proofs.forContracts.mockResolvedValue(new Map([['earlier', proof]]));
    comments.forContracts.mockResolvedValue(new Map([['earlier', [COMMENT]]]));

    const { items } = await service.list(CREATOR, TODAY);

    expect(invoices.forCreator).toHaveBeenCalledExactlyOnceWith(CREATOR, TODAY);
    // One read each for every invoice, and the creator's own route to the file.
    expect(proofs.forContracts).toHaveBeenCalledExactlyOnceWith(
      ['current', 'earlier'],
      'creator',
    );
    expect(comments.forContracts).toHaveBeenCalledExactlyOnceWith([
      'current',
      'earlier',
    ]);
    expect(items).toEqual([
      { ...view('current'), paymentProof: null, comments: [] },
      {
        ...view('earlier', {
          invoiceStatus: 'paid',
          acknowledgedAt: '2026-10-06T03:00:00.000Z',
          paidAt: '2026-10-08T03:00:00.000Z',
        }),
        paymentProof: proof,
        comments: [COMMENT],
      },
    ]);
  });

  // OWASP Top 10:2025 A01 (Broken Access Control): which admin recorded an adjustment is the
  // admin side's record; the creator reads what and why, at the top level and in the snapshot.
  it('leaves out which admin recorded each adjustment, in the live list and in the snapshot', async () => {
    const { service } = stubs([
      view('earlier', {
        invoiceStatus: 'finalized',
        adjustments: [ADJUSTMENT],
        snapshot: snapshot(),
      }),
    ]);

    const [item] = (await service.list(CREATOR, TODAY)).items;

    expect(item.adjustments).toEqual([ADJUSTMENT_FOR_CREATOR]);
    expect(item.snapshot).toEqual({
      ...snapshot(),
      adjustments: [ADJUSTMENT_FOR_CREATOR],
    });
    expect(JSON.stringify(item)).not.toContain(ADMIN);
  });

  it('answers no invoices for a creator with none', async () => {
    const { service } = stubs([]);

    await expect(service.list(CREATOR, TODAY)).resolves.toEqual({ items: [] });
  });

  it('works the invoices out as of now when no moment is given', async () => {
    const { invoices, service } = stubs([]);
    const before = Date.now();

    await service.list(CREATOR);

    const asOf = invoices.forCreator.mock.calls[0][1] as Date;
    expect(asOf.getTime()).toBeGreaterThanOrEqual(before);
    expect(asOf.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
