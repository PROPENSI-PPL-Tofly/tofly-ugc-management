// What the backend really answers on the PBI-13 routes, recorded from a running backend
// (integration of #107-#110 at 42fde74, seeded database, 2026-10-20) and kept verbatim. The
// frontend's own fixtures describe what each page expects; these pin what it is sent, so a
// field or route the two sides name differently fails a test instead of the page (consumer
// contract). Re-record them when a backend answer changes. Test data only.

/** GET /me/invoices, as Adit (period 2 paid with a proof and comments, period 1 running). */
export const ME_INVOICES: unknown = {
  items: [
    {
      acknowledgedAt: "2026-10-20T05:23:05.060Z",
      paidAt: "2026-10-20T05:25:21.020Z",
      creatorId: "1157c832-53b3-4d0a-8259-6b6e14ceca1f",
      creatorName: "Adit Prakoso",
      adjustments: [],
      snapshot: {
        total: 100000,
        floored: false,
        formula: {
          specificBonus: 100000,
          maxPenaltyDays: 3,
          performanceBonus: {
            tiktok: {
              tiers: [
                {
                  bonus: 150000,
                  threshold: 10000,
                },
              ],
              metric: "views",
            },
            instagram: {
              tiers: [
                {
                  bonus: 150000,
                  threshold: 10000,
                },
              ],
              metric: "views",
            },
          },
          latePenaltyPerDay: 50000,
        },
        penalty: {
          key: "penalty",
          lines: [
            {
              basis: {
                perDay: 50000,
                daysLate: 11,
                handedIn: "yes",
                chargedDays: 3,
              },
              amount: 150000,
              contentId: "7f2d2468-dffc-4ed6-bef4-befdfe8ff43e",
              contentName: "Kembali lagi",
            },
            {
              basis: {
                perDay: 50000,
                daysLate: 8,
                handedIn: "yes",
                chargedDays: 3,
              },
              amount: 150000,
              contentId: "051ea8cc-a35e-40a8-bf31-45e59f5772aa",
              contentName: "Kirim paket elektronik",
            },
          ],
          amount: 300000,
          status: "calculated",
        },
        rawTotal: 100000,
        fixedRate: {
          key: "fixedRate",
          lines: [
            {
              basis: {
                quota: 6,
                delivered: 2,
              },
              amount: 400000,
              contentId: "37b446a2-0b19-4c18-9d65-b0f1b7078f97",
              contentName: "Kontrak",
            },
          ],
          amount: 400000,
          status: "calculated",
        },
        adjustments: [],
        finalizedAt: "2026-10-20T05:22:49.410Z",
        performanceBonus: {
          key: "performanceBonus",
          lines: [],
          amount: 0,
          status: "calculated",
        },
        additionalContent: {
          key: "additionalContent",
          lines: [],
          amount: 0,
          status: "calculated",
        },
        performanceBonusPending: true,
      },
      contract: {
        id: "37b446a2-0b19-4c18-9d65-b0f1b7078f97",
        status: "expired",
        startDate: "2026-03-04",
        endDate: "2026-08-31",
        lastDay: "2026-08-31",
        period: 2,
      },
      components: {
        fixedRate: {
          key: "fixedRate",
          lines: [
            {
              basis: {
                quota: 6,
                delivered: 2,
              },
              amount: 400000,
              contentId: "37b446a2-0b19-4c18-9d65-b0f1b7078f97",
              contentName: "Kontrak",
            },
          ],
          amount: 400000,
          status: "calculated",
        },
        additionalContent: {
          key: "additionalContent",
          lines: [],
          amount: 0,
          status: "calculated",
        },
        performanceBonus: {
          key: "performanceBonus",
          lines: [],
          amount: 0,
          status: "calculated",
        },
        penalty: {
          key: "penalty",
          lines: [
            {
              basis: {
                perDay: 50000,
                daysLate: 11,
                handedIn: "yes",
                chargedDays: 3,
              },
              amount: 150000,
              contentId: "7f2d2468-dffc-4ed6-bef4-befdfe8ff43e",
              contentName: "Kembali lagi",
            },
            {
              basis: {
                perDay: 50000,
                daysLate: 8,
                handedIn: "yes",
                chargedDays: 3,
              },
              amount: 150000,
              contentId: "051ea8cc-a35e-40a8-bf31-45e59f5772aa",
              contentName: "Kirim paket elektronik",
            },
          ],
          amount: 300000,
          status: "calculated",
        },
      },
      rawTotal: 100000,
      total: 100000,
      floored: false,
      invoiceStatus: "paid",
      periodNumber: 2,
      formula: {
        specificBonus: 100000,
        maxPenaltyDays: 3,
        performanceBonus: {
          tiktok: {
            tiers: [
              {
                bonus: 150000,
                threshold: 10000,
              },
            ],
            metric: "views",
          },
          instagram: {
            tiers: [
              {
                bonus: 150000,
                threshold: 10000,
              },
            ],
            metric: "views",
          },
        },
        latePenaltyPerDay: 50000,
      },
      paymentProof: {
        fileName: "proof.pdf",
        url: "/api/me/invoices/37b446a2-0b19-4c18-9d65-b0f1b7078f97/payment-proof",
        uploadedAt: "2026-10-20T05:23:38.854Z",
      },
      comments: [
        {
          id: "e7a0ab11-6df4-4d17-a8d5-2b253b8133db",
          authorName: "Adit Prakoso",
          authorRole: "creator",
          text: "Sudah saya cek, terima kasih kak.",
          createdAt: "2026-10-20T05:23:21.110Z",
        },
        {
          id: "1bde3b8c-0178-4074-a688-39d09de68b0c",
          authorName: "Admin",
          authorRole: "admin",
          text: "Bukti transfer sudah diunggah ya.",
          createdAt: "2026-10-20T05:25:20.987Z",
        },
        {
          id: "8067c057-57de-472a-a793-1b9e482c2255",
          authorName: "Adit Prakoso",
          authorRole: "creator",
          text: "Sudah masuk, terima kasih!",
          createdAt: "2026-10-20T05:25:21.000Z",
        },
      ],
    },
    {
      acknowledgedAt: null,
      paidAt: null,
      creatorId: "1157c832-53b3-4d0a-8259-6b6e14ceca1f",
      creatorName: "Adit Prakoso",
      adjustments: [],
      snapshot: null,
      contract: {
        id: "07b169dd-5afb-4332-b244-07ef995c4833",
        status: "expired",
        startDate: "2025-08-26",
        endDate: "2026-02-22",
        lastDay: "2026-02-22",
        period: 1,
      },
      components: {
        fixedRate: {
          key: "fixedRate",
          amount: 400000,
          status: "calculated",
          lines: [
            {
              contentId: "07b169dd-5afb-4332-b244-07ef995c4833",
              contentName: "Kontrak",
              amount: 400000,
              basis: {
                delivered: 2,
                quota: 6,
              },
            },
          ],
        },
        additionalContent: {
          key: "additionalContent",
          amount: 0,
          status: "calculated",
          lines: [
            {
              contentId: "06deb8b2-2042-48a8-89d6-023a02667d72",
              contentName: "Tofly saat musim hujan",
              amount: 0,
              basis: {
                fee: 100000,
                late: "yes",
              },
            },
          ],
        },
        performanceBonus: {
          key: "performanceBonus",
          amount: null,
          status: "waiting_for_data",
          lines: [],
        },
        penalty: {
          key: "penalty",
          amount: 0,
          status: "calculated",
          lines: [],
        },
      },
      rawTotal: 400000,
      total: 400000,
      floored: false,
      invoiceStatus: "accruing",
      periodNumber: 1,
      formula: {
        latePenaltyPerDay: 50000,
        maxPenaltyDays: 3,
        specificBonus: 100000,
        performanceBonus: {
          instagram: {
            metric: "views",
            tiers: [
              {
                threshold: 10000,
                bonus: 150000,
              },
            ],
          },
          tiktok: {
            metric: "views",
            tiers: [
              {
                threshold: 10000,
                bonus: 150000,
              },
            ],
          },
        },
      },
      paymentProof: null,
      comments: [],
    },
  ],
};

