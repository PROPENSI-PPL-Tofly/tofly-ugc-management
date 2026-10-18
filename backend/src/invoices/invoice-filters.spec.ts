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

describe('hasInvoiceFilters', () => {
  it('says whether any filter is set', () => {
    expect(hasInvoiceFilters({})).toBe(false);
    expect(hasInvoiceFilters({ q: 'a' })).toBe(true);
    expect(hasInvoiceFilters({ contract: 'expired' })).toBe(true);
  });
});
