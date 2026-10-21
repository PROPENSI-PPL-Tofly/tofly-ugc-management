import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import { CreatorTable } from "./creator-table";
import { creator } from "./creator.fixture";

const { push, replace } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    replace,
  }),
  usePathname: () => "/admin/creators",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

describe("CreatorTable", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    push.mockClear();
  });

  it("shows every column the admin needs for one creator", () => {
    render(<CreatorTable creators={[creator()]} total={1} />);

    const row = screen.getAllByRole("row")[1];

    expect(within(row).getByText("Rangga Pratama")).toBeInTheDocument();

    expect(within(row).getByText("rangga@example.com")).toBeInTheDocument();

    expect(within(row).getByText("Instagram @rangga.creates")).toBeInTheDocument();

    expect(within(row).getByText("TikTok @ranggacreates")).toBeInTheDocument();

    expect(within(row).getByText("Kontrak aktif")).toBeInTheDocument();

    expect(within(row).getByText("10 Jun – 7 Des 2026")).toBeInTheDocument();

    expect(within(row).getByText("Regular · sisa 80 hari")).toBeInTheDocument();

    expect(within(row).getByText("5/6 konten terkirim")).toBeInTheDocument();

    // A real <progress> element: no inline style, so a strict
    // Content-Security-Policy can forbid inline styles across the app.
    const bar = within(row).getByRole("progressbar");

    expect(bar.tagName).toBe("PROGRESS");
    expect(bar).toHaveAttribute("value", "83");
    expect(bar).toHaveAttribute("max", "100");
    expect(bar).not.toHaveAttribute("style");

    expect(within(row).getByText("80%")).toBeInTheDocument();

    expect(within(row).getByText("0,17x")).toBeInTheDocument();

    expect(within(row).getByText("Baik")).toBeInTheDocument();
  });

  it("labels the columns", () => {
    render(<CreatorTable creators={[creator()]} total={1} />);

    const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);

    expect(headers).toEqual([
      "Creator",
      "Kontrak",
      "Progres konten",
      "Tepat waktu",
      "Rata-rata revisi",
      "Produktivitas",
    ]);
  });

  it("mentions the period once a contract has been renewed", () => {
    render(
      <CreatorTable
        creators={[
          creator({
            contract: {
              ...creator().contract,
              periodNumber: 2,
            },
          }),
        ]}
        total={1}
      />,
    );

    expect(screen.getByText("Regular · sisa 80 hari, periode ke-2")).toBeInTheDocument();
  });

  it("names the contract type beside the time left", () => {
    render(
      <CreatorTable
        creators={[creator({ contract: { ...creator().contract, type: "probation" } })]}
        total={1}
      />,
    );

    expect(screen.getByText("Probation · sisa 80 hari")).toBeInTheDocument();
  });

  it("describes an expired, an upcoming and a missing contract", () => {
    render(
      <CreatorTable
        creators={[
          creator({
            id: "expired",
            contract: {
              status: "expired",
              startDate: "2026-01-01",
              endDate: "2026-08-30",
              daysRemaining: -19,
              periodNumber: 1,
              contentQuota: 6,
              type: "regular",
            },
          }),
          creator({
            id: "upcoming",
            contract: {
              status: "upcoming",
              startDate: "2026-09-28",
              endDate: "2027-03-27",
              daysRemaining: 190,
              periodNumber: 1,
              contentQuota: 6,
              type: "probation",
            },
          }),
          creator({
            id: "none",
            contract: {
              status: "none",
              startDate: null,
              endDate: null,
              daysRemaining: null,
              periodNumber: 0,
              contentQuota: 0,
              type: null,
            },
          }),
        ]}
        total={3}
      />,
    );

    expect(screen.getByText("Kontrak berakhir")).toBeInTheDocument();

    expect(screen.getByText("Regular · berakhir 19 hari lalu")).toBeInTheDocument();

    expect(screen.getByText("Kontrak belum mulai")).toBeInTheDocument();

    expect(screen.getByText("28 Sep 2026 – 27 Mar 2027")).toBeInTheDocument();

    expect(screen.getByText("Belum ada kontrak")).toBeInTheDocument();

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("leaves out socials the creator has not connected", () => {
    render(<CreatorTable creators={[creator({ socials: {} })]} total={1} />);

    expect(screen.queryByText(/Instagram @/)).toBeNull();
    expect(screen.queryByText(/TikTok @/)).toBeNull();
  });

  it("flags revoked access next to the identity", () => {
    render(
      <CreatorTable
        creators={[
          creator({
            accessRevokeDate: "2026-09-04",
          }),
        ]}
        total={1}
      />,
    );

    expect(screen.getByText("Akses dicabut 4 Sep 2026")).toBeInTheDocument();
  });

  it("shows the other productivity bands with their own tone", () => {
    render(
      <CreatorTable
        creators={[
          creator({
            id: "no-data",
            performance: {
              onTimeRate: null,
              avgRevisions: 0,
              productivity: "no_data",
              productivityLabel: "Belum Ada Data",
            },
          }),
          creator({
            id: "risk",
            performance: {
              onTimeRate: 25,
              avgRevisions: 3,
              productivity: "risk",
              productivityLabel: "Berisiko",
            },
          }),
        ]}
        total={2}
      />,
    );

    // Nothing to judge yet is not a warning, so it stays neutral rather than amber.
    expect(screen.getByText("Belum Ada Data").className).toContain("text-ink-2");

    expect(screen.getByText("Berisiko").className).toContain("red");

    expect(screen.getByText("—")).toBeInTheDocument();

    expect(screen.getByText("3x")).toBeInTheDocument();
  });

  it("explains an empty roster", () => {
    render(<CreatorTable creators={[]} total={0} />);

    expect(screen.queryByRole("table")).toBeNull();

    expect(screen.getByText("Belum ada creator yang terdaftar.")).toBeInTheDocument();
    expect(screen.queryByText(/cocok/)).toBeNull();
  });

  // A search that finds nothing is not an empty roster: say so, and offer the way back.
  it("tells a search or filter that matched nobody apart from an empty roster", () => {
    render(<CreatorTable creators={[]} total={0} filtered />);

    expect(
      screen.getByText("Tidak ada creator yang cocok dengan pencarian atau filter."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Belum ada creator yang terdaftar.")).toBeNull();
  });

  it("offers the same way out of an empty search as every other list: the hint and Reset filter", () => {
    window.history.pushState({}, "", "/admin/creators?q=zzz&contractStatus=active");
    render(<CreatorTable creators={[]} total={0} filtered />);

    expect(screen.getByText("Longgarkan pencarian atau filternya.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset filter" }));

    expect(replace).toHaveBeenCalledWith("/admin/creators", { scroll: false });
  });

  it("points back to the first page when the page is past the end", () => {
    render(<CreatorTable creators={[]} total={12} />);

    expect(screen.getByText("Tidak ada creator di halaman ini.")).toBeInTheDocument();

    expect(
      screen.getByRole("link", {
        name: "Ke halaman pertama",
      }),
    ).toHaveAttribute("href", "/admin/creators");
  });

  // PBI-4: the Creator Detail page takes the place of the Detail dialog and of the creator's
  // own Content Plan page, so a row has one way in.
  describe("opening a creator", () => {
    it("offers the creator's name and a Detail link, both to the creator's own page", () => {
      render(<CreatorTable creators={[creator({ id: "creator-123" })]} total={1} />);

      const row = screen.getAllByRole("row")[1];

      expect(within(row).getAllByRole("link")).toHaveLength(2);
      expect(within(row).getByRole("link", { name: "Rangga Pratama" })).toHaveAttribute(
        "href",
        "/admin/creators/creator-123",
      );
      expect(within(row).getByRole("link", { name: "Detail Rangga Pratama" })).toHaveAttribute(
        "href",
        "/admin/creators/creator-123",
      );
    });

    it("offers a Detail button in the last column, as the prototype does", () => {
      render(<CreatorTable creators={[creator()]} total={1} />);

      const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");

      expect(within(cells.at(-1)!).getByRole("link", { name: "Detail Rangga Pratama" })).toHaveTextContent(
        "Detail",
      );
      expect(screen.getAllByRole("columnheader").at(-1)).toHaveTextContent("Aksi");
    });

    it("opens the creator's page once when its Detail button is pressed, not again through the row", () => {
      render(<CreatorTable creators={[creator()]} total={1} />);

      const link = screen.getByRole("link", { name: "Detail Rangga Pratama" });
      // The link's own navigation is the browser's; here only the row's share is watched.
      link.addEventListener("click", (event) => event.preventDefault());

      fireEvent.click(link);

      expect(push).not.toHaveBeenCalled();
    });

    it("no longer offers the creator's own Content Plan page", () => {
      render(<CreatorTable creators={[creator()]} total={1} />);

      expect(screen.queryByRole("link", { name: /Content Plan/ })).not.toBeInTheDocument();
    });

    it("opens the creator's page on a press anywhere on the row", () => {
      render(<CreatorTable creators={[creator({ id: "creator-123" })]} total={1} />);

      fireEvent.click(screen.getByText("rangga@example.com"));

      expect(push).toHaveBeenCalledExactlyOnceWith("/admin/creators/creator-123");
    });

    it("opens the page of the creator that was pressed, among several", () => {
      render(
        <CreatorTable
          creators={[
            creator({ id: "creator-1" }),
            creator({ id: "creator-2", name: "Salsa Amelia", email: "salsa@example.com" }),
          ]}
          total={2}
        />,
      );

      fireEvent.click(screen.getByText("salsa@example.com"));

      expect(push).toHaveBeenCalledExactlyOnceWith("/admin/creators/creator-2");
    });

    it("leaves the link to open the page itself, not once for the link and once for the row", () => {
      render(<CreatorTable creators={[creator()]} total={1} />);
      const link = screen.getByRole("link", { name: "Rangga Pratama" });
      // The link's own navigation is the browser's; here only the row's share is watched.
      link.addEventListener("click", (event) => event.preventDefault());

      fireEvent.click(link);

      expect(push).not.toHaveBeenCalled();
    });

    it("leaves the heading row alone", () => {
      render(<CreatorTable creators={[creator()]} total={1} />);

      fireEvent.click(screen.getByRole("columnheader", { name: "Kontrak" }));

      expect(push).not.toHaveBeenCalled();
    });

    it("does not open the page over a name or an email that was just selected", () => {
      vi.spyOn(window, "getSelection").mockReturnValue({
        toString: () => "rangga@example.com",
      } as Selection);
      render(<CreatorTable creators={[creator()]} total={1} />);

      fireEvent.click(screen.getByText("rangga@example.com"));

      expect(push).not.toHaveBeenCalled();
    });

    it("opens as usual where the browser reports no selection at all", () => {
      vi.spyOn(window, "getSelection").mockReturnValue(null);
      render(<CreatorTable creators={[creator()]} total={1} />);

      fireEvent.click(screen.getByText("rangga@example.com"));

      expect(push).toHaveBeenCalledExactlyOnceWith("/admin/creators/creator-1");
    });

    it("encodes an id that could otherwise step out of the address", () => {
      render(<CreatorTable creators={[creator({ id: "a/b?c" })]} total={1} />);

      expect(screen.getByRole("link", { name: "Rangga Pratama" })).toHaveAttribute(
        "href",
        "/admin/creators/a%2Fb%3Fc",
      );

      fireEvent.click(screen.getByText("rangga@example.com"));

      expect(push).toHaveBeenCalledExactlyOnceWith("/admin/creators/a%2Fb%3Fc");
    });

    it("opens no dialog: the detail is a page now", () => {
      render(<CreatorTable creators={[creator()]} total={1} />);

      fireEvent.click(screen.getByText("rangga@example.com"));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Detail" })).not.toBeInTheDocument();
    });
  });
});
