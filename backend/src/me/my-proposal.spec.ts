import { UnprocessableEntityException } from '@nestjs/common';
import {
  MAX_PROPOSAL_BRIEF_LENGTH,
  MAX_PROPOSAL_NAME_LENGTH,
  MAX_PROPOSAL_NOTES_LENGTH,
  checkNewProposal,
  proposalDeadlineError,
} from './my-proposal.js';

function errorsOf(run: () => unknown): Record<string, string> {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    const body = (error as UnprocessableEntityException).getResponse() as {
      message: string;
      errors: Record<string, string>;
    };
    expect(body.message).toBe('Data pengajuan tidak valid');
    return body.errors;
  }
  return expect.unreachable('the proposal must be refused');
}

const VALID = {
  name: 'Unboxing Paket Besar',
  brief: 'Tunjukkan proses kirim paket besar dari awal sampai tiba.',
  deadline: '2026-12-20',
  notes: 'Pakai produk yang ada di rumah.',
};

describe('checkNewProposal (PBI-14 AC 1)', () => {
  it('takes a complete proposal, trimmed', () => {
    expect(
      checkNewProposal({
        name: '  Unboxing Paket Besar ',
        brief: ' Tunjukkan prosesnya. ',
        deadline: '2026-12-20',
        notes: ' Catatan ',
      }),
    ).toEqual({
      name: 'Unboxing Paket Besar',
      brief: 'Tunjukkan prosesnya.',
      deadline: '2026-12-20',
      notes: 'Catatan',
    });
  });

  it.each([
    ['absent', undefined],
    ['null', null],
    ['blank', '   '],
  ])('reads notes that are %s as none, since they are optional', (_label, notes) => {
    expect(checkNewProposal({ ...VALID, notes }).notes).toBeNull();
  });

  it('refuses a body that is not an object, naming every required field', () => {
    for (const body of [undefined, null, 'x', 5, []]) {
      expect(errorsOf(() => checkNewProposal(body))).toEqual({
        name: 'Nama konten wajib diisi',
        brief: 'Brief wajib diisi',
        deadline: 'Deadline wajib diisi',
      });
    }
  });

  it.each([
    ['name', { name: '   ' }, 'Nama konten wajib diisi'],
    ['name', { name: 5 }, 'Nama konten wajib diisi'],
    ['name', { name: 'a'.repeat(MAX_PROPOSAL_NAME_LENGTH + 1) }, `Nama konten maksimal ${MAX_PROPOSAL_NAME_LENGTH} karakter`],
    ['brief', { brief: '' }, 'Brief wajib diisi'],
    ['brief', { brief: 'a'.repeat(MAX_PROPOSAL_BRIEF_LENGTH + 1) }, `Brief maksimal ${MAX_PROPOSAL_BRIEF_LENGTH} karakter`],
    ['deadline', { deadline: '' }, 'Deadline wajib diisi'],
    ['deadline', { deadline: 20261220 }, 'Deadline wajib diisi'],
    ['deadline', { deadline: '20-12-2026' }, 'Format deadline tidak valid'],
    ['deadline', { deadline: '2026-02-30' }, 'Format deadline tidak valid'],
    ['notes', { notes: 5 }, 'Catatan harus berupa teks'],
    ['notes', { notes: 'a'.repeat(MAX_PROPOSAL_NOTES_LENGTH + 1) }, `Catatan maksimal ${MAX_PROPOSAL_NOTES_LENGTH} karakter`],
  ])('refuses the %s when it is wrong, under that field only', (field, change, message) => {
    expect(errorsOf(() => checkNewProposal({ ...VALID, ...change }))).toEqual({ [field]: message });
  });

  it('takes the limits themselves: 100, 1000 and 500 characters', () => {
    expect(() =>
      checkNewProposal({
        name: 'a'.repeat(MAX_PROPOSAL_NAME_LENGTH),
        brief: 'b'.repeat(MAX_PROPOSAL_BRIEF_LENGTH),
        deadline: '2026-12-20',
        notes: 'c'.repeat(MAX_PROPOSAL_NOTES_LENGTH),
      }),
    ).not.toThrow();
    expect([MAX_PROPOSAL_NAME_LENGTH, MAX_PROPOSAL_BRIEF_LENGTH, MAX_PROPOSAL_NOTES_LENGTH]).toEqual([100, 1000, 500]);
  });

  // A character beyond the basic plane counts as one, as the form's counter counts it.
  it('counts a character outside the basic plane once', () => {
    expect(() => checkNewProposal({ ...VALID, name: '🎬'.repeat(MAX_PROPOSAL_NAME_LENGTH) })).not.toThrow();
  });

  it('reports every wrong field at once', () => {
    expect(errorsOf(() => checkNewProposal({ name: '', brief: '', deadline: 'x' }))).toEqual({
      name: 'Nama konten wajib diisi',
      brief: 'Brief wajib diisi',
      deadline: 'Format deadline tidak valid',
    });
  });
});

// AC 2: from the later of the contract start and today plus the stored buffer, up to the contract
// end less the same buffer: the line Tambah Konten and an edit hold, drawn by one DeadlineWindow.
describe('proposalDeadlineError', () => {
  const CONTRACT = { startDate: '2026-06-01', endDate: '2027-01-31' };
  const TODAY = '2026-11-21';
  const error = (deadline: string, contract = CONTRACT) => proposalDeadlineError(contract, deadline, TODAY, 5);

  it('accepts the first and the last day of the window', () => {
    expect(error('2026-11-26')).toBeNull();
    expect(error('2027-01-26')).toBeNull();
  });

  it('counts from the contract start when it is later than today', () => {
    const later = { startDate: '2026-12-01', endDate: '2027-01-31' };

    expect(error('2026-12-05', later)).toBe('Deadline paling cepat 6 Des 2026');
    expect(error('2026-12-06', later)).toBeNull();
  });

  it('holds the day when the earliest and the latest are the same', () => {
    const narrow = { startDate: '2026-06-01', endDate: '2026-12-05' };

    expect(proposalDeadlineError(narrow, '2026-11-30', '2026-11-25', 5)).toBeNull();
    expect(proposalDeadlineError(narrow, '2026-12-01', '2026-11-25', 5)).toBe(
      'Deadline paling lambat 30 Nov 2026 (H-5 akhir kontrak)',
    );
  });

  it('draws both lines with the stored buffer, not a fixed five days', () => {
    expect(proposalDeadlineError(CONTRACT, '2026-11-23', TODAY, 2)).toBeNull();
    expect(proposalDeadlineError(CONTRACT, '2027-01-29', TODAY, 2)).toBeNull();
    expect(proposalDeadlineError(CONTRACT, '2027-01-30', TODAY, 2)).toBe(
      'Deadline paling lambat 29 Jan 2027 (H-2 akhir kontrak)',
    );
  });

  it('refuses a day before the window, naming the earliest', () => {
    expect(error('2026-11-25')).toBe('Deadline paling cepat 26 Nov 2026');
  });

  it('refuses a day after the H-5 line, naming the latest', () => {
    expect(error('2027-01-27')).toBe('Deadline paling lambat 26 Jan 2027 (H-5 akhir kontrak)');
  });

  it('says so when the contract has no room left, rather than naming a day nobody may choose', () => {
    expect(error('2026-11-30', { startDate: '2026-06-01', endDate: '2026-11-30' })).toBe(
      'Tidak ada tanggal deadline yang tersedia di kontrak ini',
    );
  });
});
