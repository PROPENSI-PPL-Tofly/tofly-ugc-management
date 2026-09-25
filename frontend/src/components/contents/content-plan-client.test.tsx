import {
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

vi.mock("@/lib/creators", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("@/lib/creators")>();

    return {
        ...actual,
        fetchCreatorDetail: vi.fn(),
    };
});

vi.mock("@/components/contents/add-content-modal", () => ({
    AddContentModal: ({
                          creatorId,
                          evergreenCount,
                          quota,
                          contractStart,
                          contractEnd,
                          onClose,
                          onSaved,
                      }: {
        creatorId: string;
        evergreenCount: number;
        quota: number;
        contractStart: string;
        contractEnd: string;
        onClose: () => void;
        onSaved: () => void;
    }) => (
        <div role="dialog" aria-label="Tambah Konten">
            <span data-testid="modal-creator-id">
                {creatorId}
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
                "Rangga Pratama · 0/6 konten",
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

        expect(
            screen.getByText("Dijadwalkan"),
        ).toBeInTheDocument();

        expect(
            screen.getByText("link_submitted"),
        ).toBeInTheDocument();
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
            "Content Plan gagal dimuat. Coba lagi.",
        );
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

    it("opens Add Content with the current creator and contract values", async () => {
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
            screen.getByTestId("modal-creator-id"),
        ).toHaveTextContent("creator-1");

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
                "Creator Dua · 0/6 konten",
            ),
        ).toBeInTheDocument();

        expect(
            mockedFetchCreatorDetail,
        ).toHaveBeenCalledWith("creator-2");
    });
});