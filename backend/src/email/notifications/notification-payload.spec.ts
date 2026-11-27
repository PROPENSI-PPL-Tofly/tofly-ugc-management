import {
  InvalidNotificationPayload,
  readPayload,
} from './notification-payload.js';

const CONTENT = { contentId: 'content-1', contentName: 'Promo Lebaran' };

describe('readPayload (11.4)', () => {
  it('keeps the fields a template is given, the greeting name included', () => {
    expect(
      readPayload('content_scheduled', {
        ...CONTENT,
        deadline: '2026-11-30',
        recipientName: 'Rangga Pratama',
      }),
    ).toEqual({
      ...CONTENT,
      deadline: '2026-11-30',
      recipientName: 'Rangga Pratama',
    });
  });

  it('greets without a name when the helper handed none', () => {
    expect(readPayload('account_ready', {})).toEqual({ recipientName: null });
  });

  // AC 10: whatever a trigger puts in by mistake, only the template's own fields reach the copy.
  it('drops every field the template does not take, such as a reason or a token', () => {
    const data = readPayload('contract_ended_early', {
      lastDay: '2026-12-15',
      invoice: 'cancelled',
      reasonType: 'violation',
      note: 'Catatan internal Admin',
      token: 'abc',
      recipientName: 'Rangga',
    });

    expect(data).toEqual({
      lastDay: '2026-12-15',
      invoice: 'cancelled',
      recipientName: 'Rangga',
    });
  });

  it('takes a missing or empty rejection reason as none', () => {
    expect(
      readPayload('proposal_rejected', { contentName: 'Promo', reason: null }),
    ).toMatchObject({
      reason: null,
    });
    expect(
      readPayload('proposal_rejected', { contentName: 'Promo' }),
    ).toMatchObject({ reason: null });
    expect(
      readPayload('proposal_rejected', { contentName: 'Promo', reason: '  ' }),
    ).toMatchObject({
      reason: null,
    });
  });

  it('takes a contract that has not ended as no day access closes', () => {
    expect(
      readPayload('invoice_paid', { contractId: 'c-1', accessClosesOn: null }),
    ).toEqual({
      contractId: 'c-1',
      accessClosesOn: null,
      recipientName: null,
    });
  });

  // A creator gone from the contract still gets the Admins their email (11.2), named "Creator".
  it('names a creator with no name "Creator"', () => {
    expect(
      readPayload('draft_submitted', { ...CONTENT, creatorName: '  ' }),
    ).toMatchObject({
      creatorName: 'Creator',
    });
    expect(
      readPayload('draft_submitted', { ...CONTENT, creatorName: ' Rangga ' }),
    ).toMatchObject({
      creatorName: 'Rangga',
    });
  });

  it.each([
    ['a missing field', 'content_scheduled', { ...CONTENT }, 'deadline'],
    [
      'a blank text',
      'revision_requested',
      { contentId: ' ', contentName: 'Promo' },
      'contentId',
    ],
    [
      'a day that is no day',
      'content_deleted',
      { contentName: 'Promo', deadline: '2026-02-30' },
      'deadline',
    ],
    [
      'a day as a timestamp',
      'deadline_reminder',
      { ...CONTENT, deadline: '2026-11-30T00:00:00Z' },
      'deadline',
    ],
    [
      'an invoice outcome it does not know',
      'contract_ended_early',
      { lastDay: '2026-12-15', invoice: 'void' },
      'invoice',
    ],
    [
      'a number in place of a text',
      'invoice_finalized',
      { contractId: 7 },
      'contractId',
    ],
    [
      'a creator name that is not text',
      'invoice_acknowledged',
      { contractId: 'c-1', creatorName: null },
      'creatorName',
    ],
    [
      'a greeting name that is not text',
      'account_ready',
      { recipientName: 42 },
      'recipientName',
    ],
  ] as const)(
    'refuses %s, naming the field and never its value',
    (_, template, payload, field) => {
      let thrown: unknown;
      try {
        readPayload(template, payload);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(InvalidNotificationPayload);
      expect((thrown as Error).message).toBe(
        `Email ${template} has no valid ${field}`,
      );
    },
  );
});
