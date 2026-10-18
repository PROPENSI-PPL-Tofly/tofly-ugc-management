import { BadRequestException } from '@nestjs/common';
import { MAX_SEARCH_LENGTH } from '../creators/filters.js';
import { checkInvoiceFilters, hasInvoiceFilters } from './invoice-filters.js';

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

describe('hasInvoiceFilters', () => {
  it('says whether any filter is set', () => {
    expect(hasInvoiceFilters({})).toBe(false);
    expect(hasInvoiceFilters({ q: 'a' })).toBe(true);
    expect(hasInvoiceFilters({ contract: 'expired' })).toBe(true);
    expect(hasInvoiceFilters({ status: 'accruing' })).toBe(true);
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
