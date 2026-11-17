import { loginCodeEmail } from './login-code-email.js';

describe('loginCodeEmail', () => {
  const message = loginCodeEmail('rangga@example.com', '012345', 10);

  it('goes to the requester from Tofly with the PBI subject', () => {
    expect(message).toMatchObject({
      to: 'rangga@example.com',
      senderName: 'Tofly',
      subject: 'Kode masuk Tofly',
    });
  });

  it('carries the six-digit code with its leading zero', () => {
    expect(message.text).toContain('012345');
  });

  it('says how long the code stays valid', () => {
    expect(message.text).toContain('10 menit');
  });

  it('warns the reader never to share the code', () => {
    expect(message.text).toContain('Jangan bagikan kode ini');
  });
});
