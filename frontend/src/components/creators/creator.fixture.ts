import type { CreatorListResponse, CreatorSummary } from "@/lib/creators";

/** A creator in the middle of a running contract; tests override what they care about. */
export function creator(overrides: Partial<CreatorSummary> = {}): CreatorSummary {
  return {
    id: "creator-1",
    name: "Rangga Pratama",
    email: "rangga@example.com",
    socials: { instagram: "rangga.creates", tiktok: "ranggacreates" },
    accessRevokeDate: null,
    contract: {
      status: "active",
      startDate: "2026-06-10",
      endDate: "2026-12-07",
      daysRemaining: 80,
      periodNumber: 1,
      contentQuota: 6,
    },
    progress: { submitted: 5, total: 6, percent: 83 },
    performance: {
      onTimeRate: 80,
      avgRevisions: 0.17,
      productivity: "good",
      productivityLabel: "Baik",
    },
    ...overrides,
  };
}

export function listResponse(
  overrides: Partial<CreatorListResponse> = {},
): CreatorListResponse {
  return {
    items: [creator()],
    page: 1,
    pageSize: 10,
    total: 1,
    totalPages: 1,
    ...overrides,
  };
}
