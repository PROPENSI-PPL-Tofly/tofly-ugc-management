import { UnprocessableEntityException } from '@nestjs/common';
import type { content_status } from '@prisma/client';

export interface VideoSubmission {
  videoLink: string;
}

export const MAX_VIDEO_LINK_LENGTH = 2048;

const WEB_PROTOCOLS = ['http:', 'https:'] as const;

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

/**
 * A final video link may be submitted after draft approval, or from H-1 onward
 * for unfinished content. Content that already has a submitted link is terminal.
 */
export function canSubmitVideo(
  status: content_status,
  deadline: string,
  today: string,
): boolean {
  if (status === 'link_submitted') {
    return false;
  }

  if (status === 'draft_approved') {
    return true;
  }

  const deadlineDate = new Date(`${deadline}T00:00:00.000Z`);
  deadlineDate.setUTCDate(deadlineDate.getUTCDate() - 1);

  const graceStart = deadlineDate.toISOString().slice(0, 10);

  return today >= graceStart;
}
