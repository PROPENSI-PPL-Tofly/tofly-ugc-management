import { render, screen } from "@testing-library/react";
import ContentPlanPage from "./page";

vi.mock("@/components/contents/content-plan-client", () => ({
    ContentPlanClient: ({ creatorId, page }: { creatorId: string; page: number }) => (
        <div data-testid="content-plan-client">
            Content Plan Client — {creatorId} — halaman {page}
        </div>
    ),
}));

vi.mock("next/navigation", () => ({
    usePathname: () => "/admin/creators",
    useRouter: () => ({
        replace: vi.fn(),
        refresh: vi.fn(),
    }),
}));

async function renderPage(
    id = "creator-rangga",
    query: Record<string, string | string[] | undefined> = {},
) {
    render(
        await ContentPlanPage({
            params: Promise.resolve({ id }),
            searchParams: Promise.resolve(query),
        }),
    );
}

describe("Creator content plan page", () => {
    it("renders the Content Plan heading and description", async () => {
        await renderPage();

        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "Content Plan",
            }),
        ).toBeInTheDocument();

        expect(
            screen.getByText("Kelola jadwal konten creator"),
        ).toBeInTheDocument();
    });

    it("passes the creator id to the Content Plan client", async () => {
        await renderPage("creator-123");

        expect(
            screen.getByTestId("content-plan-client"),
        ).toHaveTextContent("Content Plan Client — creator-123");
    });

    it("passes the page number from the URL, the first page by default", async () => {
        await renderPage("creator-rangga", { page: "2" });
        expect(screen.getByTestId("content-plan-client")).toHaveTextContent("halaman 2");
    });

    it("starts on the first page when the URL page is not a number", async () => {
        await renderPage("creator-rangga", { page: "abc" });
        expect(screen.getByTestId("content-plan-client")).toHaveTextContent("halaman 1");
    });
});
