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
});
