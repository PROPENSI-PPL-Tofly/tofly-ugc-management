import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  assertChangeable,
  checkContentEdit,
  editWindow,
  planContentEdit,
  type ChangeFacts,
  type EditableContent,
} from './content-edit.js';

/** The refusal a call throws, as the API would answer it. */
function refusalOf(call: () => unknown): unknown {
  try {
    call();
  } catch (error) {
    if (
      error instanceof ConflictException ||
      error instanceof UnprocessableEntityException
    ) {
      return { status: error.getStatus(), body: error.getResponse() };
    }
    throw error;
  }
  throw new Error('expected a refusal');
}

const RULES = { today: '2026-11-05', bufferDays: 5 };

function content(overrides: Partial<EditableContent> = {}): EditableContent {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'specific',
    name: 'Promo Lebaran',
    brief: 'Tunjukkan fitur kirim kilat.',
    deadline: new Date('2026-11-20T00:00:00Z'),
    status: 'scheduled',
    _count: { submissions: 0 },
    contracts: {
      start_date: new Date('2026-10-01T00:00:00Z'),
      end_date: new Date('2026-12-31T00:00:00Z'),
      invoice: { status: 'running' },
      creators: {
        first_name: 'Rangga',
        middle_name: null,
        last_name: 'Pratama',
      },
    },
    ...overrides,
  };
}

const evergreen = (overrides: Partial<EditableContent> = {}) =>
  content({
    type: 'evergreen',
    name: 'Evg_3_Rangga Pratama_20112026',
    brief: '',
    ...overrides,
  });

describe('checkContentEdit', () => {
  it('reads a deadline, brief and name, trimming the text', () => {
    expect(
      checkContentEdit({
        deadline: '2026-11-25',
        brief: '  Brief baru  ',
        name: ' Nama baru ',
      }),
    ).toEqual({
      deadline: '2026-11-25',
      brief: 'Brief baru',
      name: 'Nama baru',
    });
  });

  it('keeps only the fields that were sent', () => {
    expect(checkContentEdit({ brief: 'Hanya brief' })).toEqual({
      brief: 'Hanya brief',
    });
  });

  it('ignores fields it does not edit, such as the type or status', () => {
    expect(
      checkContentEdit({
        brief: 'x',
        type: 'evergreen',
        status: 'link_submitted',
      }),
    ).toEqual({ brief: 'x' });
  });

  it.each([null, 'deadline', ['2026-11-25'], 42])(
    'refuses a body that is not an object (%j)',
    (body) => {
      expect(refusalOf(() => checkContentEdit(body))).toEqual({
        status: 422,
        body: {
          message: 'Data konten tidak valid',
          errors: {
            content: 'Isi deadline, brief, atau nama konten yang diubah',
          },
        },
      });
    },
  );

  it('refuses a body with nothing to change', () => {
    expect(refusalOf(() => checkContentEdit({}))).toMatchObject({
      status: 422,
      body: {
        errors: {
          content: 'Isi deadline, brief, atau nama konten yang diubah',
        },
      },
    });
  });

  it.each([
    ['not a day', 'besok', 'Format tanggal deadline tidak valid'],
    [
      'a day that does not exist',
      '2026-02-30',
      'Format tanggal deadline tidak valid',
    ],
    ['an empty deadline', '', 'Tanggal deadline wajib diisi'],
    ['a number', 20261125, 'Tanggal deadline wajib diisi'],
  ])('refuses %s as the deadline', (_, deadline, message) => {
    expect(refusalOf(() => checkContentEdit({ deadline }))).toMatchObject({
      body: { errors: { deadline: message } },
    });
  });

  it('refuses a name or brief that is not text, and text past its limit, all at once', () => {
    expect(
      refusalOf(() => checkContentEdit({ name: 7, brief: 'b'.repeat(2001) })),
    ).toMatchObject({
      body: {
        errors: {
          name: 'Nama konten harus berupa teks',
          brief: 'Brief maksimal 2000 karakter',
        },
      },
    });
    expect(
      refusalOf(() => checkContentEdit({ name: 'n'.repeat(101), brief: 3 })),
    ).toMatchObject({
      body: {
        errors: {
          name: 'Nama konten maksimal 100 karakter',
          brief: 'Brief harus berupa teks',
        },
      },
    });
  });

  it('takes a name of exactly 100 and a brief of exactly 2000 characters', () => {
    const name = 'n'.repeat(100);
    const brief = 'b'.repeat(2000);

    expect(checkContentEdit({ name, brief })).toEqual({ name, brief });
  });
});