/** POST /me/invoices/:contractId/comments, as Adit. */
export const CREATOR_POSTED_COMMENT: unknown = {
  id: "8067c057-57de-472a-a793-1b9e482c2255",
  authorName: "Adit Prakoso",
  authorRole: "creator",
  text: "Sudah masuk, terima kasih!",
  createdAt: "2026-10-20T05:25:21.000Z",
};

/** POST /me/invoices/:contractId/confirm-receipt, as Adit. */
export const CREATOR_CONFIRMED_RECEIPT: unknown = {
  invoiceStatus: "paid",
  paidAt: "2026-10-20T05:25:21.020Z",
};

/** GET /invoices/:contractId/comments, as an admin. */
export const ADMIN_THREAD: unknown = [
  {
    id: "e7a0ab11-6df4-4d17-a8d5-2b253b8133db",
    authorName: "Adit Prakoso",
    authorRole: "creator",
    text: "Sudah saya cek, terima kasih kak.",
    createdAt: "2026-10-20T05:23:21.110Z",
  },
  {
    id: "1bde3b8c-0178-4074-a688-39d09de68b0c",
    authorName: "Admin",
    authorRole: "admin",
    text: "Bukti transfer sudah diunggah ya.",
    createdAt: "2026-10-20T05:25:20.987Z",
  },
  {
    id: "8067c057-57de-472a-a793-1b9e482c2255",
    authorName: "Adit Prakoso",
    authorRole: "creator",
    text: "Sudah masuk, terima kasih!",
    createdAt: "2026-10-20T05:25:21.000Z",
  },
];

