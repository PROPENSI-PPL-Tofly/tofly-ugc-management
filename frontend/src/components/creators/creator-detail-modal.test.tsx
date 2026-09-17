import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreatorDetailModal } from "./creator-detail-modal";
import { creatorDetail } from "./creator.fixture";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

function open(extra: Partial<Parameters<typeof CreatorDetailModal>[0]> = {}) {
  render(
    <CreatorDetailModal creatorId="creator-rangga" name="Rangga Pratama" onClose={vi.fn()} {...extra} />,
  );
}

describe("CreatorDetailModal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    push.mockClear();
  });

  it("says it is loading before the answer arrives", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));

    open();

    expect(screen.getByText(/memuat/i)).toBeInTheDocument();
  });

  it("shows the creator's contract, performance and history once loaded", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(creatorDetail())));

    open();

    expect(await screen.findByText("rangga@example.com")).toBeInTheDocument();
    expect(screen.getByText("081234567001")).toBeInTheDocument();
    expect(screen.getByText(/Periode 1 \(berjalan\)/)).toBeInTheDocument();
    expect(screen.getAllByText("Evergreen - Tips Belajar Cepat")).toHaveLength(2);
    expect(screen.getAllByText("Tepat waktu")).toHaveLength(2);
    expect(screen.getByText(/1x revisi/)).toBeInTheDocument();
  });

  it("explains itself when the request fails instead of showing an empty dialog", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 500 }));

    open();

    expect(await screen.findByText(/gagal memuat/i)).toBeInTheDocument();
  });

  it("shows a dash for contact details that are not on file", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(creatorDetail({ phoneNumber: null, socials: {} }))),
    );

    open();

    expect(await screen.findByText("rangga@example.com")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it("lists a TikTok handle when there is one", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(creatorDetail({ socials: { tiktok: "ranggacreates" } }))),
    );

    open();

    expect(await screen.findByText("@ranggacreates")).toBeInTheDocument();
  });

  it("marks only the running period in the contract history", async () => {
    const detail = creatorDetail();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify(
          creatorDetail({
            contractHistory: [
              {
                ...detail.contractHistory[0],
                id: "contract-0",
                periodNumber: 1,
                startDate: "2025-06-01",
                endDate: "2025-12-01",
                isCurrent: false,
              },
              { ...detail.contractHistory[0], id: "contract-1", periodNumber: 2, isCurrent: true },
            ],
          }),
        ),
      ),
    );

    open();

    expect(await screen.findByText(/Periode 2 \(berjalan\)/)).toBeInTheDocument();
    expect(screen.getByText(/^Periode 1:/)).toBeInTheDocument();
  });

  it("drops a late answer once the dialog has been closed", async () => {
    let resolve: (value: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<Response>((r) => (resolve = r)),
    );

    const { unmount } = render(
      <CreatorDetailModal creatorId="creator-rangga" name="Rangga Pratama" onClose={vi.fn()} />,
    );
    unmount();
    resolve(new Response(JSON.stringify(creatorDetail())));
    await Promise.resolve();

    expect(screen.queryByText("rangga@example.com")).not.toBeInTheDocument();
  });

  it("drops a late failure once the dialog has been closed", async () => {
    let reject: (reason: Error) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<Response>((_, r) => (reject = r)),
    );

    const { unmount } = render(
      <CreatorDetailModal creatorId="creator-rangga" name="Rangga Pratama" onClose={vi.fn()} />,
    );
    unmount();
    reject(new Error("too late"));
    await Promise.resolve();

    expect(screen.queryByText(/gagal memuat/i)).not.toBeInTheDocument();
  });

  it("says so when a creator has no content yet", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(creatorDetail({ contents: [], drafts: [] }))),
    );

    open();

    expect(await screen.findByText(/belum ada konten/i)).toBeInTheDocument();
    expect(screen.getByText(/belum ada draft/i)).toBeInTheDocument();
  });

  it("goes on to the content plan from the dialog", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(creatorDetail())));

    open();
    await userEvent.click(await screen.findByRole("button", { name: /lihat content plan/i }));

    expect(push).toHaveBeenCalledWith("/admin/creators/creator-rangga/content-plan");
  });

  it("closes without loading anything else", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(creatorDetail())));
    const onClose = vi.fn();

    open({ onClose });
    await userEvent.click(await screen.findByRole("button", { name: "Tutup" }));

    expect(onClose).toHaveBeenCalled();
  });
});
