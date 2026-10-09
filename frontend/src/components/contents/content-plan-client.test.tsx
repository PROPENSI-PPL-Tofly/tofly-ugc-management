import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { ContentPlanClient } from "./content-plan-client";
import {
    fetchCreatorDetail,
    type CreatorDetail,
} from "@/lib/creators";
import type { ContentDetail } from "@/lib/content-detail";

vi.mock("next/link", async (importOriginal) => {
    const actual = await importOriginal<typeof import("next/link")>();
    return { ...actual, useLinkStatus: () => ({ pending: false }) };
});

vi.mock("@/lib/creators", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("@/lib/creators")>();

    return {
        ...actual,
        fetchCreatorDetail: vi.fn(),
    };
});

const { fetchContentDetail, approveSubmission } = vi.hoisted(() => ({
    fetchContentDetail: vi.fn(),
    approveSubmission: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/content-detail", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/content-detail")>()),
    fetchContentDetail: (id: string, role: "admin" | "creator") =>
        fetchContentDetail(id, role),
}));

vi.mock("@/lib/draft-review-actions", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/draft-review-actions")>()),
    approveSubmission: (id: string) => approveSubmission(id),
}));

vi.mock("@/components/contents/add-content-modal", () => ({
    AddContentModal: ({
                          contractId,
                          evergreenCount,
                          quota,
                          contractStart,
                          contractEnd,
                          onClose,
                          onSaved,
                      }: {
        contractId: string;
        evergreenCount: number;
        quota: number;
        contractStart: string;
        contractEnd: string;
        onClose: () => void;
        onSaved: () => void;
    }) => (
        <div role="dialog" aria-label="Tambah Konten">
            <span data-testid="modal-contract-id">
                {contractId}
            </span>

            <span data-testid="modal-evergreen-count">
                {evergreenCount}
            </span>

            <span data-testid="modal-quota">
                {quota}
            </span>

            <span data-testid="modal-contract-start">
                {contractStart}
            </span>

            <span data-testid="modal-contract-end">
                {contractEnd}
            </span>

            <button
                onClick={() => {
                    onSaved();
                    onClose();
                }}
            >
                Simulate Save
            </button>

            <button onClick={onClose}>
                Close Modal
            </button>
        </div>
    ),
}));

function detail(
    overrides: Partial<CreatorDetail> = {},
): CreatorDetail {
    return {
        id: "creator-1",
        name: "Rangga Pratama",
        email: "rangga@example.com",
        socials: {},
        accessRevokeDate: null,
        phoneNumber: "081234567001",
        contract: {
            status: "active",
            startDate: "2026-06-10",
            endDate: "2026-12-07",
            daysRemaining: 80,
            periodNumber: 1,
            contentQuota: 6,
            type: "regular",
        },
        progress: {
            submitted: 0,
            total: 6,
            percent: 0,
        },
        performance: {
            onTimeRate: null,
            avgRevisions: 0,
            productivity: "good",
            productivityLabel: "Baik",
        },
        contractHistory: [
            {
                id: "contract-1",
                periodNumber: 1,
                startDate: "2026-06-10",
                endDate: "2026-12-07",
                daysBetween: 180,
                contentQuota: 6,
                type: "regular",
                completed: 0,
                total: 6,
                isCurrent: true,
            },
        ],
        contents: [],
        drafts: [],
        ...overrides,
    };
}

const mockedFetchCreatorDetail =
    vi.mocked(fetchCreatorDetail);

