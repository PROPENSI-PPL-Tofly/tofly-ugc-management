import {
  callTikTok,
  isRecord,
  type Json,
  type TikTokAnswer,
} from '../../social/tiktok/tiktok-http.js';

import type { PerformanceMetrics } from '../performance-source.js';

// The counts of a creator's TikTok videos (PBI-27, 27.3), read with Display API's video/query.
// Only videos of the account the token belongs to come back, and only public ones (sandbox
// test, #127), so a video that is missing is not the creator's or not readable.

export const TIKTOK_VIDEO_QUERY_URL =
  'https://open.tiktokapis.com/v2/video/query/';

/** video/query takes at most this many ids in one call. */
export const MAX_IDS_PER_QUERY = 20;

const FIELDS = [
  'id',
  'view_count',
  'like_count',
  'comment_count',
  'share_count',
];

/** One video's four counts, as the port carries them: null is no data, never 0. */
export type VideoMetrics = PerformanceMetrics;

export interface VideoQueryResult {
  /** Each video TikTok returned, by id. A video asked for but absent was not found. */
  metrics: Map<string, VideoMetrics>;
  /** Ids whose batch failed; nothing is known about them now, so they are tried again later. */
  failed: string[];
}

/** TikTok refused the access token: every batch would be refused, so the whole read stops. */
export class TikTokTokenRejected extends Error {
  override readonly name = 'TikTokTokenRejected';
}

/** One batch could not be read; the others still are. */
class BatchFailed extends Error {}

/** A count TikTok sent, or null when it sent none or something that is not a count. */
function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function metricsOf(video: Json): VideoMetrics {
  return {
    views: count(video.view_count),
    likes: count(video.like_count),
    comments: count(video.comment_count),
    shares: count(video.share_count),
  };
}

/**
 * The counts of `videoIds`, asked in batches of MAX_IDS_PER_QUERY, one after another under the
 * caller's deadline. A batch that fails is reported in `failed` and the rest go on; a token
 * TikTok refuses rejects with TikTokTokenRejected.
 */
export async function queryVideoMetrics(
  fetchImpl: typeof fetch,
  accessToken: string,
  videoIds: readonly string[],
  deadline: AbortSignal,
): Promise<VideoQueryResult> {
  const unique = [...new Set(videoIds)];
  const metrics = new Map<string, VideoMetrics>();
  const failed: string[] = [];

  for (let start = 0; start < unique.length; start += MAX_IDS_PER_QUERY) {
    const batch = unique.slice(start, start + MAX_IDS_PER_QUERY);
    try {
      const videos = await queryBatch(fetchImpl, accessToken, batch, deadline);
      for (const [id, counts] of videos) {
        metrics.set(id, counts);
      }
    } catch (error) {
      if (error instanceof TikTokTokenRejected) {
        throw error;
      }
      failed.push(...batch);
    }
  }
  return { metrics, failed };
}

/** One video/query call. The token travels only in the Authorization header (OWASP A01:2025). */
async function queryBatch(
  fetchImpl: typeof fetch,
  accessToken: string,
  batch: readonly string[],
  deadline: AbortSignal,
): Promise<Map<string, VideoMetrics>> {
  const url = new URL(TIKTOK_VIDEO_QUERY_URL);
  url.searchParams.set('fields', FIELDS.join(','));

  let answer: TikTokAnswer;
  try {
    answer = await callTikTok(
      fetchImpl,
      url.toString(),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ filters: { video_ids: batch } }),
      },
      deadline,
    );
  } catch {
    throw new BatchFailed();
  }

  const { ok, status, body } = answer;
  const error = isRecord(body?.error) ? body.error : undefined;
  if (status === 401 || error?.code === 'access_token_invalid') {
    throw new TikTokTokenRejected('video/query refused the access token');
  }
  const data = isRecord(body?.data) ? body.data : undefined;
  if (!ok || error?.code !== 'ok' || !Array.isArray(data?.videos)) {
    throw new BatchFailed();
  }

  const asked = new Set(batch);
  const videos = new Map<string, VideoMetrics>();
  for (const video of data.videos as unknown[]) {
    const id = isRecord(video) ? video.id : undefined;
    const key =
      typeof id === 'string' || typeof id === 'number' ? String(id) : '';
    if (isRecord(video) && asked.has(key)) {
      videos.set(key, metricsOf(video));
    }
  }
  return videos;
}
