import { BadRequestException } from '@nestjs/common';
import { MAX_SEARCH_LENGTH } from '../creators/filters.js';
import { checkInvoiceFilters } from './invoice-filters.js';

describe('checkInvoiceFilters', () => {
  it('reads no filter from an empty query', () => {
    expect(checkInvoiceFilters(undefined, undefined)).toEqual({});
  });

  it('trims the search word and drops one that is only spaces', () => {
    expect(checkInvoiceFilters('  Rangga  ', undefined)).toEqual({
      q: 'Rangga',
    });
    expect(checkInvoiceFilters('   ', undefined)).toEqual({});
  });

  it('rejects a search word past the length the Creator Database allows', () => {
    expect(() =>
      checkInvoiceFilters('a'.repeat(MAX_SEARCH_LENGTH + 1), undefined),
    ).toThrow(BadRequestException);
    expect(
      checkInvoiceFilters('a'.repeat(MAX_SEARCH_LENGTH), undefined).q,
    ).toHaveLength(MAX_SEARCH_LENGTH);
  });

  it.each(['active', 'upcoming', 'expired'])(
    'reads the contract status %s',
    (contract) => {
      expect(checkInvoiceFilters(undefined, contract)).toEqual({ contract });
    },
  );

  it.each(['none', 'all', 'ACTIVE', ''])(
    'rejects the contract status %j',
    (contract) => {
      expect(() => checkInvoiceFilters(undefined, contract)).toThrow(
        BadRequestException,
      );
    },
  );
});

describe('checkInvoiceFilters, invoice status', () => {
  it.each([
    'accruing',
    'finalized',
    'creator_acked',
    'payment_uploaded',
    'paid',
  ])('reads the invoice status %s', (status) => {
    expect(checkInvoiceFilters(undefined, undefined, status)).toEqual({
      status,
    });
  });

  it.each(['all', 'PAID', '', '<script>', 'running'])(
    'rejects the invoice status %j, naming the ones it takes',
    (status) => {
      expect(() => checkInvoiceFilters(undefined, undefined, status)).toThrow(
        'status must be one of accruing, finalized, creator_acked, payment_uploaded, paid',
      );
    },
  );

  it('rejects a status sent twice rather than picking one', () => {
    expect(() =>
      checkInvoiceFilters(undefined, undefined, ['paid', 'accruing']),
    ).toThrow(BadRequestException);
  });

  it('reads every filter together', () => {
    expect(checkInvoiceFilters(' Salsa ', 'expired', 'paid')).toEqual({
      q: 'Salsa',
      contract: 'expired',
      status: 'paid',
    });
  });
});

describe('checkInvoiceFilters, the contract-end period', () => {
  it('reads the two ends of a range as days', () => {
    expect(
      checkInvoiceFilters(undefined, undefined, undefined, '2026-06-01', '2026-08-31'),
    ).toEqual({
      contractEndFrom: '2026-06-01',
      contractEndTo: '2026-08-31',
    });
  });

  it('reads one open end on its own', () => {
    expect(checkInvoiceFilters(undefined, undefined, undefined, '2026-06-01')).toEqual({
      contractEndFrom: '2026-06-01',
    });
    expect(checkInvoiceFilters(undefined, undefined, undefined, undefined, '2026-08-31')).toEqual({
      contractEndTo: '2026-08-31',
    });
  });

  it.each(['banana', '31-08-2026'])(
    'refuses a start that is not a day written as YYYY-MM-DD (%s)',
    (raw) => {
      expect(() =>
        checkInvoiceFilters(undefined, undefined, undefined, raw),
      ).toThrow('contractEndFrom must be a day written as YYYY-MM-DD');
    },
  );

  it.each(['banana', '31-08-2026'])(
    'refuses an end that is not a day written as YYYY-MM-DD (%s)',
    (raw) => {
      expect(() =>
        checkInvoiceFilters(undefined, undefined, undefined, undefined, raw),
      ).toThrow('contractEndTo must be a day written as YYYY-MM-DD');
    },
  );

  it('refuses a range put in backwards, naming the two days', () => {
    expect(() =>
      checkInvoiceFilters(undefined, undefined, undefined, '2026-08-31', '2026-06-01'),
    ).toThrow('contractEndFrom must not be after contractEndTo');
  });

  it('takes the same day at both ends', () => {
    expect(
      checkInvoiceFilters(undefined, undefined, undefined, '2026-06-01', '2026-06-01'),
    ).toEqual({
      contractEndFrom: '2026-06-01',
      contractEndTo: '2026-06-01',
    });
  });

  it('reads the period beside every other filter', () => {
    expect(checkInvoiceFilters(' Salsa ', 'expired', 'paid', '2026-06-01', '2026-08-31')).toEqual({
      q: 'Salsa',
      contract: 'expired',
      status: 'paid',
      contractEndFrom: '2026-06-01',
      contractEndTo: '2026-08-31',
    });
  });
});

describe('checkInvoiceFilters messages', () => {
  it('says how long a search word may be and which contract statuses exist', () => {
    expect(() =>
      checkInvoiceFilters('a'.repeat(MAX_SEARCH_LENGTH + 1), undefined),
    ).toThrow(`q must be ${MAX_SEARCH_LENGTH} characters or fewer`);
    expect(() => checkInvoiceFilters(undefined, 'none')).toThrow(
      'contract must be one of active, upcoming, expired',
    );
  });
});
