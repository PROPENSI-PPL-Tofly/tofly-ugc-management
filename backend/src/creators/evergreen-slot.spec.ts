import { checkEvergreenSlot, type EvergreenSlotContext } from './evergreen-slot.js';

// Contract 1 Okt – 31 Des, today 24 Sep — same shape as the frontend's content-schedule.test.ts,
// so this rule reads the same on both sides of the stack.
const TODAY = '2026-09-24';
const CONTEXT: EvergreenSlotContext = {
  contractStart: '2026-10-01',
  contractEnd: '2026-12-31',
  contentQuota: 6,
  evergreenScheduledCount: 3,
};

describe('checkEvergreenSlot', () => {
  it('accepts Evergreen when the quota still has room', () => {
    const errors = checkEvergreenSlot('evergreen', '2026-10-10', CONTEXT, TODAY);

    expect(errors.contentType).toBeUndefined();
  });

  it('rejects Evergreen once the quota is already full', () => {
    const errors = checkEvergreenSlot(
      'evergreen',
      '2026-10-10',
      { ...CONTEXT, evergreenScheduledCount: 6 },
      TODAY,
    );

    expect(errors.contentType).toBe('Slot Evergreen sudah penuh');
  });

  // Specific content never counts against the Evergreen quota (PRD 3.4/3.7) — a full quota
  // must not block it.
  it('does not block Specific content when the Evergreen quota is full', () => {
    const errors = checkEvergreenSlot(
      'specific',
      '2026-10-10',
      { ...CONTEXT, evergreenScheduledCount: 6 },
      TODAY,
    );

    expect(errors.contentType).toBeUndefined();
  });

  // The client sends contentType as plain text; a request can skip the form entirely, so this
  // cannot trust it is one of the two values the database's content_type enum accepts.
  it('rejects a content type outside evergreen/specific', () => {
    const errors = checkEvergreenSlot('banana', '2026-10-10', CONTEXT, TODAY);

    expect(errors.contentType).toBe('Tipe konten harus evergreen atau specific');
  });
});
