import { smtpConfig } from './email-config.js';

const FULL = {
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: '587',
  SMTP_USER: 'tofly.notify@gmail.com',
  SMTP_PASS: 'sixteen charact',
  EMAIL_FROM: 'tofly.notify@gmail.com',
};

describe('smtpConfig', () => {
  it('reads the SMTP settings from the server config, trimming what it finds', () => {
    expect(smtpConfig({ ...FULL, SMTP_HOST: ' smtp.gmail.com ' })).toEqual({
      host: 'smtp.gmail.com',
      port: 587,
      user: 'tofly.notify@gmail.com',
      pass: 'sixteen charact',
      from: 'tofly.notify@gmail.com',
    });
  });

  it.each(Object.keys(FULL))('reads as not configured without %s', (name) => {
    expect(smtpConfig({ ...FULL, [name]: '' })).toBeUndefined();
  });

  it('reads as not configured for a port that is no whole number', () => {
    expect(smtpConfig({ ...FULL, SMTP_PORT: 'five eight seven' })).toBeUndefined();
    expect(smtpConfig({ ...FULL, SMTP_PORT: '0' })).toBeUndefined();
    expect(smtpConfig({ ...FULL, SMTP_PORT: '587.5' })).toBeUndefined();
  });
});
