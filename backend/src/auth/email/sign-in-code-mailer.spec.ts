import { PortNotReady } from '../google/unready-ports.js';
import {
  SIGN_IN_CODE_MAILER,
  unreadySignInCodeMailer,
} from './sign-in-code-mailer.js';

describe('the sign-in code mailer placeholder', () => {
  it('refuses every send until SCRUM-239 binds the EmailSender, so the user is told it failed', async () => {
    await expect(
      unreadySignInCodeMailer.sendSignInCode('rangga@example.com', '123456'),
    ).rejects.toBeInstanceOf(PortNotReady);
  });

  it('names no address and no code in its error', async () => {
    const error = await unreadySignInCodeMailer
      .sendSignInCode('rangga@example.com', '123456')
      .catch((reason: unknown) => reason as Error);

    expect(error.message).toBe('EmailSender (SCRUM-239) is not available yet');
  });

  it('is provided under its own token', () => {
    expect(SIGN_IN_CODE_MAILER).toBe('SIGN_IN_CODE_MAILER');
  });
});
