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

let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace }),
  usePathname: () => PAGE,
  useSearchParams: () => searchParams,
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
  evergreenCount: 18,
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
    creator: {
      id: CREATOR,
      name: "Rangga Pratama",
      email: "rangga@example.com",
      socials: {},
      accessRevokeDate: null,
    },
    periods: selected ? [selected] : [],
    selected,
    rows: Array.from({ length: shown }, (_, index) => row((page - 1) * 10 + index + 1)),
    page,
    total,
    totalPages: Math.max(1, Math.ceil(total / 10)),
    counts: { all: total, action: 0, waiting: total, done: 0 },
    calendar: [{ ...row(99), name: "Konten Kalender", deadline: "2026-10-05" }],
  };
}

function renderBoard(
  view: CreatorDetailView = viewOf(3),
  state: CreatorDetailParams = DEFAULT_CREATOR_DETAIL_PARAMS,
) {
  return render(
    <CreatorContentBoard creatorId={CREATOR} view={view} state={state} today="2026-10-21" />,
  );
}

/** The period's content list, apart from the calendar's own grid above it. */
function contentList() {
  return within(screen.getByRole("tabpanel", { name: "Daftar konten periode" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
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

  it("lays the period's content out as the Content Plan does: tabs, then filters, then the list", () => {
    renderBoard(viewOf(3), { ...DEFAULT_CREATOR_DETAIL_PARAMS, tab: "waiting" });

    const tabs = screen.getByRole("tablist", { name: "Tab konten periode" });
    expect(screen.getByRole("tab", { name: "Menunggu Kreator3" })).toHaveAttribute("aria-selected", "true");
    const list = screen.getByRole("tabpanel", { name: "Daftar konten periode" });
    expect(list).toContainElement(contentList().getByRole("table"));
    expect(tabs.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the period's calendar above its Content Plan, and opens a content from its chip", () => {
    renderBoard();

    const calendar = screen.getByRole("heading", { level: 2, name: "Jadwal Konten" });
    const plan = screen.getByRole("heading", { level: 2, name: "Content Plan" });
    expect(calendar.compareDocumentPosition(plan) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Konten Kalender · Scheduled" }));

    expect(screen.getByRole("dialog", { name: "Detail konten" })).toHaveTextContent("content-99 sebagai admin");
  });

  it("turns a turned order back to the nearest deadline first, the bare address", () => {
    searchParams = new URLSearchParams({ sort: "desc" });
    renderBoard(viewOf(3), { ...DEFAULT_CREATOR_DETAIL_PARAMS, sort: "desc" });

    fireEvent.click(screen.getByRole("button", { name: /Deadline/ }));

    expect(replace).toHaveBeenCalledWith(PAGE, { scroll: false });
  });

  it("turns the deadline order over from the header, back to page one", () => {
    searchParams = new URLSearchParams({ contract: CONTRACT, page: "2" });
    renderBoard(viewOf(25, 2), { ...DEFAULT_CREATOR_DETAIL_PARAMS, contract: CONTRACT, page: 2 });

    fireEvent.click(screen.getByRole("button", { name: /Deadline/ }));

    expect(replace).toHaveBeenCalledWith(`${PAGE}?contract=${CONTRACT}&sort=desc`, { scroll: false });
  });

  describe("pagination", () => {
    it("pages a longer period once, below the table, like every other list", () => {
      renderBoard(viewOf(25));

      expect(screen.getAllByText("Menampilkan 1–10 dari 25 konten")).toHaveLength(1);
      expect(screen.getByText("Halaman 1 dari 3")).toBeInTheDocument();
      // Below the table: the slice comes after the last row in the page.
      const slice = screen.getByText("Menampilkan 1–10 dari 25 konten");
      expect(
        contentList().getByRole("table").compareDocumentPosition(slice) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it.each([
      ["exactly one full page", 10],
      ["less than a page", 3],
      ["no content at all", 0],
    ])("has nothing to page through with %s", (_, total) => {
      renderBoard(viewOf(total));

      expect(screen.queryByText(/^Menampilkan/)).toBeNull();
      expect(screen.queryByText("Berikutnya")).toBeNull();
    });

    it("shows ten rows of a longer period, and the rest behind Berikutnya", () => {
      renderBoard(viewOf(25));

      // The heading row and the ten of this page.
      expect(contentList().getAllByRole("row")).toHaveLength(11);
      expect(screen.getByRole("link", { name: "Berikutnya" })).toHaveAttribute(
        "href",
        `${PAGE}?page=2`,
      );
      expect(screen.queryByRole("link", { name: "Sebelumnya" })).toBeNull();
    });

    it("carries the open period and the filters into the page links", () => {
      const state: CreatorDetailParams = {
        ...DEFAULT_CREATOR_DETAIL_PARAMS,
        contract: CONTRACT,
        status: ["scheduled"],
        page: 2,
      };
      renderBoard(viewOf(25, 2), state);

      expect(screen.getByText("Menampilkan 11–20 dari 25 konten")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Sebelumnya" })).toHaveAttribute(
        "href",
        `${PAGE}?contract=${CONTRACT}&status=scheduled`,
      );
      expect(screen.getByRole("link", { name: "Berikutnya" })).toHaveAttribute(
        "href",
        `${PAGE}?contract=${CONTRACT}&status=scheduled&page=3`,
      );
    });

    it("clears the filters from an empty filtered period but stays on that period", () => {
      window.history.pushState({}, "", `${PAGE}?contract=${CONTRACT}&status=pending`);
      renderBoard(viewOf(0), { ...DEFAULT_CREATOR_DETAIL_PARAMS, contract: CONTRACT, status: ["pending"] });

      fireEvent.click(screen.getByRole("button", { name: "Reset filter" }));

      expect(replace).toHaveBeenCalledWith(`${PAGE}?contract=${CONTRACT}`, { scroll: false });
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

    it("opens from the content's name, a button, as well", () => {
      renderBoard();

      fireEvent.click(screen.getByRole("button", { name: "Konten 3" }));

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

      // The period's own count of planned Evergreen, handed on as it is.
      expect(screen.getByRole("dialog", { name: "Tambah Konten" })).toHaveTextContent(
        `${CONTRACT} · evergreen 18/19 · 2026-06-01 s.d. 2026-12-31`,
      );
    });

    it("hands the modal the count itself, not one worked back from what is left", () => {
      renderBoard(
        viewOf(3, 1, { ...PERIOD, contentQuota: 3, evergreenCount: 5, remainingEvergreenQuota: 0 }),
      );

      fireEvent.click(screen.getByRole("button", { name: "+ Tambah Konten" }));

      // Five planned against a quota of three: worked back from "none left" it would read 3/3.
      expect(screen.getByRole("dialog", { name: "Tambah Konten" })).toHaveTextContent(
        "evergreen 5/3",
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
    expect(screen.queryByRole("heading", { name: "Jadwal Konten" })).toBeNull();
  });
});
