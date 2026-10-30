import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { social_platform } from '@prisma/client';
import { SOCIAL_PLATFORMS } from '../creators/new-creator.js';
import { checkPlatformLink, isSocialPlatform } from './link-rules.js';

// The bodies of the submit and replace link routes (PBI-38 38.2), checked at the HTTP boundary
// so the service only ever sees links a platform rule accepted.

/** One checked link: its platform and the trimmed URL to store. */
export interface PlatformLink {
  platform: social_platform;
  url: string;
}

function invalid(errors: Record<string, string>): UnprocessableEntityException {
  return new UnprocessableEntityException({
    message: 'Data link video tidak valid',
    errors,
  });
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A field the creator left empty: the form sends every platform it shows, filled or not. */
function isEmptyField(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '')
  );
}

/**
 * `{ links: { instagram?, tiktok? } }`: one link per filled platform (AC 3). Every refused field
 * is answered in one 422, keyed by its platform, so the modal can put each message under its
 * own field; with nothing filled the answer is on `links`.
 */
export function checkLinkSubmission(body: unknown): PlatformLink[] {
  const fields = asObject(asObject(body)?.links) ?? {};
  if (Object.keys(fields).some((key) => !isSocialPlatform(key))) {
    throw invalid({ links: 'Platform hanya instagram atau tiktok' });
  }

  const links: PlatformLink[] = [];
  const errors: Record<string, string> = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const value = fields[platform];
    if (isEmptyField(value)) {
      continue;
    }
    const checked = checkPlatformLink(platform, value);
    if ('error' in checked) {
      errors[platform] = checked.error;
    } else {
      links.push({ platform, url: checked.url });
    }
  }

  if (Object.keys(errors).length > 0) {
    throw invalid(errors);
  }
  if (links.length === 0) {
    throw invalid({ links: 'Isi minimal satu link video' });
  }
  return links;
}

/** `PUT /contents/:id/links/:platform` with `{ url }`: the one link that takes the old one's place. */
export function checkLinkReplacement(
  platform: unknown,
  body: unknown,
): PlatformLink {
  if (!isSocialPlatform(platform)) {
    throw new NotFoundException({
      code: 'PLATFORM_NOT_FOUND',
      message: 'Platform tidak dikenal',
    });
  }
  const checked = checkPlatformLink(platform, asObject(body)?.url);
  if ('error' in checked) {
    throw invalid({ [platform]: checked.error });
  }
  return { platform, url: checked.url };
}
