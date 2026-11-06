import { fromStoredHistory } from './stored-history.js';

describe('fromStoredHistory', () => {
  // PBI-27 AC 17: the platform replacing typed numbers is a step, by the system.
  it('reads manual numbers the platform replaced as their own step', () => {
    const [event] = fromStoredHistory([
      {
        id: 'event-1',
        event_type: 'Performance Replaced',
        actor_name: 'Sistem',
        actor_role: 'system',
        occurred_at: new Date('2026-11-03T19:00:00.000Z'),
        event_data: { platform: 'tiktok' },
      },
    ]);

    expect(event.type).toBe('performance_replaced');
    expect(event.payload).toEqual({ platform: 'tiktok' });
    expect(event.actor.role).toBe('system');
  });

  // PBI-27 AC 16, 17: a number step shows what moved, and only that.
  it.each(['Performance Entered', 'Performance Replaced'])(
    'reads what moved on a %s step',
    (event_type) => {
      const [event] = fromStoredHistory([
        {
          id: 'event-1',
          event_type,
          actor_name: 'Admin',
          actor_role: 'admin',
          occurred_at: new Date('2026-11-03T19:00:00.000Z'),
          event_data: {
            platform: 'tiktok',
            before: { views: 100, likes: null, comments: 2, shares: 1 },
            after: { views: 12400, likes: 5, comments: 2, shares: 1 },
          },
        },
      ]);

      expect(event.payload?.changes).toEqual([
        { metric: 'views', before: 100, after: 12400 },
        { metric: 'likes', before: null, after: 5 },
      ]);
    },
  );

  it('leaves the changes out of a step stored without values', () => {
    const [event] = fromStoredHistory([
      {
        id: 'event-1',
        event_type: 'Performance Entered',
        actor_name: 'Admin',
        actor_role: 'admin',
        occurred_at: new Date('2026-11-03T19:00:00.000Z'),
        event_data: { platform: 'tiktok' },
      },
    ]);

    expect(event.payload).toEqual({ platform: 'tiktok' });
  });
});