describe("ContentPlanClient", () => {
    beforeEach(() => {
        mockedFetchCreatorDetail.mockReset();
    });

    it("shows a loading state before the detail response arrives", () => {
        mockedFetchCreatorDetail.mockReturnValue(
            new Promise(() => {}),
        );

        render(
            <ContentPlanClient creatorId="creator-1" />,
        );

        expect(
            screen.getByText("Memuat jadwal konten..."),
        ).toBeInTheDocument();
    });

    it("renders the empty Content Plan when there are no contents", async () => {
        mockedFetchCreatorDetail.mockResolvedValue(
            detail(),
        );

        render(
            <ContentPlanClient creatorId="creator-1" />,
        );

        expect(
            await screen.findByText(
                "Belum ada konten pada periode kontrak ini.",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "Rangga Pratama · Evergreen 0/6 · 6 slot belum teralokasi",
            ),
        ).toBeInTheDocument();
    });

    it("renders the content table with type, deadline and status", async () => {
        mockedFetchCreatorDetail.mockResolvedValue(
            detail({
                contents: [
                    {
                        id: "content-1",
                        name: "Evg_1_Rangga_Pratama_2026-09-30",
                        type: "evergreen",
                        deadline: "2026-09-30",
                        status: "scheduled",
                        outcome: "open",
                        videoLink: null,
                    },
                    {
                        id: "content-2",
                        name: "Campaign Review",
                        type: "specific",
                        deadline: "2026-10-05",
                        status: "link_submitted",
                        outcome: "on_time",
                        videoLink:
                            "https://example.com/video",
                    },
                ],
            }),
        );

        render(
            <ContentPlanClient creatorId="creator-1" />,
        );

        expect(
            await screen.findByText(
                "Evg_1_Rangga_Pratama_2026-09-30",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText("Campaign Review"),
        ).toBeInTheDocument();

        expect(
            screen.getAllByText("Evergreen").length,
        ).toBeGreaterThan(0);

        expect(
            screen.getByText("Specific"),
        ).toBeInTheDocument();

        // Statuses read the same here as everywhere else, never as their raw codes.
        expect(
            screen.getByText("Scheduled"),
        ).toBeInTheDocument();

        expect(
            screen.getByText("Content Link Submitted"),
        ).toBeInTheDocument();

        expect(
            screen.queryByText("link_submitted"),
        ).not.toBeInTheDocument();
    });

    it("shows an error when loading the creator fails", async () => {
        mockedFetchCreatorDetail.mockRejectedValue(
            new Error("backend unavailable"),
        );

        render(
            <ContentPlanClient creatorId="creator-1" />,
        );

        expect(
            await screen.findByRole("alert"),
        ).toHaveTextContent(
            "Content Plan gagal dimuat.",
        );
    });

    it("loads the plan again from Muat ulang after a failure", async () => {
        mockedFetchCreatorDetail
            .mockRejectedValueOnce(new Error("backend unavailable"))
            .mockResolvedValueOnce(detail());

        render(<ContentPlanClient creatorId="creator-1" />);

        fireEvent.click(await screen.findByRole("button", { name: "Muat ulang" }));

        expect(
            await screen.findByText("Belum ada konten pada periode kontrak ini."),
        ).toBeInTheDocument();
        expect(mockedFetchCreatorDetail).toHaveBeenCalledTimes(2);
    });

    describe("paging", () => {
        const many = Array.from({ length: 12 }, (_, index) => ({
            id: `content-${index + 1}`,
            name: `Konten ${index + 1}`,
            type: "evergreen" as const,
            deadline: `2026-10-${String(index + 1).padStart(2, "0")}`,
            status: "scheduled" as const,
            outcome: "open" as const,
            videoLink: null,
        }));

        it("shows ten contents per page with a way to the next page", async () => {
            mockedFetchCreatorDetail.mockResolvedValue(detail({ contents: many }));

            render(<ContentPlanClient creatorId="creator-1" />);

            expect(await screen.findByText("Konten 10")).toBeInTheDocument();
            expect(screen.queryByText("Konten 11")).toBeNull();
            expect(screen.getByText("Menampilkan 1–10 dari 12 konten")).toBeInTheDocument();
            expect(screen.getByRole("link", { name: "Berikutnya" })).toHaveAttribute(
                "href",
                "/admin/creators/creator-1/content-plan?page=2",
            );
        });

        it("shows the page the URL asks for", async () => {
            mockedFetchCreatorDetail.mockResolvedValue(detail({ contents: many }));

            render(<ContentPlanClient creatorId="creator-1" page={2} />);

            expect(await screen.findByText("Konten 11")).toBeInTheDocument();
            expect(screen.queryByText("Konten 1")).toBeNull();
            expect(screen.getByText("Halaman 2 dari 2")).toBeInTheDocument();
        });

        it("falls back to the last page when the URL asks for one past the end", async () => {
            mockedFetchCreatorDetail.mockResolvedValue(detail({ contents: many }));

            render(<ContentPlanClient creatorId="creator-1" page={9} />);

            expect(await screen.findByText("Konten 12")).toBeInTheDocument();
            expect(screen.getByText("Halaman 2 dari 2")).toBeInTheDocument();
        });

        it("shows no paging controls when everything fits on one page", async () => {
            mockedFetchCreatorDetail.mockResolvedValue(detail({ contents: many.slice(0, 3) }));

            render(<ContentPlanClient creatorId="creator-1" />);

            expect(await screen.findByText("Konten 3")).toBeInTheDocument();
            expect(screen.queryByRole("link", { name: "Berikutnya" })).toBeNull();
        });
    });

    it("shows each status beside a dot coloured by the workflow", async () => {
        mockedFetchCreatorDetail.mockResolvedValue(
            detail({
                contents: [
                    {
                        id: "content-1",
                        name: "Perlu revisi",
                        type: "evergreen",
                        deadline: "2026-09-30",
                        status: "draft_revision",
                        outcome: "open",
                        videoLink: null,
                    },
                ],
            }),
        );

        render(<ContentPlanClient creatorId="creator-1" />);

        const label = await screen.findByText("Draft Perlu Revisi");
        expect(label.querySelector(".bg-amber")).not.toBeNull();
    });

    it("shows the no-active-contract state", async () => {
        mockedFetchCreatorDetail.mockResolvedValue(
            detail({
                contractHistory: [
                    {
                        id: "contract-1",
                        periodNumber: 1,
                        startDate: "2026-06-10",
                        endDate: "2026-12-07",
                        daysBetween: 180,
                        contentQuota: 6,
                        type: "regular",
                        completed: 0,
                        total: 6,
                        isCurrent: false,
                    },
                ],
            }),
        );

        render(
            <ContentPlanClient creatorId="creator-1" />,
        );

        expect(
            await screen.findByText(
                "Creator ini belum memiliki kontrak aktif.",
            ),
        ).toBeInTheDocument();
    });

    it("opens Add Content with the current contract id and values", async () => {
        mockedFetchCreatorDetail.mockResolvedValue(
            detail({
                contents: [
                    {
                        id: "content-1",
                        name: "Existing Evergreen",
                        type: "evergreen",
                        deadline: "2026-09-30",
                        status: "scheduled",
                        outcome: "open",
                        videoLink: null,
                    },
                    {
                        id: "content-2",
                        name: "Existing Specific",
                        type: "specific",
                        deadline: "2026-10-05",
                        status: "link_submitted",
                        outcome: "on_time",
                        videoLink: null,
                    },
                ],
            }),
        );

        render(
            <ContentPlanClient creatorId="creator-1" />,
        );

        await screen.findByText("Existing Evergreen");

        fireEvent.click(
            screen.getByRole("button", {
                name: "+ Tambah Konten",
            }),
        );

        expect(
            screen.getByRole("dialog", {
                name: "Tambah Konten",
            }),
        ).toBeInTheDocument();

        expect(
            screen.getByTestId("modal-contract-id"),
        ).toHaveTextContent("contract-1");

        expect(
            screen.getByTestId("modal-evergreen-count"),
        ).toHaveTextContent("1");

        expect(
            screen.getByTestId("modal-quota"),
        ).toHaveTextContent("6");

        expect(
            screen.getByTestId("modal-contract-start"),
        ).toHaveTextContent("2026-06-10");

        expect(
            screen.getByTestId("modal-contract-end"),
        ).toHaveTextContent("2026-12-07");
    });

    it("counts only Evergreen content against the quota in the header", async () => {
        mockedFetchCreatorDetail.mockResolvedValue(
            detail({
                contents: [
                    {
                        id: "content-1",
                        name: "Evg_1_Rangga Pratama_30092026",
                        type: "evergreen",
                        deadline: "2026-09-30",
                        status: "scheduled",
                        outcome: "open",
                        videoLink: null,
                    },
                    {
                        id: "content-2",
                        name: "Promo 10.10",
                        type: "specific",
                        deadline: "2026-10-05",
                        status: "scheduled",
                        outcome: "open",
                        videoLink: null,
                    },
                ],
            }),
        );

        render(
            <ContentPlanClient creatorId="creator-1" />,
        );

        expect(
            await screen.findByText(
                "Rangga Pratama · Evergreen 1/6 · 5 slot belum teralokasi",
            ),
        ).toBeInTheDocument();
    });

    it("closes the modal when its close callback runs", async () => {
        mockedFetchCreatorDetail.mockResolvedValue(
            detail(),
        );

        render(
            <ContentPlanClient creatorId="creator-1" />,
        );

        await screen.findByText(
            "Belum ada konten pada periode kontrak ini.",
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: "+ Tambah Konten",
            }),
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: "Close Modal",
            }),
        );

        expect(
            screen.queryByRole("dialog", {
                name: "Tambah Konten",
            }),
        ).toBeNull();
    });

    it("shows a success toast and refreshes the table after save", async () => {
        mockedFetchCreatorDetail
            .mockResolvedValueOnce(
                detail({
                    contents: [
                        {
                            id: "content-1",
                            name: "Existing Content",
                            type: "specific",
                            deadline: "2026-09-30",
                            status: "link_submitted",
                            outcome: "on_time",
                            videoLink: null,
                        },
                    ],
                }),
            )
            .mockResolvedValueOnce(
                detail({
                    contents: [
                        {
                            id: "content-1",
                            name: "Existing Content",
                            type: "specific",
                            deadline: "2026-09-30",
                            status: "link_submitted",
                            outcome: "on_time",
                            videoLink: null,
                        },
                        {
                            id: "content-2",
                            name: "New Content",
                            type: "evergreen",
                            deadline: "2026-10-05",
                            status: "scheduled",
                            outcome: "open",
                            videoLink: null,
                        },
                    ],
                }),
            );

        render(
            <ContentPlanClient creatorId="creator-1" />,
        );

        await screen.findByText("Existing Content");

        fireEvent.click(
            screen.getByRole("button", {
                name: "+ Tambah Konten",
            }),
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: "Simulate Save",
            }),
        );

        expect(
            await screen.findByText(
                "Konten berhasil ditambahkan.",
            ),
        ).toBeInTheDocument();

        expect(
            await screen.findByText("New Content"),
        ).toBeInTheDocument();

        expect(
            mockedFetchCreatorDetail,
        ).toHaveBeenCalledTimes(2);

        expect(
            screen.queryByRole("dialog", {
                name: "Tambah Konten",
            }),
        ).toBeNull();
    });

    it("shows the success toast separately from the content table", async () => {
        mockedFetchCreatorDetail.mockResolvedValue(
            detail(),
        );

        render(
            <ContentPlanClient creatorId="creator-1" />,
        );

        await screen.findByText(
            "Belum ada konten pada periode kontrak ini.",
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: "+ Tambah Konten",
            }),
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: "Simulate Save",
            }),
        );

        expect(
            await screen.findByRole("status"),
        ).toHaveTextContent(
            "Konten berhasil ditambahkan.",
        );
    });

    it("reloads the creator detail when the creator id changes", async () => {
        mockedFetchCreatorDetail.mockResolvedValue(
            detail(),
        );

        const { rerender } = render(
            <ContentPlanClient creatorId="creator-1" />,
        );

        await screen.findByText(
            "Belum ada konten pada periode kontrak ini.",
        );

        mockedFetchCreatorDetail.mockResolvedValue(
            detail({
                id: "creator-2",
                name: "Creator Dua",
            }),
        );

        rerender(
            <ContentPlanClient creatorId="creator-2" />,
        );

        expect(
            await screen.findByText(
                "Creator Dua · Evergreen 0/6 · 6 slot belum teralokasi",
            ),
        ).toBeInTheDocument();

        expect(
            mockedFetchCreatorDetail,
        ).toHaveBeenCalledWith("creator-2");
    });

    it.each([
        ["loads", (late: Promise<CreatorDetail>) => late],
        ["fails", (late: Promise<CreatorDetail>) => late.then(() => Promise.reject(new Error("late")))],
    ])("ignores a previous creator whose detail %s after the id changed", async (_, settle) => {
        let resolveOld!: (value: CreatorDetail) => void;
        const old = new Promise<CreatorDetail>((resolve) => (resolveOld = resolve));
        mockedFetchCreatorDetail
            .mockReturnValueOnce(settle(old))
            .mockResolvedValueOnce(detail({ id: "creator-2", name: "Creator Dua" }));

        const { rerender } = render(<ContentPlanClient creatorId="creator-1" />);
        rerender(<ContentPlanClient creatorId="creator-2" />);
        await screen.findByText(/Creator Dua/);

        resolveOld(detail({ name: "Creator Lama" }));
        await act(async () => {
            await old;
        });

        expect(screen.queryByText(/Creator Lama/)).toBeNull();
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByText(/Creator Dua/)).toBeInTheDocument();
    });

    describe("success toast", () => {
        beforeEach(() => {
            vi.useFakeTimers({ shouldAdvanceTime: true });
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        async function saveContent() {
            fireEvent.click(
                await screen.findByRole("button", { name: "+ Tambah Konten" }),
            );
            fireEvent.click(
                screen.getByRole("button", { name: "Simulate Save" }),
            );
        }

        it("stays on screen while the table reloads after a save", async () => {
            mockedFetchCreatorDetail
                .mockResolvedValueOnce(detail())
                .mockReturnValueOnce(new Promise(() => undefined));

            render(<ContentPlanClient creatorId="creator-1" />);
            await saveContent();

            expect(
                await screen.findByText("Memuat jadwal konten..."),
            ).toBeInTheDocument();
            expect(screen.getByRole("status")).toHaveTextContent(
                "Konten berhasil ditambahkan.",
            );
        });

        it("closes itself four seconds after the save", async () => {
            mockedFetchCreatorDetail.mockResolvedValue(detail());

            render(<ContentPlanClient creatorId="creator-1" />);
            await saveContent();
            await screen.findByRole("status");

            act(() => vi.advanceTimersByTime(4000));

            expect(screen.queryByRole("status")).toBeNull();
        });

        it("closes from its close button", async () => {
            mockedFetchCreatorDetail.mockResolvedValue(detail());

            render(<ContentPlanClient creatorId="creator-1" />);
            await saveContent();

            fireEvent.click(
                await screen.findByRole("button", { name: "Tutup notifikasi" }),
            );

            expect(screen.queryByRole("status")).toBeNull();
        });

        it("restarts the countdown when another content is saved", async () => {
            mockedFetchCreatorDetail.mockResolvedValue(detail());

            render(<ContentPlanClient creatorId="creator-1" />);
            await saveContent();
            await screen.findByRole("status");

            act(() => vi.advanceTimersByTime(3000));
            await saveContent();
            act(() => vi.advanceTimersByTime(3000));

            expect(screen.getByRole("status")).toHaveTextContent(
                "Konten berhasil ditambahkan.",
            );

            act(() => vi.advanceTimersByTime(1000));

            expect(screen.queryByRole("status")).toBeNull();
        });
    });
});