describe('assertChangeable', () => {
  it('lets a scheduled content with no draft and a running invoice change', () => {
    expect(() => assertChangeable(content())).not.toThrow();
  });

  it('lets a content change before its contract has an invoice at all', () => {
    expect(() =>
      assertChangeable(
        content({ contracts: { ...content().contracts, invoice: null } }),
      ),
    ).not.toThrow();
  });

  const NOT_EDITABLE = {
    status: 409,
    body: {
      code: 'CONTENT_NOT_EDITABLE',
      message:
        'Konten hanya bisa diubah atau dihapus selama berstatus Scheduled dan belum ada draft',
    },
  };

  it.each([
    'pending',
    'draft_review',
    'draft_revision',
    'draft_approved',
    'link_submitted',
  ] as const)('refuses a content that is %s (AC 1, 9)', (status) => {
    expect(refusalOf(() => assertChangeable(content({ status })))).toEqual(
      NOT_EDITABLE,
    );
  });

  it('refuses a scheduled content that already has a draft (AC 9)', () => {
    expect(
      refusalOf(() =>
        assertChangeable(content({ _count: { submissions: 1 } })),
      ),
    ).toEqual(NOT_EDITABLE);
  });

  it.each(['finalized', 'creator_acked', 'payment_uploaded', 'paid'] as const)(
    'refuses a content whose invoice is %s (AC 9)',
    (status) => {
      expect(
        refusalOf(() =>
          assertChangeable(
            content({
              contracts: { ...content().contracts, invoice: { status } },
            }),
          ),
        ),
      ).toEqual({
        status: 409,
        body: {
          code: 'INVOICE_FINALIZED',
          message:
            'Invoice sudah difinalisasi. Konten tidak bisa diubah atau dihapus lagi',
        },
      });
    },
  );

  it('names the draft before the invoice when both stop a change', () => {
    expect(
      refusalOf(() =>
        assertChangeable(
          content({
            status: 'draft_review',
            contracts: {
              ...content().contracts,
              invoice: { status: 'finalized' },
            },
          }),
        ),
      ),
    ).toEqual(NOT_EDITABLE);
  });
});

describe('editWindow', () => {
  function facts(overrides: Partial<ChangeFacts> = {}): ChangeFacts {
    return {
      status: 'scheduled',
      drafts: 0,
      contractStart: '2026-10-01',
      contractEnd: '2026-12-31',
      invoiceStatus: 'running',
      ...overrides,
    };
  }

  it('opens the days an edited deadline may take: today plus the buffer up to H-5 (AC 3)', () => {
    expect(editWindow(facts(), RULES)).toEqual({
      earliestDeadline: '2026-11-10',
      latestDeadline: '2026-12-26',
    });
  });

  it('counts the buffer from the contract start when the contract has not started yet', () => {
    expect(
      editWindow(facts({ contractStart: '2026-11-20' }), RULES),
    ).toEqual({ earliestDeadline: '2026-11-25', latestDeadline: '2026-12-26' });
  });

  it('opens before the contract has an invoice at all', () => {
    expect(editWindow(facts({ invoiceStatus: null }), RULES)).not.toBeNull();
  });

  it.each([
    'pending',
    'draft_review',
    'draft_revision',
    'draft_approved',
    'link_submitted',
  ] as const)('is closed for a content that is %s (AC 1)', (status) => {
    expect(editWindow(facts({ status }), RULES)).toBeNull();
  });

  it('is closed once a draft exists (AC 1, 9)', () => {
    expect(editWindow(facts({ drafts: 1 }), RULES)).toBeNull();
  });

  it.each(['finalized', 'creator_acked', 'payment_uploaded', 'paid'] as const)(
    'is closed once the invoice is %s, as the API refuses then (AC 9)',
    (invoiceStatus) => {
      expect(editWindow(facts({ invoiceStatus }), RULES)).toBeNull();
    },
  );
});

