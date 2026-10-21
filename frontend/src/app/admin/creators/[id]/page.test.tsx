import { render, screen, within } from "@testing-library/react";
import type { CreatorDetailView, CreatorPeriod } from "@/lib/creator-detail";
import { fetchCreatorDetail } from "@/lib/creator-detail.server";
import CreatorDetailPage, { metadata } from "./page";
import { PHONE_TARGET } from "@/components/ui/touch-target";

const CREATOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FIRST = "11111111-1111-4111-8111-111111111111";
const SECOND = "22222222-2222-4222-8222-222222222222";
const PAGE = `/admin/creators/${CREATOR}`;

/** What Next throws to stop rendering and show the not-found screen. */
class NotFound extends Error {}

vi.mock("@/lib/creator-detail.server", () => ({
  fetchCreatorDetail: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => PAGE,
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new NotFound();
  },
}));

vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return { ...actual, useLinkStatus: () => ({ pending: false }) };
});

const NEWEST: CreatorPeriod = {
  contractId: SECOND,
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

const OLDEST: CreatorPeriod = {
  contractId: FIRST,
  periodNumber: 1,
  type: "probation",
  startDate: "2026-01-01",
  endDate: "2026-05-31",
  status: "expired",
  contentQuota: 3,
  evergreenCount: 3,
  remainingEvergreenQuota: 0,
  daysBetween: 7,
};

function viewOf(overrides: Partial<CreatorDetailView> = {}): CreatorDetailView {
  return {
    creator: {
      id: CREATOR,
      name: "Rangga Pratama",
      email: "rangga@example.com",
      socials: { instagram: "rangga.creates" },
    },
    periods: [NEWEST, OLDEST],
    selected: NEWEST,
    rows: [
      {
        contentId: "content-1",
        name: "Evg_7_RanggaPratama_26092026",
        type: "evergreen",
        deadline: "2026-09-26",
        status: "draft_review",
        tags: [],
        revisionCount: 0,
      },
    ],
    page: 1,
    total: 1,
    totalPages: 1,
    ...overrides,
  };
}

async function renderPage(
  params: Record<string, string | string[] | undefined> = {},
  id: string = CREATOR,
) {
  render(
    await CreatorDetailPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve(params),
    }),
  );
}

