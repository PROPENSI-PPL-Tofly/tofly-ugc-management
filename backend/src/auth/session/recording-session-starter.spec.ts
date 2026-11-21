import type { Response } from 'express';
import type { Principal } from '../google/ports.js';
import { RecordingSessionStarter } from './recording-session-starter.js';

// SCRUM-246 (PBI-23): "Pengguna Admin" shows each Admin's last sign-in. Google and the email code
// both start a session through SESSION_STARTER, so the sign-in is recorded there, once.

const NOW = new Date('2026-11-21T08:00:00.000Z');
const ADMIN: Principal = { userId: 'user-1', role: 'admin' };
const response = {} as Response;

function setup() {
  const sessions = { start: vi.fn().mockResolvedValue({ id: 'opaque' }) };
  const users = { update: vi.fn().mockResolvedValue({}) };
  const starter = new RecordingSessionStarter(sessions, users, () => NOW);
  return { sessions, users, starter };
}

describe('RecordingSessionStarter', () => {
  it('starts the session, then records when the user signed in', async () => {
    const { sessions, users, starter } = setup();

    await starter.start(response, ADMIN);

    expect(sessions.start).toHaveBeenCalledWith(response, ADMIN);
    expect(users.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { last_signed_in_at: NOW },
      select: { id: true },
    });
    expect(sessions.start.mock.invocationCallOrder[0]).toBeLessThan(
      users.update.mock.invocationCallOrder[0],
    );
  });

  it('records nothing when the session could not be started', async () => {
    const { sessions, users, starter } = setup();
    sessions.start.mockRejectedValue(new Error('database away'));

    await expect(starter.start(response, ADMIN)).rejects.toThrow('database away');
    expect(users.update).not.toHaveBeenCalled();
  });

  // The session exists, so the person is signed in; a lost timestamp must not undo that.
  it('keeps the sign-in when the timestamp cannot be written', async () => {
    const { users, starter } = setup();
    users.update.mockRejectedValue(new Error('row locked'));

    await expect(starter.start(response, ADMIN)).resolves.toBeUndefined();
  });

  it('reads the clock when no clock is given', async () => {
    const sessions = { start: vi.fn().mockResolvedValue({ id: 'opaque' }) };
    const users = { update: vi.fn().mockResolvedValue({}) };

    await new RecordingSessionStarter(sessions, users).start(response, ADMIN);

    const at = users.update.mock.calls[0][0].data.last_signed_in_at as Date;
    expect(at).toBeInstanceOf(Date);
  });
});