describe("ContentPlanClient content detail panel", () => {
    beforeEach(() => {
        vi.mocked(fetchCreatorDetail).mockReset();
        fetchContentDetail.mockReset();
    });

    it("opens the content detail panel of a content row, as the admin", async () => {
        vi.mocked(fetchCreatorDetail).mockResolvedValue(
            detail({
                contents: [
                    {
                        id: "content-1",
                        name: "Evg_Rangga_30092026",
                        type: "evergreen",
                        deadline: "2026-09-30",
                        status: "scheduled",
                        outcome: "open",
                        videoLink: null,
                    },
                ],
            }),
        );
        fetchContentDetail.mockResolvedValue({
            id: "content-1",
            name: "Evg_Rangga_30092026",
            type: "evergreen",
            brief: "",
            deadline: "2026-09-30",
            status: "scheduled",
            creatorName: "Rangga Pratama",
            tags: { overdue: false, lateSubmission: false, approvalBypassed: false },
            waitingOn: "creator",
            latestSubmissionId: null,
            creatorActions: ["submit_draft"],
            events: [],
        } satisfies ContentDetail);

        render(<ContentPlanClient creatorId="creator-1" />);

        fireEvent.click(await screen.findByRole("button", { name: "Detail" }));

        expect(await screen.findByRole("dialog")).toBeInTheDocument();
        expect(fetchContentDetail).toHaveBeenCalledWith("content-1", "admin");
    });

    // Review feedback on #73: a decision from this surface must close the panel and
    // reload the schedule, or the row keeps its old status until a full page reload
    // and a second Approve hits the backend's 409.
    it("closes the panel and reloads the schedule once a draft is approved", async () => {
        vi.mocked(fetchCreatorDetail).mockResolvedValue(
            detail({
                contents: [
                    {
                        id: "content-1",
                        name: "Evg_Rangga_30092026",
                        type: "evergreen",
                        deadline: "2026-09-30",
                        status: "draft_review",
                        outcome: "open",
                        videoLink: null,
                    },
                ],
            }),
        );
        fetchContentDetail.mockResolvedValue({
            id: "content-1",
            name: "Evg_Rangga_30092026",
            type: "evergreen",
            brief: "",
            deadline: "2026-09-30",
            status: "draft_review",
            creatorName: "Rangga Pratama",
            tags: { overdue: false, lateSubmission: false, approvalBypassed: false },
            waitingOn: "admin",
            latestSubmissionId: "submission-1",
            creatorActions: [],
            events: [],
        } satisfies ContentDetail);
        approveSubmission.mockResolvedValue(undefined);

        render(<ContentPlanClient creatorId="creator-1" />);

        fireEvent.click(await screen.findByRole("button", { name: "Detail" }));
        fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

        await waitFor(() => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
            expect(approveSubmission).toHaveBeenCalledWith("submission-1");
            expect(vi.mocked(fetchCreatorDetail)).toHaveBeenCalledTimes(2);
        });
    });
});
