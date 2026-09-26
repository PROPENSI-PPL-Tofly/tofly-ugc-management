import { compareMyTasks, type TaskOrder } from './my-tasks.js';

function task(overrides: Partial<TaskOrder>): TaskOrder {
  return {
    id: 'a',
    name: 'Konten',
    deadline: '2026-10-20',
    status: 'scheduled',
    ...overrides,
  };
}

function order(tasks: TaskOrder[]): string[] {
  return [...tasks].sort(compareMyTasks).map((t) => t.id);
}

describe('compareMyTasks', () => {
  it('puts the nearest deadline first', () => {
    expect(
      order([
        task({ id: 'late', deadline: '2026-11-01' }),
        task({ id: 'soon', deadline: '2026-10-12' }),
        task({ id: 'overdue', deadline: '2026-10-01' }),
      ]),
    ).toEqual(['overdue', 'soon', 'late']);
  });

  it('keeps every open task ahead of submitted links, whatever their deadline', () => {
    expect(
      order([
        task({ id: 'done-early', deadline: '2026-09-01', status: 'link_submitted' }),
        task({ id: 'open-late', deadline: '2026-12-01', status: 'draft_review' }),
        task({ id: 'open-soon', deadline: '2026-10-10', status: 'draft_approved' }),
        task({ id: 'done-late', deadline: '2026-10-05', status: 'link_submitted' }),
      ]),
    ).toEqual(['open-soon', 'open-late', 'done-early', 'done-late']);
  });

  it('breaks a shared deadline by name, then by id, so pages never shift', () => {
    expect(
      order([
        task({ id: 'b2', name: 'Beta' }),
        task({ id: 'a1', name: 'Alpha' }),
        task({ id: 'b1', name: 'Beta' }),
      ]),
    ).toEqual(['a1', 'b1', 'b2']);
  });

  it('treats identical tasks as equal', () => {
    expect(compareMyTasks(task({}), task({}))).toBe(0);
  });
});
