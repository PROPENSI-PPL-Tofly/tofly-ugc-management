import {
  parseFilterQuery,
  type CreatorFilters,
  CONTRACT_FILTERS,
  PRODUCTIVITY_FILTERS,
} from './parse-filter-query.js';

describe('parseFilterQuery', () => {
  it('returns defaults when no params provided', () => {
    expect(parseFilterQuery({})).toEqual({
      q: '',
      contract: 'all',
      productivity: 'all',
    });
  });

  it('reads q search term', () => {
    expect(parseFilterQuery({ q: 'rangga' })).toEqual({
      q: 'rangga',
      contract: 'all',
      productivity: 'all',
    });
  });

  it('reads contract filter', () => {
    expect(parseFilterQuery({ contract: 'active' })).toEqual({
      q: '',
      contract: 'active',
      productivity: 'all',
    });
  });

  it('reads productivity filter', () => {
    expect(parseFilterQuery({ productivity: 'risk' })).toEqual({
      q: '',
      contract: 'all',
      productivity: 'risk',
    });
  });

  it('trims whitespace from q', () => {
    expect(parseFilterQuery({ q: '  rangga  ' })).toMatchObject({
      q: 'rangga',
    });
  });

  it.each(['all', 'active', 'expired'] as const)(
    'accepts contract value "%s"',
    (value) => {
      expect(parseFilterQuery({ contract: value }).contract).toBe(value);
    },
  );

  it.each(['all', 'good', 'watch', 'risk'] as const)(
    'accepts productivity value "%s"',
    (value) => {
      expect(parseFilterQuery({ productivity: value }).productivity).toBe(value);
    },
  );

  it('falls back to "all" for unknown contract value', () => {
    expect(parseFilterQuery({ contract: 'unknown' }).contract).toBe('all');
  });

  it('falls back to "all" for unknown productivity value', () => {
    expect(parseFilterQuery({ productivity: 'unknown' }).productivity).toBe('all');
  });

  it('takes the first value when parameter is repeated', () => {
    expect(parseFilterQuery({ q: ['first', 'second'] })).toMatchObject({
      q: 'first',
    });
  });
});
