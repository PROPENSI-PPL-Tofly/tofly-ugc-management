import { checkNewCreator } from './new-creator.js';

const TODAY = new Date('2026-09-23T00:00:00Z');

/** A calendar day as Postgres `date` columns hold it: midnight UTC. */
function day(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** A body the Add Creator modal could send, valid on TODAY; each test breaks one thing. */
function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Salsa Putri Amelia',
    email: 'salsa@example.com',
    socialPlatform: 'instagram',
    socialUsername: 'salsa.amelia',
    contractStart: '2026-10-01',
    contractEnd: '2026-12-31',
    interval: 7,
    quota: 3,
    fixedRate: 500000,
    deadlines: ['2026-10-06', '2026-10-13', '2026-10-20'],
    ...overrides,
  };
}

describe('checkNewCreator', () => {
  it('turns a valid body into the creator to save', () => {
    expect(checkNewCreator(body(), TODAY)).toEqual({
      firstName: 'Salsa',
      middleName: 'Putri',
      lastName: 'Amelia',
      email: 'salsa@example.com',
      socialPlatform: 'instagram',
      socialUsername: 'salsa.amelia',
      contractStart: day('2026-10-01'),
      contractEnd: day('2026-12-31'),
      interval: 7,
      quota: 3,
      fixedRate: 500000,
      deadlines: [day('2026-10-06'), day('2026-10-13'), day('2026-10-20')],
    });
  });
});