/** POST /invoices/:contractId/comments, as an admin. */
export const ADMIN_POSTED_COMMENT: unknown = {
  id: "1bde3b8c-0178-4074-a688-39d09de68b0c",
  authorName: "Admin",
  authorRole: "admin",
  text: "Bukti transfer sudah diunggah ya.",
  createdAt: "2026-10-20T05:25:20.987Z",
};

/** POST /invoices/:contractId/payment-proof (multipart), as an admin. */
export const ADMIN_UPLOADED_PROOF: unknown = {
  fileName: "proof.pdf",
  url: "/api/invoices/37b446a2-0b19-4c18-9d65-b0f1b7078f97/payment-proof",
  uploadedAt: "2026-10-20T05:23:38.854Z",
  invoiceStatus: "payment_uploaded",
};

/** GET /invoices?q=Adit, as an admin. */
export const ADMIN_LIST: unknown = {
  items: [
    {
      creatorId: "1157c832-53b3-4d0a-8259-6b6e14ceca1f",
      creatorName: "Adit Prakoso",
      adjustments: [],
      snapshot: null,
      contract: {
        id: "07b169dd-5afb-4332-b244-07ef995c4833",
        status: "expired",
        startDate: "2025-08-26",
        endDate: "2026-02-22",
        lastDay: "2026-02-22",
        period: 1,
      },
      components: {
        fixedRate: {
          key: "fixedRate",
          amount: 400000,
          status: "calculated",
          lines: [
            {
              contentId: "07b169dd-5afb-4332-b244-07ef995c4833",
              contentName: "Kontrak",
              amount: 400000,
              basis: {
                delivered: 2,
                quota: 6,
              },
            },
          ],
        },
        additionalContent: {
          key: "additionalContent",
          amount: 0,
          status: "calculated",
          lines: [
            {
              contentId: "06deb8b2-2042-48a8-89d6-023a02667d72",
              contentName: "Tofly saat musim hujan",
              amount: 0,
              basis: {
                fee: 100000,
                late: "yes",
              },
            },
          ],
        },
        performanceBonus: {
          key: "performanceBonus",
          amount: null,
          status: "waiting_for_data",
          lines: [],
        },
        penalty: {
          key: "penalty",
          amount: 0,
          status: "calculated",
          lines: [],
        },
      },
      rawTotal: 400000,
      total: 400000,
      floored: false,
      invoiceStatus: "accruing",
      paymentProof: null,
      acknowledgedAt: null,
      paidAt: null,
    },
    {
      creatorId: "1157c832-53b3-4d0a-8259-6b6e14ceca1f",
      creatorName: "Adit Prakoso",
      adjustments: [],
      snapshot: {
        total: 100000,
        floored: false,
        formula: {
          specificBonus: 100000,
          maxPenaltyDays: 3,
          performanceBonus: {
            tiktok: {
              tiers: [
                {
                  bonus: 150000,
                  threshold: 10000,
                },
              ],
              metric: "views",
            },
            instagram: {
              tiers: [
                {
                  bonus: 150000,
                  threshold: 10000,
                },
              ],
              metric: "views",
            },
          },
          latePenaltyPerDay: 50000,
        },
        penalty: {
          key: "penalty",
          lines: [
            {
              basis: {
                perDay: 50000,
                daysLate: 11,
                handedIn: "yes",
                chargedDays: 3,
              },
              amount: 150000,
              contentId: "7f2d2468-dffc-4ed6-bef4-befdfe8ff43e",
              contentName: "Kembali lagi",
            },
            {
              basis: {
                perDay: 50000,
                daysLate: 8,
                handedIn: "yes",
                chargedDays: 3,
              },
              amount: 150000,
              contentId: "051ea8cc-a35e-40a8-bf31-45e59f5772aa",
              contentName: "Kirim paket elektronik",
            },
          ],
          amount: 300000,
          status: "calculated",
        },
        rawTotal: 100000,
        fixedRate: {
          key: "fixedRate",
          lines: [
            {
              basis: {
                quota: 6,
                delivered: 2,
              },
              amount: 400000,
              contentId: "37b446a2-0b19-4c18-9d65-b0f1b7078f97",
              contentName: "Kontrak",
            },
          ],
          amount: 400000,
          status: "calculated",
        },
        adjustments: [],
        finalizedAt: "2026-10-20T05:22:49.410Z",
        performanceBonus: {
          key: "performanceBonus",
          lines: [],
          amount: 0,
          status: "calculated",
        },
        additionalContent: {
          key: "additionalContent",
          lines: [],
          amount: 0,
          status: "calculated",
        },
        performanceBonusPending: true,
      },
      contract: {
        id: "37b446a2-0b19-4c18-9d65-b0f1b7078f97",
        status: "expired",
        startDate: "2026-03-04",
        endDate: "2026-08-31",
        lastDay: "2026-08-31",
        period: 2,
      },
      components: {
        fixedRate: {
          key: "fixedRate",
          lines: [
            {
              basis: {
                quota: 6,
                delivered: 2,
              },
              amount: 400000,
              contentId: "37b446a2-0b19-4c18-9d65-b0f1b7078f97",
              contentName: "Kontrak",
            },
          ],
          amount: 400000,
          status: "calculated",
        },
        additionalContent: {
          key: "additionalContent",
          lines: [],
          amount: 0,
          status: "calculated",
        },
        performanceBonus: {
          key: "performanceBonus",
          lines: [],
          amount: 0,
          status: "calculated",
        },
        penalty: {
          key: "penalty",
          lines: [
            {
              basis: {
                perDay: 50000,
                daysLate: 11,
                handedIn: "yes",
                chargedDays: 3,
              },
              amount: 150000,
              contentId: "7f2d2468-dffc-4ed6-bef4-befdfe8ff43e",
              contentName: "Kembali lagi",
            },
            {
              basis: {
                perDay: 50000,
                daysLate: 8,
                handedIn: "yes",
                chargedDays: 3,
              },
              amount: 150000,
              contentId: "051ea8cc-a35e-40a8-bf31-45e59f5772aa",
              contentName: "Kirim paket elektronik",
            },
          ],
          amount: 300000,
          status: "calculated",
        },
      },
      rawTotal: 100000,
      total: 100000,
      floored: false,
      invoiceStatus: "paid",
      paymentProof: {
        fileName: "proof.pdf",
        url: "/api/invoices/37b446a2-0b19-4c18-9d65-b0f1b7078f97/payment-proof",
        uploadedAt: "2026-10-20T05:23:38.854Z",
      },
      acknowledgedAt: "2026-10-20T05:23:05.060Z",
      paidAt: "2026-10-20T05:25:21.020Z",
    },
  ],
  page: 1,
  pageSize: 10,
  total: 2,
  totalPages: 1,
  summary: {
    total: 500000,
    runningInvoices: 11,
    formulaSet: true,
  },
};
