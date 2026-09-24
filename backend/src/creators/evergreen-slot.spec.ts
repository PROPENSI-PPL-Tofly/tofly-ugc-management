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

  // PRD 3.4/3.6: deadline must be on/after max(contract start, today) + buffer, and
  // on/before the contract end date — same rule the frontend's content-schedule.ts applies,
  // re-run here since a request can skip the client entirely.
  describe('deadline', () => {
    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['not a string', 42],
    ])('is required (%s)', (_case, deadline) => {
      const errors = checkEvergreenSlot('evergreen', deadline, CONTEXT, TODAY);

      expect(errors.deadline).toBe('Tanggal deadline wajib diisi');
    });

    it('rejects a deadline that is not a real calendar day', () => {
      const errors = checkEvergreenSlot('evergreen', '2026-13-01', CONTEXT, TODAY);

      expect(errors.deadline).toBe('Format tanggal deadline tidak valid');
    });

    // Distinct from the case above: this string is not even shaped like YYYY-MM-DD, so it
    // never reaches the round-trip check at all.
    it('rejects a deadline that is not shaped like a date at all', () => {
      const errors = checkEvergreenSlot('evergreen', 'not-a-date', CONTEXT, TODAY);

      expect(errors.deadline).toBe('Format tanggal deadline tidak valid');
    });

    it('rejects a deadline before the buffer window', () => {
      // First allowed day is 2026-10-06 (contract starts 1 Okt, 5-day buffer).
      const errors = checkEvergreenSlot('evergreen', '2026-10-05', CONTEXT, TODAY);

      expect(errors.deadline).toBe('Deadline paling cepat 2026-10-06');
    });

    it('accepts the first day the buffer allows', () => {
      const errors = checkEvergreenSlot('evergreen', '2026-10-06', CONTEXT, TODAY);

      expect(errors.deadline).toBeUndefined();
    });

    it('measures the buffer from today when the contract already started', () => {
      // Contract started in the past (1 Agu); the buffer must count from today (24 Sep).
      const context = { ...CONTEXT, contractStart: '2026-08-01' };

      const errors = checkEvergreenSlot('evergreen', '2026-09-28', context, TODAY);

      expect(errors.deadline).toBe('Deadline paling cepat 2026-09-29');
    });

    it('rejects a deadline after the contract ends', () => {
      const errors = checkEvergreenSlot('evergreen', '2027-01-01', CONTEXT, TODAY);

      expect(errors.deadline).toBe('Deadline tidak boleh setelah akhir kontrak');
    });

    it('accepts the contract end date itself', () => {
      const errors = checkEvergreenSlot('evergreen', '2026-12-31', CONTEXT, TODAY);

      expect(errors.deadline).toBeUndefined();
    });
  });

  it('reports the quota and deadline errors independently, not just the first one found', () => {
    const errors = checkEvergreenSlot(
      'evergreen',
      '2027-01-01',
      { ...CONTEXT, evergreenScheduledCount: 6 },
      TODAY,
    );

    expect(errors).toEqual({
      contentType: 'Slot Evergreen sudah penuh',
      deadline: 'Deadline tidak boleh setelah akhir kontrak',
    });
  });
});
