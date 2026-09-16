import type { CreatorDetail, CreatorSummary } from "@/lib/creators";

/** A believable creator row for tests, with only the fields under test overridden. */
export function creatorSummary(overrides: Partial<CreatorSummary> = {}): CreatorSummary {
  return {
    id: "creator-rangga",
    name: "Rangga Pratama",
    email: "rangga@example.com",
    socials: { instagram: "rangga.creates" },
    accessRevokeDate: null,
    contract: {
      status: "active",
      startDate: "2026-06-08",
      endDate: "2026-12-25",
      daysRemaining: 100,
      periodNumber: 1,
      contentQuota: 6,
    },
    progress: { submitted: 2, total: 3, percent: 67 },
    performance: {
      onTimeRate: 100,
      avgRevisions: 0.5,
      productivity: "good",
      productivityLabel: "Baik",
    },
    ...overrides,
  };
}

export function creatorDetail(overrides: Partial<CreatorDetail> = {}): CreatorDetail {
  return {
    ...creatorSummary(),
    phoneNumber: "081234567001",
    contractHistory: [
      {
        id: "contract-1",
        periodNumber: 1,
        startDate: "2026-06-08",
        endDate: "2026-12-25",
        daysBetween: 14,
        contentQuota: 6,
        completed: 2,
        total: 3,
        isCurrent: true,
      },
    ],
    contents: [
      {
        id: "content-1",
        name: "Evergreen - Tips Belajar Cepat",
        type: "evergreen",
        deadline: "2026-06-18",
        status: "link_submitted",
        outcome: "on_time",
        videoLink: "https://instagram.com/reel/abc",
      },
    ],
    drafts: [
      {
        contentId: "content-1",
        contentName: "Evergreen - Tips Belajar Cepat",
        revisionCount: 1,
        latestLink: "https://drive.example.com/draft-2",
        lastSubmittedAt: "2026-06-16",
      },
    ],
    ...overrides,
  };
}
