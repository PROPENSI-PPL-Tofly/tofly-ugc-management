import { UnprocessableEntityException } from '@nestjs/common';
import type { social_platform } from '@prisma/client';

export interface VideoSubmission {
  videoLink: string;
}

export const MAX_VIDEO_LINK_LENGTH = 2048;

const WEB_PROTOCOLS = ['http:', 'https:'] as const;

export function detectVideoPlatform(videoLink: string): social_platform | null {
  const trimmedLink = videoLink.trim();

  if (!URL.canParse(trimmedLink)) {
    return null;
  }

  const url = new URL(trimmedLink);

  if (!WEB_PROTOCOLS.includes(url.protocol as (typeof WEB_PROTOCOLS)[number])) {
    return null;
  }

  const host = url.hostname.toLowerCase();

  if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
    return 'instagram';
  }

  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
    return 'tiktok';
  }

  return null;
}

function isWebLink(link: string): boolean {
  if (!URL.canParse(link)) {
    return false;
  }

  return WEB_PROTOCOLS.includes(
    new URL(link).protocol as (typeof WEB_PROTOCOLS)[number],
  );
}

function checkVideoLink(value: unknown): string | { error: string } {
  const videoLink = typeof value === 'string' ? value.trim() : '';

  if (videoLink === '') {
    return { error: 'Link video wajib diisi' };
  }

  if (videoLink.length > MAX_VIDEO_LINK_LENGTH) {
    return {
      error: `Link video maksimal ${MAX_VIDEO_LINK_LENGTH} karakter`,
    };
  }

  if (!isWebLink(videoLink)) {
    return { error: 'Link video harus berupa URL http atau https' };
  }

  return videoLink;
}

/**
 * Validates the final-video submission body at the HTTP boundary.
 * Every invalid field is reported through one 422 response.
 */
export function checkVideoSubmission(input: unknown): VideoSubmission {
  const body =
    input !== null && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  const videoLink = checkVideoLink(body.videoLink);

  if (typeof videoLink === 'object') {
    throw new UnprocessableEntityException({
      message: 'Data link video tidak valid',
      errors: {
        videoLink: videoLink.error,
      },
    });
  }

  return {
    videoLink,
  };
}
