import { PortNotReady } from '../auth/google/unready-ports.js';
import { unreadyEmailTemplates } from './email-templates.js';

describe('unreadyEmailTemplates', () => {
  // Until 11.4's templates are bound, no email goes out half-written: rendering fails, the helper
  // marks the email failed, and the 08:00 run sends it once the templates exist (AC 9).
  it('refuses to render any template', () => {
    expect(() => unreadyEmailTemplates.render('content_scheduled', {})).toThrow(PortNotReady);
  });
});
