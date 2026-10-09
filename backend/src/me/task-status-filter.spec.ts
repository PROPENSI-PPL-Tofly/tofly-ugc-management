import { BadRequestException } from '@nestjs/common';
import { checkTaskStatus, statusesFor } from './task-status-filter.js';

describe('checkTaskStatus', () => {
  it('reads no filter when the query leaves status out', () => {
    expect(checkTaskStatus(undefined)).toBeUndefined();
  });

  it.each([
    'scheduled',
    'draft_review',
    'draft_revision',
    'draft_approved',
    'link_submitted',
  ])('accepts the Task Saya status %s', (status) => {
    expect(checkTaskStatus(status)).toBe(status);
  });

  it.each([
    ['an unknown status', 'done'],
    ['an empty value', ''],
    ['the removed draft_revised', 'draft_revised'],
    ['a status in the wrong case', 'Scheduled'],
    ['a repeated parameter', ['scheduled', 'draft_review']],
    ['a SQL payload', "scheduled' OR 1=1--"],
  ])('rejects %s with a 400', (_label, value) => {
    expect(() => checkTaskStatus(value)).toThrow(BadRequestException);
  });
});

describe('statusesFor', () => {
  it.each([
    'scheduled',
    'draft_review',
    'draft_revision',
    'draft_approved',
    'link_submitted',
  ] as const)(
    'keeps %s to itself',
    (status) => {
      expect(statusesFor(status)).toEqual([status]);
    },
  );
});
