import { ForbiddenException } from '@nestjs/common';

export interface OriginRequest {
  headers: Record<string, string | string[] | undefined>;
}

/** Reject browser state changes initiated by another origin. */
export function assertSameOrigin(request: OriginRequest): void {
  const origin = request.headers.origin;
  const fetchSite = request.headers['sec-fetch-site'];
  const expectedOrigin = process.env.FRONTEND_URL;

  if (
    typeof origin !== 'string' ||
    (fetchSite !== undefined && fetchSite !== 'same-origin')
  ) {
    throw new ForbiddenException('Cross-origin request refused');
  }

  let actual: string;
  try {
    actual = new URL(origin).origin;
  } catch {
    throw new ForbiddenException('Cross-origin request refused');
  }

  if (expectedOrigin) {
    let expected: string;
    try {
      expected = new URL(expectedOrigin).origin;
    } catch {
      throw new ForbiddenException('Cross-origin request refused');
    }
    if (actual !== expected) {
      throw new ForbiddenException('Cross-origin request refused');
    }
  } else if (fetchSite !== 'same-origin') {
    // In production deployments without FRONTEND_URL, require browser Fetch Metadata.
    throw new ForbiddenException('Cross-origin request refused');
  }
}
