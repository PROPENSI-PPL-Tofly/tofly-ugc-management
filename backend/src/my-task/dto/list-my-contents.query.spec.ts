import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ListMyContentsQuery } from './list-my-contents.query.js';

/** Mirrors the global pipe: whitelist strips unknowns, transform coerces the numbers. */
function parse(query: Record<string, unknown>) {
  const instance = plainToInstance(ListMyContentsQuery, query, {
    enableImplicitConversion: false,
  });
  return { instance, errors: validateSync(instance, { whitelist: true }) };
}

describe('ListMyContentsQuery', () => {
  it('accepts an empty query', () => {
    expect(parse({}).errors).toHaveLength(0);
  });

  it('coerces the page numbers from the query string', () => {
    const { instance, errors } = parse({ page: '2', pageSize: '5' });

    expect(errors).toHaveLength(0);
    expect(instance).toMatchObject({ page: 2, pageSize: 5 });
  });

  it.each([
    { page: '0' },
    { page: 'abc' },
    { pageSize: '51' },
    { pageSize: '1.5' },
  ])('rejects %o', (query) => {
    expect(parse(query).errors.length).toBeGreaterThan(0);
  });
});
