import { BadRequestException } from '@nestjs/common';
import { TAB_STATUSES } from '../contents/content-list.js';
import {
  MY_TASK_TAB_STATUSES,
  PERIOD_FREE_MY_TAB,
  checkMyTaskQuery,
  myTabOf,
} from './my-task-query.js';

describe('MY_TASK_TAB_STATUSES', () => {
  it('groups a creator’s committed work by whose turn it is, never listing a pending proposal', () => {
    expect(MY_TASK_TAB_STATUSES).toEqual({
      all: [
        'scheduled',
        'draft_review',
        'draft_revision',
        'draft_approved',
        'link_submitted',
      ],
      to_do: ['scheduled', 'draft_revision', 'draft_approved'],
      waiting_admin: ['draft_review'],
      done: ['link_submitted'],
    });
  });

  it('reads the creator’s tabs off the admin’s, so the two sides cannot disagree on whose turn it is', () => {
    expect(MY_TASK_TAB_STATUSES.to_do).toEqual(TAB_STATUSES.waiting_creator);
    expect(MY_TASK_TAB_STATUSES.done).toEqual(TAB_STATUSES.done);
  });

  it('never lets a date range hide work the creator still has to do', () => {
    expect(PERIOD_FREE_MY_TAB).toBe('to_do');
  });
});

describe('myTabOf', () => {
  it.each([
    ['scheduled', 'to_do'],
    ['draft_revision', 'to_do'],
    ['draft_approved', 'to_do'],
    ['draft_review', 'waiting_admin'],
    ['link_submitted', 'done'],
  ] as const)('puts %s under %s', (status, tab) => {
    expect(myTabOf(status)).toBe(tab);
  });
});

describe('checkMyTaskQuery', () => {
  it('opens Semua with the nearest deadline first when nothing is asked', () => {
    expect(checkMyTaskQuery({})).toEqual({ tab: 'all', sort: 'deadline_asc' });
  });

  it('reads every filter a creator can set', () => {
    expect(
      checkMyTaskQuery({
        tab: 'to_do',
        q: '  Review  ',
        type: ['evergreen', 'specific'],
        status: ['scheduled', 'draft_revision'],
        overdue: 'false',
        deadlineFrom: '2026-10-01',
        deadlineTo: '2026-10-31',
        sort: 'deadline_desc',
      }),
    ).toEqual({
      tab: 'to_do',
      q: 'Review',
      types: ['evergreen', 'specific'],
      statuses: ['scheduled', 'draft_revision'],
      overdue: false,
      deadlineFrom: '2026-10-01',
      deadlineTo: '2026-10-31',
      sort: 'deadline_desc',
    });
  });

  it('still reads one status sent as plain text, the way the old single filter sent it', () => {
    expect(checkMyTaskQuery({ status: 'draft_review' }).statuses).toEqual([
      'draft_review',
    ]);
  });

  it('keeps a value picked twice once', () => {
    expect(
      checkMyTaskQuery({ type: ['specific', 'specific'] }).types,
    ).toEqual(['specific']);
  });

  it('accepts a period of a single day', () => {
    expect(
      checkMyTaskQuery({ deadlineFrom: '2028-02-29', deadlineTo: '2028-02-29' }),
    ).toMatchObject({ deadlineFrom: '2028-02-29', deadlineTo: '2028-02-29' });
  });

  it('drops a search that is only spaces', () => {
    expect(checkMyTaskQuery({ q: '   ' })).not.toHaveProperty('q');
  });

  it.each([
    ['the admin’s tab name', { tab: 'needs_approval' }],
    ['an unknown tab', { tab: 'later' }],
    ['a repeated tab', { tab: ['all', 'done'] }],
    ['a pending proposal, which is not assigned work', { status: 'pending' }],
    ['the removed draft_revised', { status: ['scheduled', 'draft_revised'] }],
    ['an unknown type', { type: 'optional' }],
    ['more statuses than any list holds', { status: Array(51).fill('scheduled') }],
    ['an overdue flag that is not true or false', { overdue: 'yes' }],
    ['a sort the list does not offer', { sort: 'name_asc' }],
    ['a short sort name', { sort: 'asc' }],
    ['a search sent twice', { q: ['a', 'b'] }],
    ['a search over 100 characters', { q: 'x'.repeat(101) }],
    ['a day that does not exist', { deadlineFrom: '2026-02-30' }],
    ['a day in another format', { deadlineTo: '31/10/2026' }],
    ['a period that ends before it starts', { deadlineFrom: '2026-10-31', deadlineTo: '2026-10-01' }],
    ['an object smuggled through the query parser', { status: { in: ['pending'] } }],
    ['a SQL payload', { tab: "all' OR 1=1--" }],
  ])('rejects %s with a 400', (_label, query) => {
    expect(() => checkMyTaskQuery(query)).toThrow(BadRequestException);
  });

  it('names the creator’s statuses in the 400, so the caller sees what it may send', () => {
    expect(() => checkMyTaskQuery({ status: 'pending' })).toThrow(
      new BadRequestException(
        'status must be one of scheduled, draft_review, draft_revision, draft_approved, link_submitted',
      ),
    );
  });

  it('names the creator’s tabs in the 400', () => {
    expect(() => checkMyTaskQuery({ tab: 'action' })).toThrow(
      new BadRequestException('tab must be one of all, to_do, waiting_admin, done'),
    );
  });
});
