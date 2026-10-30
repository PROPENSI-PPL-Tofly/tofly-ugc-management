import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PanelActionFacts } from "@/lib/panel-actions";
import type { Role } from "@/lib/session";
import { useVideoLinksModal } from "./use-video-links-modal";

const { refresh, saveVideoLinks } = vi.hoisted(() => ({
  refresh: vi.fn(),
  saveVideoLinks: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

vi.mock("@/lib/video-links-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/video-links-api")>()),
  saveVideoLinks,
}));

const INSTAGRAM_REEL = "https://www.instagram.com/reel/C8abc12345/";
const OTHER_REEL = "https://www.instagram.com/p/DAbC123xyz/";
const TIKTOK_VIDEO = "https://www.tiktok.com/@tofly/video/7400000000000000000";

const DETAIL: PanelActionFacts = {
  id: "content-1",
  name: "Promo Lebaran",
  brief: "",
  events: [],
  deadline: "2026-10-05",
  waitingOn: null,
  latestSubmissionId: null,
  creatorActions: [],
  status: "link_submitted",
  links: [{ platform: "instagram", url: INSTAGRAM_REEL }],
};

function Harness({ role, detail = DETAIL }: Readonly<{ role: Role; detail?: PanelActionFacts }>) {
  const { openLinks, linksModal } = useVideoLinksModal(role);
  return (
    <>
      <button type="button" onClick={() => openLinks(detail)}>
        buka
      </button>
      {linksModal}
    </>
  );
}

function open(role: Role, detail?: PanelActionFacts) {
  render(<Harness role={role} detail={detail} />);
  fireEvent.click(screen.getByRole("button", { name: "buka" }));
}

async function sendAndConfirm() {
  fireEvent.click(screen.getByRole("button", { name: "Kirim Link" }));
  const question = await screen.findByRole("alertdialog");
  fireEvent.click(within(question).getByRole("button", { name: "Ya, Kirim" }));
}

describe("useVideoLinksModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows nothing until asked", () => {
    render(<Harness role="creator" />);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lets a creator add the other platform, with the sent link filled in", () => {
    open("creator");

    expect(screen.getByLabelText("Link Instagram")).toHaveValue(INSTAGRAM_REEL);
    expect(screen.getByLabelText("Link TikTok")).toHaveValue("");
  });

  it("gives an admin only the sent links, since adding one is the creator's", () => {
    open("admin");

    expect(screen.getByLabelText("Link Instagram")).toHaveValue(INSTAGRAM_REEL);
    expect(screen.queryByLabelText("Link TikTok")).toBeNull();
  });

  it("opens empty fields for an answer that lists no links", () => {
    open("creator", { ...DETAIL, links: undefined });

    expect(screen.getByLabelText("Link Instagram")).toHaveValue("");
  });

  it("confirms with a toast, refreshes the page and closes after a save", async () => {
    saveVideoLinks.mockResolvedValue({ ok: true });
    open("admin");
    fireEvent.change(screen.getByLabelText("Link Instagram"), { target: { value: OTHER_REEL } });

    await sendAndConfirm();

    expect(await screen.findByRole("status")).toHaveTextContent("Link video diperbarui.");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("refreshes the page behind the modal when only part of a save went through", async () => {
    saveVideoLinks.mockResolvedValue({
      ok: false,
      message: "Invoice terkunci",
      saved: [{ platform: "tiktok", url: TIKTOK_VIDEO }],
    });
    open("creator");
    fireEvent.change(screen.getByLabelText("Link TikTok"), { target: { value: TIKTOK_VIDEO } });

    await sendAndConfirm();

    expect(await screen.findByRole("alert")).toHaveTextContent("Invoice terkunci");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes without a toast when cancelled", () => {
    open("creator");

    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });
});
