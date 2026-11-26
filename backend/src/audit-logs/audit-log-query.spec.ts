import { BadRequestException } from '@nestjs/common';
import { checkAuditLogQuery } from './audit-log-query.js';

const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_ADMIN = 'aaaaaaaa-0000-4000-8000-000000000002';
const CREATOR = 'bbbbbbbb-0000-4000-8000-000000000001';

function whereOf(query: Record<string, unknown>, page = 1) {
  return checkAuditLogQuery(page, query).filter.toWhere();
}

function refused(query: Record<string, unknown>, page = 1): unknown {
  try {
    checkAuditLogQuery(page, query);
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('checkAuditLogQuery (SCRUM-296)', () => {
  it('reads no filters as every entry on the requested page', () => {
    expect(checkAuditLogQuery(3, {}).page).toBe(3);
    expect(whereOf({})).toEqual({ AND: [] });
  });

  it('turns each filter SCRUM-297 sends, comma separated, into its specification', () => {
    expect(
      whereOf({
        from: '2026-11-01',
        to: '2026-11-03',
        actor: `${ADMIN},system`,
        category: 'invoice_pembayaran,pengaturan',
        action: 'invoice_finalized,rate_formula_changed',
        creator: CREATOR,
      }),
    ).toEqual({
      AND: [
        {
          occurred_at: {
            gte: new Date('2026-10-31T17:00:00.000Z'),
            lt: new Date('2026-11-03T17:00:00.000Z'),
          },
        },
        { OR: [{ actor_user_id: { in: [ADMIN] } }, { actor_user_id: null }] },
        { category: { in: ['invoice_pembayaran', 'pengaturan'] } },
        { action: { in: ['invoice_finalized', 'rate_formula_changed'] } },
        { creator_id: { in: [CREATOR] } },
      ],
    });
  });

  it('also reads a filter sent once per value, keeping each value once', () => {
    expect(whereOf({ actor: [ADMIN, OTHER_ADMIN, ADMIN] })).toEqual({
      AND: [{ OR: [{ actor_user_id: { in: [ADMIN, OTHER_ADMIN] } }] }],
    });
  });

  it.each([
    ['only a first day', { from: '2026-11-01' }],
    ['only a last day', { to: '2026-11-03' }],
    ['the same first and last day', { from: '2026-11-01', to: '2026-11-01' }],
  ])('takes a date range with %s', (_name, query) => {
    expect(whereOf(query).AND).toHaveLength(1);
  });

  // PBI-23 AC 17: 20 rows a page, decided by the server, never by the request.
  it('ignores a pageSize in the request', () => {
    expect(whereOf({ pageSize: '1000' })).toEqual({ AND: [] });
  });

  describe('refuses with 400, never dropping a filter it cannot read (OWASP A10:2025)', () => {
    it.each([0, -1])('a page of %i', (page) => {
      expect(refused({}, page)).toBeInstanceOf(BadRequestException);
    });

    it('a first day after the last day', () => {
      expect(refused({ from: '2026-11-03', to: '2026-11-01' })).toBeInstanceOf(
        BadRequestException,
      );
    });

    it.each([
      ['an empty value', { category: '' }],
      ['an empty item in a list', { category: 'pengaturan,,akses_admin' }],
      ['a nested object', { creator: { id: CREATOR } }],
    ])('%s', (_name, query) => {
      expect(refused(query)).toBeInstanceOf(BadRequestException);
    });
  });

  // Only known categories and actions, real ids and real days reach the query (OWASP A05:2025).
  describe('refuses anything outside the allow-lists with 400 (OWASP A05:2025)', () => {
    it.each([
      ['an injected category', { category: "pengaturan' OR '1'='1" }],
      ['an unknown action', { action: 'audit_log_deleted' }],
      ['an actor that is not an id', { actor: 'admin@tofly.id' }],
      ['"system" as a creator', { creator: 'system' }],
      ['a creator that is not an id', { creator: `${CREATOR}; drop table` }],
      ['a day that does not exist', { from: '2026-02-30' }],
      ['a time instead of a day', { to: '2026-11-01T00:00:00Z' }],
      ['a day sent twice', { from: ['2026-11-01', '2026-11-02'] }],
    ])('%s', (_name, query) => {
      expect(refused(query)).toBeInstanceOf(BadRequestException);
    });
  });

  // A request cannot make the query carry thousands of values (OWASP A06:2025).
  describe('caps each filter at 50 values (OWASP A06:2025)', () => {
    const creators = (count: number) =>
      Array.from(
        { length: count },
        (_, index) =>
          `bbbbbbbb-0000-4000-8000-${String(index).padStart(12, '0')}`,
      ).join(',');

    it('takes 50', () => {
      expect(refused({ creator: creators(50) })).toBeUndefined();
    });

    it('refuses 51', () => {
      expect(refused({ creator: creators(51) })).toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
