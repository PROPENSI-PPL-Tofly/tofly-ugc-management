import { describe, expect, it } from 'vitest';
import {
  checkCreateContent,
  type CreateContentContext,
} from './create-content.js';

const TODAY = new Date('2026-09-24T00:00:00.000Z');

const BASE_CONTEXT: CreateContentContext = {
  today: TODAY,
  contractStart: new Date('2026-09-01T00:00:00.000Z'),
  contractEnd: new Date('2026-12-31T00:00:00.000Z'),
  quota: 4,
  evergreenCount: 1,
  totalContentCount: 3,
};

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    creatorId: '550e8400-e29b-41d4-a716-446655440000',
    type: 'specific',
    name: 'Promo September',
    brief: 'Buat konten promo September.',
    deadline: '2026-10-01',
    ...overrides,
  };
}

describe('checkCreateContent', () => {
  it('accepts a valid Specific content', () => {
    const result = checkCreateContent(validBody(), BASE_CONTEXT);

    expect(result.type).toBe('specific');
    expect(result.name).toBe('Promo September');
    expect(result.brief).toBe('Buat konten promo September.');
    expect(result.deadline.toISOString().slice(0, 10)).toBe('2026-10-01');
  });

  it('requires name and brief for Specific content', () => {
    expect(() =>
      checkCreateContent(
        validBody({
          name: '',
          brief: '',
        }),
        BASE_CONTEXT,
      ),
    ).toThrowError();

    try {
      checkCreateContent(
        validBody({
          name: '',
          brief: '',
        }),
        BASE_CONTEXT,
      );
    } catch (error) {
      expect(error).toMatchObject({
        response: {
          errors: {
            name: 'Nama konten wajib diisi',
            brief: 'Brief wajib diisi',
          },
        },
      });
    }
  });

  it('allows Evergreen without a manual name or brief', () => {
    const result = checkCreateContent(
      validBody({
        type: 'evergreen',
        name: '',
        brief: '',
      }),
      BASE_CONTEXT,
    );

    expect(result.type).toBe('evergreen');
    expect(result.name).toBe('');
    expect(result.brief).toBe('');
  });

  it('rejects Evergreen when the Evergreen quota is full', () => {
    expect(() =>
      checkCreateContent(
        validBody({
          type: 'evergreen',
        }),
        {
          ...BASE_CONTEXT,
          evergreenCount: 4,
        },
      ),
    ).toThrowError(/Data content tidak valid/);
  });

  it('rejects any new content when the contract quota is already full', () => {
    expect(() =>
      checkCreateContent(validBody(), {
        ...BASE_CONTEXT,
        totalContentCount: 4,
      }),
    ).toThrowError(/Data content tidak valid/);

    try {
      checkCreateContent(validBody(), {
        ...BASE_CONTEXT,
        totalContentCount: 4,
      });
    } catch (error) {
      expect(error).toMatchObject({
        response: {
          errors: {
            quota: 'Kuota content sudah penuh',
          },
        },
      });
    }
  });

  it('rejects a deadline inside the five-day buffer', () => {
    expect(() =>
      checkCreateContent(
        validBody({
          deadline: '2026-09-28',
        }),
        BASE_CONTEXT,
      ),
    ).toThrowError(/Data content tidak valid/);

    try {
      checkCreateContent(
        validBody({
          deadline: '2026-09-28',
        }),
        BASE_CONTEXT,
      );
    } catch (error) {
      expect(error).toMatchObject({
        response: {
          errors: {
            deadline: 'Deadline paling cepat 2026-09-29',
          },
        },
      });
    }
  });

  it('rejects a deadline after contract end', () => {
    expect(() =>
      checkCreateContent(
        validBody({
          deadline: '2027-01-01',
        }),
        BASE_CONTEXT,
      ),
    ).toThrowError(/Data content tidak valid/);
  });
});
