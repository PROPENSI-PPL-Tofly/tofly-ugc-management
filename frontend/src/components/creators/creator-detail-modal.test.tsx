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
    expect(screen.getAllByText(/Periode 1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Evergreen - Tips Belajar Cepat")).toHaveLength(2);
    expect(screen.getByText("Tepat waktu")).toBeInTheDocument();
    expect(screen.getByText(/1x revisi/)).toBeInTheDocument();
  });

  it("explains itself when the request fails instead of showing an empty dialog", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 500 }));

    open();

    expect(await screen.findByText(/gagal memuat/i)).toBeInTheDocument();
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
