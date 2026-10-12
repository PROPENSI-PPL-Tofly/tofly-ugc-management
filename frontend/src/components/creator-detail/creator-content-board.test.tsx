import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  DEFAULT_CREATOR_DETAIL_PARAMS,
  type CreatorContentRow,
  type CreatorDetailParams,
  type CreatorDetailView,
  type CreatorPeriod,
} from "@/lib/creator-detail";
import { CreatorContentBoard } from "./creator-content-board";

const { refresh, replace } = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));

const CREATOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONTRACT = "22222222-2222-4222-8222-222222222222";
const PAGE = `/admin/creators/${CREATOR}`;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace }),
  usePathname: () => PAGE,
  useSearchParams: () => new URLSearchParams(),
}));

// The panel and the modal are tested where they live. Here each is a stand-in that shows what
// it was handed and offers the presses the board has to answer.
vi.mock("@/components/content-detail/content-detail-panel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/content-detail/content-detail-panel")>()),
  ContentDetailPanel: ({
    contentId,
    role,
    onClose,
    onDecided,
  }: {
    contentId: string;
    role: string;
    onClose: () => void;
    onDecided: (decision: "approve" | "revise") => void;
  }) => (
    <div role="dialog" aria-label="Detail konten">
      <p>
        {contentId} sebagai {role}
      </p>
      <button type="button" onClick={onClose}>
        Tutup
      </button>
      <button type="button" onClick={() => onDecided("approve")}>
        Approve
      </button>
      <button type="button" onClick={() => onDecided("revise")}>
        Minta Revisi
      </button>
    </div>
  ),
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
      <p>
        {contractId} · evergreen {evergreenCount}/{quota} · {contractStart} s.d. {contractEnd}
      </p>
      <button type="button" onClick={onClose}>
        Batal
      </button>
      <button type="button" onClick={onSaved}>
        Tambahkan
      </button>
    </div>
  ),
}));

const PERIOD: CreatorPeriod = {
  contractId: CONTRACT,
  periodNumber: 2,
  type: "regular",
  startDate: "2026-06-01",
  endDate: "2026-12-31",
  status: "active",
  contentQuota: 19,
  remainingEvergreenQuota: 1,
  daysBetween: 14,
};

function row(index: number): CreatorContentRow {
  return {
    contentId: `content-${index}`,
    name: `Konten ${index}`,
    type: "evergreen",
    deadline: "2026-09-26",
    status: "scheduled",
    tags: [],
    revisionCount: 0,
  };
}

/** A view of the open period holding `total` contents, showing the given page of ten. */
function viewOf(total: number, page = 1, selected: CreatorPeriod | null = PERIOD): CreatorDetailView {
  const shown = Math.max(0, Math.min(10, total - (page - 1) * 10));

  return {
    creator: { id: CREATOR, name: "Rangga Pratama", email: "rangga@example.com", socials: {} },
    periods: selected ? [selected] : [],
    selected,
    rows: Array.from({ length: shown }, (_, index) => row((page - 1) * 10 + index + 1)),
    page,
    total,
    totalPages: Math.max(1, Math.ceil(total / 10)),
  };
}

function renderBoard(
  view: CreatorDetailView = viewOf(3),
  state: CreatorDetailParams = DEFAULT_CREATOR_DETAIL_PARAMS,
) {
  return render(<CreatorContentBoard creatorId={CREATOR} view={view} state={state} />);
}

function topPages() {
  return within(screen.getByRole("navigation", { name: "Navigasi halaman atas" }));
}

