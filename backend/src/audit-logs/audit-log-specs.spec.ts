import {
  AboutCreators,
  ActedBy,
  allOf,
  InCategories,
  OccurredBetween,
  SYSTEM_ACTOR_FILTER,
  WithActions,
} from './audit-log-specs.js';

const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_ADMIN = 'aaaaaaaa-0000-4000-8000-000000000002';
const CREATOR = 'bbbbbbbb-0000-4000-8000-000000000001';

describe('Log Aktivitas specifications (SCRUM-296)', () => {
  describe('OccurredBetween', () => {
    // PBI-23: the date range is read in WIB, both days included.
    it('starts at midnight WIB of the first day and ends before midnight WIB after the last', () => {
      expect(new OccurredBetween('2026-11-01', '2026-11-03').toWhere()).toEqual(
        {
          occurred_at: {
            gte: new Date('2026-10-31T17:00:00.000Z'),
            lt: new Date('2026-11-03T17:00:00.000Z'),
          },
        },
      );
    });

    it('leaves the end open when only the first day is given', () => {
      expect(new OccurredBetween('2026-11-01', undefined).toWhere()).toEqual({
        occurred_at: { gte: new Date('2026-10-31T17:00:00.000Z') },
      });
    });

    it('leaves the start open when only the last day is given', () => {
      expect(new OccurredBetween(undefined, '2026-11-03').toWhere()).toEqual({
        occurred_at: { lt: new Date('2026-11-03T17:00:00.000Z') },
      });
    });
  });

  describe('ActedBy', () => {
    it('matches the chosen people by their user id', () => {
      expect(new ActedBy([ADMIN, OTHER_ADMIN]).toWhere()).toEqual({
        OR: [{ actor_user_id: { in: [ADMIN, OTHER_ADMIN] } }],
      });
    });

    it('reads "Sistem" as the entries no user made', () => {
      expect(new ActedBy([SYSTEM_ACTOR_FILTER]).toWhere()).toEqual({
        OR: [{ actor_user_id: null }],
      });
    });

    it('matches either when a person and "Sistem" are both chosen', () => {
      expect(new ActedBy([ADMIN, SYSTEM_ACTOR_FILTER]).toWhere()).toEqual({
        OR: [{ actor_user_id: { in: [ADMIN] } }, { actor_user_id: null }],
      });
    });
  });

  it('InCategories matches the chosen categories', () => {
    expect(new InCategories(['pengaturan', 'akses_admin']).toWhere()).toEqual({
      category: { in: ['pengaturan', 'akses_admin'] },
    });
  });

  it('WithActions matches the chosen actions', () => {
    expect(new WithActions(['invoice_finalized']).toWhere()).toEqual({
      action: { in: ['invoice_finalized'] },
    });
  });

  it('AboutCreators matches the entries about the chosen creators', () => {
    expect(new AboutCreators([CREATOR]).toWhere()).toEqual({
      creator_id: { in: [CREATOR] },
    });
  });

  describe('allOf', () => {
    it('requires every specification at once', () => {
      expect(
        allOf([
          new InCategories(['pengaturan']),
          new AboutCreators([CREATOR]),
        ]).toWhere(),
      ).toEqual({
        AND: [
          { category: { in: ['pengaturan'] } },
          { creator_id: { in: [CREATOR] } },
        ],
      });
    });

    it('matches every entry when nothing narrows the list', () => {
      expect(allOf([]).toWhere()).toEqual({ AND: [] });
    });
  });
});
