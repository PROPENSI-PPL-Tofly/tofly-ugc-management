import type { INestApplication } from '@nestjs/common';
import { applySecurityHeaders } from './security-headers.js';

describe('applySecurityHeaders', () => {
  it('registers the helmet middleware on the app', () => {
    const app = { use: vi.fn() } as unknown as INestApplication;

    applySecurityHeaders(app);

    expect(app.use).toHaveBeenCalledTimes(1);
    expect(typeof vi.mocked(app.use).mock.calls[0][0]).toBe('function');
  });
});
