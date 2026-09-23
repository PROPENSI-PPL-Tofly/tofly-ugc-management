import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import { CreatorTable } from "./creator-table";
import { creator } from "./creator.fixture";

const { push } = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
  }),
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

    expect(within(row).getByText("sisa 80 hari")).toBeInTheDocument();

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
      "Aksi",
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

    expect(screen.getByText("sisa 80 hari, periode ke-2")).toBeInTheDocument();
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
            },
          }),
        ]}
        total={3}
      />,
    );

    expect(screen.getByText("Kontrak berakhir")).toBeInTheDocument();

    expect(screen.getByText("berakhir 19 hari lalu")).toBeInTheDocument();

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
            id: "watch",
            performance: {
              onTimeRate: null,
              avgRevisions: 0,
              productivity: "watch",
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

    expect(screen.getByText("Belum Ada Data").className).toContain("amber");

    expect(screen.getByText("Berisiko").className).toContain("red");

    expect(screen.getByText("—")).toBeInTheDocument();

    expect(screen.getByText("3x")).toBeInTheDocument();
  });

  it("explains an empty roster", () => {
    render(<CreatorTable creators={[]} total={0} />);

    expect(screen.queryByRole("table")).toBeNull();

    expect(screen.getByText("Belum ada creator yang terdaftar.")).toBeInTheDocument();
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

  it("shows Detail and Content Plan actions for each creator", () => {
    render(<CreatorTable creators={[creator()]} total={1} />);

    const row = screen.getAllByRole("row")[1];

    expect(
      within(row).getByRole("button", {
        name: "Detail",
      }),
    ).toBeInTheDocument();

    expect(
      within(row).getByRole("link", {
        name: "Content Plan",
      }),
    ).toBeInTheDocument();
  });

  it("links Content Plan to the selected creator", () => {
    render(
      <CreatorTable
        creators={[
          creator({
            id: "creator-123",
          }),
        ]}
        total={1}
      />,
    );

    const row = screen.getAllByRole("row")[1];

    expect(
      within(row).getByRole("link", {
        name: "Content Plan",
      }),
    ).toHaveAttribute("href", "/admin/creators/creator-123/content-plan");
  });

  it("opens the creator detail dialog when Detail is clicked", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>(() => {}));

    render(<CreatorTable creators={[creator()]} total={1} />);

    const row = screen.getAllByRole("row")[1];

    fireEvent.click(
      within(row).getByRole("button", {
        name: "Detail",
      }),
    );

    expect(
      screen.getByRole("dialog", {
        name: "Rangga Pratama",
      }),
    ).toBeInTheDocument();
  });

  it("closes the creator detail dialog", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>(() => {}));
    render(<CreatorTable creators={[creator()]} total={1} />);
    fireEvent.click(within(screen.getAllByRole("row")[1]).getByRole("button", { name: "Detail" }));

    fireEvent.click(screen.getByRole("button", { name: "Tutup dialog" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
