import { signInCodeEmail } from './sign-in-code.js';

describe('signInCodeEmail', () => {
  it('reads "Kode masuk Tofly" from "Tofly", carrying the six digits in both bodies (AC 3)', () => {
    const email = signInCodeEmail('123456');

    expect(email.senderName).toBe('Tofly');
    expect(email.subject).toBe('Kode masuk Tofly');
    expect(email.text).toContain('123456');
    expect(email.html).toContain('123456');
  });

  it('names the ten minutes the code stays valid and its single use (AC 3)', () => {
    const email = signInCodeEmail('123456');

    expect(email.text).toContain('10 menit');
    expect(email.text).toMatch(/hanya bisa dipakai sekali/i);
    expect(email.html).toContain('10 menit');
  });

  it('escapes whatever it interpolates into the HTML body, leaving the text body as sent', () => {
    const email = signInCodeEmail('<img src=x onerror="alert(1)">');

    expect(email.html).not.toContain('<img');
    expect(email.html).toContain('&lt;img');
    expect(email.text).toContain('<img src=x onerror="alert(1)">');
  });

  it('escapes every character that would become markup in the HTML body', () => {
    const email = signInCodeEmail('&<>"\'');

    expect(email.html).toContain('&amp;&lt;&gt;&quot;&#39;');
    expect(email.text).toContain('&<>"\'');
  });

  it('says what to do when the code was not asked for', () => {
    const email = signInCodeEmail('123456');

    expect(email.text).toContain('abaikan email ini');
  });
});