describe("Creator Detail page", () => {
  beforeEach(() => {
    vi.mocked(fetchCreatorDetail).mockReset();
    vi.mocked(fetchCreatorDetail).mockResolvedValue(viewOf());
  });

  it("is titled Detail Creator, in the browser tab as well", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Detail Creator" })).toBeInTheDocument();
    expect(metadata.title).toBe("Detail Creator — Tofly");
  });

  it("is subtitled as the prototype subtitles it", async () => {
    await renderPage();

    expect(screen.getByText("Data, jadwal, dan content plan satu creator")).toBeInTheDocument();
  });

  it("offers the way back to the Creator Database", async () => {
    await renderPage();

    expect(screen.getByRole("link", { name: "← Kembali ke Creator Database" })).toHaveAttribute(
      "href",
      "/admin/creators",
    );
  });

  describe("the way back to the Creator Database", () => {
    function backLink() {
      return screen.getByRole("link", { name: "← Kembali ke Creator Database" });
    }

    // A one-line text link was 20px tall: under the 24px WCAG 2.5.8 asks for, on the page's
    // only way back. On a phone it gets the 44px a main way around needs.
    it("is a 44px press on a phone", async () => {
      await renderPage();

      expect(backLink()).toHaveClass(PHONE_TARGET);
    });

    it("returns to the search, filters and page the admin left", async () => {
      await renderPage({ return: "q=nadia&contractStatus=active&productivity=risk&page=3" });

      expect(backLink()).toHaveAttribute(
        "href",
        "/admin/creators?q=nadia&contractStatus=active&productivity=risk&page=3",
      );
    });

    it("returns to only the parts of the view that were set", async () => {
      await renderPage({ return: "productivity=no_data" });

      expect(backLink()).toHaveAttribute("href", "/admin/creators?productivity=no_data");
    });

    it("returns to the bare roster when the view held nothing the roster reads", async () => {
      await renderPage({ return: "contractStatus=bogus&page=-1&next=%2F%2Fevil.example" });

      expect(backLink()).toHaveAttribute("href", "/admin/creators");
    });

    it("keeps the view to return to on the links to another period", async () => {
      await renderPage({ return: "page=3" });

      const periods = within(screen.getByRole("navigation", { name: "Pilih periode kontrak" }));
      expect(periods.getByRole("link", { name: /Periode 1/ })).toHaveAttribute(
        "href",
        `${PAGE}?contract=${FIRST}&return=page%3D3`,
      );
      expect(periods.getByRole("link", { name: /Periode 2/ })).toHaveAttribute(
        "href",
        `${PAGE}?return=page%3D3`,
      );
    });

    it("keeps the view to return to when the detail cannot be loaded", async () => {
      vi.mocked(fetchCreatorDetail).mockRejectedValue(new Error("503"));

      await renderPage({ return: "q=nadia" });

      expect(backLink()).toHaveAttribute("href", "/admin/creators?q=nadia");
    });
  });

  // PBI-4: creator → contract history per period → content per contract, on one page.
  it("shows the creator, then the contract periods, then the open period's content", async () => {
    await renderPage();

    const [profile, periods, plan] = screen.getAllByRole("heading", { level: 2 });
    expect(profile).toHaveTextContent("Rangga Pratama");
    expect(periods).toHaveTextContent("Periode Kontrak");
    expect(plan).toHaveTextContent("Content Plan");

    expect(screen.getByText("rangga@example.com")).toBeInTheDocument();
    expect(
      within(screen.getByRole("navigation", { name: "Pilih periode kontrak" })).getAllByRole("link"),
    ).toHaveLength(2);
    expect(screen.getByText("Evg_7_RanggaPratama_26092026")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Navigasi halaman atas" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Navigasi halaman bawah" })).toBeInTheDocument();
  });

  it("asks for the creator in the address on the bare view", async () => {
    await renderPage();

    expect(fetchCreatorDetail).toHaveBeenCalledExactlyOnceWith(CREATOR, {
      contract: null,
      type: [],
      status: [],
      page: 1,
    });
  });

  it("asks with the period, the filters and the page the address names", async () => {
    await renderPage({ contract: FIRST, type: "specific", status: "scheduled,pending", page: "2" });

    expect(fetchCreatorDetail).toHaveBeenCalledExactlyOnceWith(CREATOR, {
      contract: FIRST,
      type: ["specific"],
      status: ["scheduled", "pending"],
      page: 2,
    });
  });

  it("never asks with what a content cannot hold, whatever was typed into the address", async () => {
    await renderPage({
      contract: "' OR '1'='1",
      type: "weekly",
      status: "<script>alert(1)</script>",
      page: "-4",
    });

    expect(fetchCreatorDetail).toHaveBeenCalledExactlyOnceWith(CREATOR, {
      contract: null,
      type: [],
      status: [],
      page: 1,
    });
  });

  it("describes the latest contract in the profile even while an older period is open", async () => {
    vi.mocked(fetchCreatorDetail).mockResolvedValue(viewOf({ selected: OLDEST }));

    await renderPage({ contract: FIRST });

    expect(screen.getByText("Tipe").nextElementSibling).toHaveTextContent("Regular");
    expect(screen.getByText("Kontrak").nextElementSibling).toHaveTextContent("Aktif");
    // The open period is still the older one, down in the Content Plan.
    expect(screen.getByText("Periode 1 · Berakhir")).toBeInTheDocument();
  });

  it("still shows the profile of a creator without any contract", async () => {
    vi.mocked(fetchCreatorDetail).mockResolvedValue(
      viewOf({ periods: [], selected: null, rows: [], total: 0 }),
    );

    await renderPage();

    expect(screen.getByRole("heading", { level: 2, name: "Rangga Pratama" })).toBeInTheDocument();
    expect(screen.getByText("Belum ada kontrak")).toBeInTheDocument();
    expect(screen.getByText("Creator ini belum memiliki kontrak.")).toBeInTheDocument();
  });

  describe("when there is no such creator", () => {
    it("hands over to the not-found screen", async () => {
      vi.mocked(fetchCreatorDetail).mockResolvedValue(null);

      await expect(renderPage()).rejects.toBeInstanceOf(NotFound);
    });
  });

  describe("when the detail cannot be loaded", () => {
    beforeEach(() => {
      vi.mocked(fetchCreatorDetail).mockRejectedValue(new Error("HTTP 503"));
    });

    it("says so and offers a retry, in place of the page's panels", async () => {
      await renderPage();

      expect(screen.getByRole("alert")).toHaveTextContent("Detail creator tidak bisa dimuat.");
      expect(screen.getByRole("link", { name: "Muat ulang" })).toHaveAttribute("href", PAGE);
      expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
      expect(screen.queryByRole("table")).toBeNull();
    });

    it("retries the very view that failed", async () => {
      await renderPage({ contract: FIRST, status: "scheduled", page: "2" });

      expect(screen.getByRole("link", { name: "Muat ulang" })).toHaveAttribute(
        "href",
        `${PAGE}?contract=${FIRST}&status=scheduled&page=2`,
      );
    });

    it("keeps the title and the way back, so the admin is not stranded", async () => {
      await renderPage();

      expect(screen.getByRole("heading", { level: 1, name: "Detail Creator" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "← Kembali ke Creator Database" })).toBeInTheDocument();
    });
  });
});
