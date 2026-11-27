import type { Prisma, social_platform } from '@prisma/client';

/** The slice of the database client this read uses. */
export type SubmittedPlatformsClient = Pick<Prisma.TransactionClient, 'content_links'>;

/** The platforms a creator has submitted a link on, in any of their periods (PBI-16 AC 7). */
export async function submittedPlatforms(
  client: SubmittedPlatformsClient,
  creatorId: string,
): Promise<ReadonlySet<social_platform | null>> {
  const links = await client.content_links.findMany({
    where: {
      platform: { not: null },
      contents: { contracts: { creator_id: creatorId } },
    },
    distinct: ['platform'],
    select: { platform: true },
  });
  return new Set(links.map((link) => link.platform));
}