function bottomPages() {
  return within(screen.getByRole("navigation", { name: "Navigasi halaman bawah" }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CreatorContentBoard", () => {
  it("is headed Content Plan and says which period it shows", () => {
    renderBoard();

    expect(screen.getByRole("heading", { level: 2, name: "Content Plan" })).toBeInTheDocument();
    expect(screen.getByText("Periode 2 · Aktif")).toBeInTheDocument();
  });

  it("offers the type and status filters over the table", () => {
    renderBoard();

    expect(screen.getByRole("button", { name: /^Tipe:/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Status:/ })).toBeInTheDocument();
  });

  describe("pagination", () => {
    it.each([
      ["several pages", 25, "Menampilkan 1–10 dari 25 konten", "Halaman 1 dari 3"],
      ["exactly one full page", 10, "Menampilkan 1–10 dari 10 konten", "Halaman 1 dari 1"],
      ["less than a page", 3, "Menampilkan 1–3 dari 3 konten", "Halaman 1 dari 1"],
      ["no content at all", 0, "Menampilkan 0 konten", "Halaman 1 dari 1"],
    ])("stays on show above and below the table with %s", (_, total, slice, where) => {
      renderBoard(viewOf(total));

      for (const pages of [topPages(), bottomPages()]) {
        expect(pages.getByText(slice)).toBeInTheDocument();
        expect(pages.getByText(where)).toBeInTheDocument();
        expect(pages.getByText("Sebelumnya")).toBeInTheDocument();
        expect(pages.getByText("Berikutnya")).toBeInTheDocument();
      }
    });

    it("shows ten rows of a longer period, and the rest behind Berikutnya", () => {
      renderBoard(viewOf(25));

      // The heading row and the ten of this page.
      expect(screen.getAllByRole("row")).toHaveLength(11);
      for (const pages of [topPages(), bottomPages()]) {
        expect(pages.getByRole("link", { name: "Berikutnya" })).toHaveAttribute(
          "href",
          `${PAGE}?page=2`,
        );
        expect(pages.queryByRole("link", { name: "Sebelumnya" })).toBeNull();
      }
    });

    it("carries the open period and the filters into both sets of links", () => {
      const state: CreatorDetailParams = {
        contract: CONTRACT,
        type: [],
        status: ["scheduled"],
        page: 2,
      };
      renderBoard(viewOf(25, 2), state);

      for (const pages of [topPages(), bottomPages()]) {
        expect(pages.getByText("Menampilkan 11–20 dari 25 konten")).toBeInTheDocument();
        expect(pages.getByRole("link", { name: "Sebelumnya" })).toHaveAttribute(
          "href",
          `${PAGE}?contract=${CONTRACT}&status=scheduled`,
        );
        expect(pages.getByRole("link", { name: "Berikutnya" })).toHaveAttribute(
          "href",
          `${PAGE}?contract=${CONTRACT}&status=scheduled&page=3`,
        );
      }
    });

    it("stays on show while a filter hides every row", () => {
      renderBoard(viewOf(0), { ...DEFAULT_CREATOR_DETAIL_PARAMS, status: ["pending"] });

      expect(screen.getByText("Tidak ada konten sesuai filter.")).toBeInTheDocument();
      expect(topPages().getByText("Menampilkan 0 konten")).toBeInTheDocument();
      expect(bottomPages().getByText("Menampilkan 0 konten")).toBeInTheDocument();
    });

    it("says an unfiltered period has no content yet", () => {
      renderBoard(viewOf(0));

      expect(screen.getByText("Belum ada konten pada periode kontrak ini.")).toBeInTheDocument();
    });
  });

  describe("the Content Detail panel", () => {
    it("is closed until a row is pressed", () => {
      renderBoard();

      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("opens for the pressed row's content, as an admin", () => {
      renderBoard();

      fireEvent.click(screen.getByText("Konten 2"));

      expect(screen.getByRole("dialog", { name: "Detail konten" })).toHaveTextContent(
        "content-2 sebagai admin",
      );
    });

    it("opens from the row's button as well", () => {
      renderBoard();

      fireEvent.click(screen.getByRole("button", { name: "Detail Konten 3" }));

      expect(screen.getByRole("dialog", { name: "Detail konten" })).toHaveTextContent("content-3");
    });

    it("closes without touching the list", () => {
      renderBoard();
      fireEvent.click(screen.getByText("Konten 1"));

      fireEvent.click(screen.getByRole("button", { name: "Tutup" }));

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(refresh).not.toHaveBeenCalled();
      expect(screen.queryByRole("status")).toBeNull();
    });

    it.each([
      ["Approve", "Draft di-approve. Kreator bisa kirim link video."],
      ["Minta Revisi", "Permintaan revisi terkirim ke kreator."],
    ])("after %s closes, confirms with a toast and reads the list again", (press, message) => {
      renderBoard();
      fireEvent.click(screen.getByText("Konten 1"));

      fireEvent.click(screen.getByRole("button", { name: press }));

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByRole("status")).toHaveTextContent(message);
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("moves to another content when a second row is pressed", () => {
      renderBoard();

      fireEvent.click(screen.getByText("Konten 1"));
      fireEvent.click(screen.getByText("Konten 3"));

      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(screen.getByRole("dialog")).toHaveTextContent("content-3");
    });
  });

  describe("Tambah Konten", () => {
    it("opens the modal on the open period's contract, quota and dates", () => {
      renderBoard();

      fireEvent.click(screen.getByRole("button", { name: "+ Tambah Konten" }));

      // Nineteen in the quota with one left over: eighteen Evergreen are already planned.
      expect(screen.getByRole("dialog", { name: "Tambah Konten" })).toHaveTextContent(
        `${CONTRACT} · evergreen 18/19 · 2026-06-01 s.d. 2026-12-31`,
      );
    });

    it("never counts fewer than no Evergreen, whatever the API says is left", () => {
      renderBoard(viewOf(3, 1, { ...PERIOD, contentQuota: 3, remainingEvergreenQuota: 5 }));

      fireEvent.click(screen.getByRole("button", { name: "+ Tambah Konten" }));

      expect(screen.getByRole("dialog", { name: "Tambah Konten" })).toHaveTextContent(
        "evergreen 0/3",
      );
    });

    it("closes on Batal without touching the list", () => {
      renderBoard();
      fireEvent.click(screen.getByRole("button", { name: "+ Tambah Konten" }));

      fireEvent.click(screen.getByRole("button", { name: "Batal" }));

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(refresh).not.toHaveBeenCalled();
    });

    it("after a save closes, confirms with a toast and reads the list again", () => {
      renderBoard();
      fireEvent.click(screen.getByRole("button", { name: "+ Tambah Konten" }));

      fireEvent.click(screen.getByRole("button", { name: "Tambahkan" }));

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByRole("status")).toHaveTextContent("Konten berhasil ditambahkan.");
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("is offered on a period that has not started yet", () => {
      renderBoard(viewOf(0, 1, { ...PERIOD, status: "upcoming" }));

      expect(screen.getByRole("button", { name: "+ Tambah Konten" })).toBeInTheDocument();
    });

    it("is not offered on a period that has ended, which is only to be read", () => {
      renderBoard(viewOf(3, 1, { ...PERIOD, status: "expired" }));

      expect(screen.queryByRole("button", { name: "+ Tambah Konten" })).toBeNull();
      expect(screen.getByText("Periode 2 · Berakhir")).toBeInTheDocument();
    });
  });

  it("says a creator has no contract, with no table and nothing to page through", () => {
    renderBoard(viewOf(0, 1, null));

    expect(screen.getByRole("heading", { level: 2, name: "Content Plan" })).toBeInTheDocument();
    expect(screen.getByText("Creator ini belum memiliki kontrak.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("button", { name: "+ Tambah Konten" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Tipe:/ })).toBeNull();
  });
});