describe('planContentEdit', () => {
  it("changes a Specific item's deadline, brief and name, recording old and new (AC 2, 4)", () => {
    expect(
      planContentEdit(
        content(),
        { deadline: '2026-11-25', brief: 'Brief baru', name: 'Nama baru' },
        RULES,
      ),
    ).toEqual({
      data: {
        deadline: new Date('2026-11-25T00:00:00Z'),
        brief: 'Brief baru',
        name: 'Nama baru',
      },
      changes: {
        deadline: { from: '2026-11-20', to: '2026-11-25' },
        brief: { from: 'Tunjukkan fitur kirim kilat.', to: 'Brief baru' },
        name: { from: 'Promo Lebaran', to: 'Nama baru' },
      },
    });
  });

  it('leaves out what is sent unchanged, so only real changes are recorded', () => {
    expect(
      planContentEdit(
        content(),
        { deadline: '2026-11-20', brief: 'Brief baru', name: 'Promo Lebaran' },
        RULES,
      ),
    ).toEqual({
      data: { brief: 'Brief baru' },
      changes: {
        brief: { from: 'Tunjukkan fitur kirim kilat.', to: 'Brief baru' },
      },
    });
  });

  it('plans nothing when nothing differs', () => {
    expect(
      planContentEdit(
        content(),
        { brief: 'Tunjukkan fitur kirim kilat.' },
        RULES,
      ),
    ).toEqual({
      data: {},
      changes: {},
    });
  });

  it('does not judge a deadline that is not being changed, even one now inside the buffer', () => {
    const soon = content({ deadline: new Date('2026-11-06T00:00:00Z') });

    expect(
      planContentEdit(soon, { deadline: '2026-11-06', brief: 'x' }, RULES)
        .changes,
    ).toEqual({
      brief: { from: 'Tunjukkan fitur kirim kilat.', to: 'x' },
    });
  });

  it('accepts the earliest deadline the buffer allows, and refuses the day before (AC 3)', () => {
    expect(
      planContentEdit(content(), { deadline: '2026-11-10' }, RULES).data,
    ).toEqual({
      deadline: new Date('2026-11-10T00:00:00Z'),
    });
    expect(
      refusalOf(() =>
        planContentEdit(content(), { deadline: '2026-11-09' }, RULES),
      ),
    ).toEqual({
      status: 422,
      body: {
        message: 'Data konten tidak valid',
        errors: { deadline: 'Deadline paling cepat 10 Nov 2026' },
      },
    });
  });

  it('counts the buffer from the contract start when the contract has not started yet', () => {
    const later = content({
      contracts: {
        ...content().contracts,
        start_date: new Date('2026-11-20T00:00:00Z'),
      },
      deadline: new Date('2026-12-01T00:00:00Z'),
    });

    expect(
      refusalOf(() =>
        planContentEdit(later, { deadline: '2026-11-24' }, RULES),
      ),
    ).toMatchObject({
      body: { errors: { deadline: 'Deadline paling cepat 25 Nov 2026' } },
    });
  });

  it('accepts the H-5 day before the contract end, and refuses the day after it (AC 3)', () => {
    expect(
      planContentEdit(content(), { deadline: '2026-12-26' }, RULES).data,
    ).toEqual({
      deadline: new Date('2026-12-26T00:00:00Z'),
    });
    expect(
      refusalOf(() =>
        planContentEdit(content(), { deadline: '2026-12-27' }, RULES),
      ),
    ).toMatchObject({
      body: {
        errors: {
          deadline: 'Deadline paling lambat 26 Des 2026 (H-5 akhir kontrak)',
        },
      },
    });
  });

  it('refuses an empty brief for a Specific item, which needs one', () => {
    expect(
      refusalOf(() => planContentEdit(content(), { brief: '' }, RULES)),
    ).toMatchObject({
      body: { errors: { brief: 'Brief wajib diisi' } },
    });
  });

  it('refuses an empty name for a Specific item', () => {
    expect(
      refusalOf(() => planContentEdit(content(), { name: '' }, RULES)),
    ).toMatchObject({
      body: { errors: { name: 'Nama konten wajib diisi' } },
    });
  });

  it('reports a bad name, brief and deadline in one answer', () => {
    expect(
      refusalOf(() =>
        planContentEdit(
          content(),
          { name: '', brief: '', deadline: '2027-01-01' },
          RULES,
        ),
      ),
    ).toMatchObject({
      body: {
        errors: {
          name: 'Nama konten wajib diisi',
          brief: 'Brief wajib diisi',
          deadline: 'Deadline paling lambat 26 Des 2026 (H-5 akhir kontrak)',
        },
      },
    });
  });

  it("lets an Evergreen item's brief be set, or left empty (AC 2)", () => {
    expect(
      planContentEdit(evergreen(), { brief: 'Arahan baru' }, RULES).changes,
    ).toEqual({
      brief: { from: '', to: 'Arahan baru' },
    });
    expect(
      planContentEdit(evergreen({ brief: 'Lama' }), { brief: '' }, RULES)
        .changes,
    ).toEqual({ brief: { from: 'Lama', to: '' } });
  });

  it('refuses renaming an Evergreen item, whose name the app writes (AC 2)', () => {
    expect(
      refusalOf(() =>
        planContentEdit(evergreen(), { name: 'Nama sendiri' }, RULES),
      ),
    ).toMatchObject({
      body: {
        errors: {
          name: 'Nama konten Evergreen dibuat otomatis dan tidak bisa diubah',
        },
      },
    });
  });

  it('accepts an Evergreen name sent back unchanged, as a form sends every field', () => {
    expect(
      planContentEdit(
        evergreen(),
        { name: 'Evg_3_Rangga Pratama_20112026' },
        RULES,
      ),
    ).toEqual({ data: {}, changes: {} });
  });

  it('renames an Evergreen item after its new deadline, keeping its sequence', () => {
    expect(
      planContentEdit(evergreen(), { deadline: '2026-11-25' }, RULES),
    ).toEqual({
      data: {
        deadline: new Date('2026-11-25T00:00:00Z'),
        name: 'Evg_3_Rangga Pratama_25112026',
      },
      changes: {
        deadline: { from: '2026-11-20', to: '2026-11-25' },
        name: {
          from: 'Evg_3_Rangga Pratama_20112026',
          to: 'Evg_3_Rangga Pratama_25112026',
        },
      },
    });
  });

  it('keeps an Evergreen name that does not follow the naming rule as it is', () => {
    expect(
      planContentEdit(
        evergreen({ name: 'Konten lama' }),
        { deadline: '2026-11-25' },
        RULES,
      ).data,
    ).toEqual({ deadline: new Date('2026-11-25T00:00:00Z') });
  });

  it("writes a middle name into a renamed Evergreen item's name", () => {
    const named = evergreen({
      name: 'Evg_1_Rangga Adi Pratama_20112026',
      contracts: {
        ...content().contracts,
        creators: {
          first_name: 'Rangga',
          middle_name: 'Adi',
          last_name: 'Pratama',
        },
      },
    });

    expect(
      planContentEdit(named, { deadline: '2026-11-25' }, RULES).data.name,
    ).toBe('Evg_1_Rangga Adi Pratama_25112026');
  });
});
