import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ListCreatorsQuery } from './list-creators.query.js';

/** Mirrors the global pipe: whitelist strips unknowns, transform coerces the numbers. */
function parse(query: Record<string, unknown>) {
  const instance = plainToInstance(ListCreatorsQuery, query, {
    enableImplicitConversion: false,
  });
  return { instance, errors: validateSync(instance, { whitelist: true }) };
}

describe('ListCreatorsQuery', () => {
  it('accepts an empty query', () => {
    expect(parse({}).errors).toHaveLength(0);
  });

  it('accepts the documented filters', () => {
    const { instance, errors } = parse({
      q: 'rangga',
      contract: 'active',
      productivity: 'risk',
      page: '2',
      pageSize: '25',
    });

    expect(errors).toHaveLength(0);
    expect(instance).toMatchObject({ page: 2, pageSize: 25 });
  });

  it('trims the search term so padding does not change the result', () => {
    expect(parse({ q: '  rangga  ' }).instance.q).toBe('rangga');
  });

  it('leaves a non-string search term for the validator to reject', () => {
    const { instance, errors } = parse({ q: 42 });

    expect(instance.q).toBe(42);
    expect(errors).not.toHaveLength(0);
  });

  it('rejects a search term long enough to drive a scan', () => {
    expect(parse({ q: 'a'.repeat(101) }).errors).not.toHaveLength(0);
  });

  it('rejects an unknown contract filter', () => {
    expect(parse({ contract: 'whatever' }).errors).not.toHaveLength(0);
  });

  it('rejects an unknown productivity filter', () => {
    expect(parse({ productivity: 'excellent' }).errors).not.toHaveLength(0);
  });

  it('rejects a page below one', () => {
    expect(parse({ page: '0' }).errors).not.toHaveLength(0);
  });

  it('rejects a page that is not a whole number', () => {
    expect(parse({ page: '1.5' }).errors).not.toHaveLength(0);
  });

  it('rejects a page size beyond the ceiling', () => {
    expect(parse({ pageSize: '51' }).errors).not.toHaveLength(0);
  });
});
