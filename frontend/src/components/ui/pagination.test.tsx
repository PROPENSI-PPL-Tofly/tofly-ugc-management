import { render, screen } from "@testing-library/react";
import { useLinkStatus } from "next/link";
import { Pagination } from "./pagination";
import { expectPhoneTarget } from "@/test/touch-target";

vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return { ...actual, useLinkStatus: vi.fn(() => ({ pending: false })) };
});

const CREATORS = { basePath: "/admin/creators", noun: "creator" };

describe("Pagination", () => {
  beforeEach(() => {
    vi.mocked(useLinkStatus).mockReturnValue({ pending: false });
  });

  it("says nothing when everything fits on one page", () => {
    const { container } = render(
      <Pagination
        {...CREATORS}
        page={1}
        pageSize={10}
        total={7}
        totalPages={1}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("describes the slice on show and where it sits", () => {
    render(
      <Pagination
        {...CREATORS}
        page={2}
        pageSize={10}
        total={23}
        totalPages={3}
      />,
    );

    expect(
      screen.getByText("Menampilkan 11–20 dari 23 creator"),
    ).toBeInTheDocument();
    expect(screen.getByText("Halaman 2 dari 3")).toBeInTheDocument();
  });

  it("links to the neighbouring pages through the URL", () => {
    render(
      <Pagination
        {...CREATORS}
        page={2}
        pageSize={10}
        total={23}
        totalPages={3}
      />,
    );

    expect(screen.getByRole("link", { name: "Sebelumnya" })).toHaveAttribute(
      "href",
      "/admin/creators",
    );
    expect(screen.getByRole("link", { name: "Berikutnya" })).toHaveAttribute(
      "href",
      "/admin/creators?page=3",
    );
  });

  // Same press as the buttons beside it (approved design), still for reduced motion.
  it("gives a little when a page link is pressed, unless motion is reduced", () => {
    render(<Pagination {...CREATORS} page={2} pageSize={10} total={23} totalPages={3} />);

    expect(screen.getByRole("link", { name: "Berikutnya" })).toHaveClass(
      "active:scale-[.97]",
      "motion-reduce:active:scale-100",
    );
  });

  it("disables the way back on the first page", () => {
    render(
      <Pagination
        {...CREATORS}
        page={1}
        pageSize={10}
        total={23}
        totalPages={3}
      />,
    );

    expect(screen.queryByRole("link", { name: "Sebelumnya" })).toBeNull();
    expect(screen.getByText("Sebelumnya")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("link", { name: "Berikutnya" })).toHaveAttribute(
      "href",
      "/admin/creators?page=2",
    );
  });

  it("disables the way forward on the last page, counting a partial slice", () => {
    render(
      <Pagination
        {...CREATORS}
        page={3}
        pageSize={10}
        total={23}
        totalPages={3}
      />,
    );

    expect(
      screen.getByText("Menampilkan 21–23 dari 23 creator"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Berikutnya" })).toBeNull();
    expect(screen.getByText("Berikutnya")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("link", { name: "Sebelumnya" })).toHaveAttribute(
      "href",
      "/admin/creators?page=2",
    );
  });

  it("tells the user a page is on its way while the link is pending", () => {
    vi.mocked(useLinkStatus).mockReturnValue({ pending: true });

    render(
      <Pagination
        {...CREATORS}
        page={2}
        pageSize={10}
        total={23}
        totalPages={3}
      />,
    );

    const label = screen.getByText("Berikutnya");
    expect(label).toHaveAttribute("aria-busy", "true");
    expect(label).toHaveAttribute("data-pending", "true");
    expect(screen.getByText("Sebelumnya")).toHaveAttribute(
      "data-pending",
      "true",
    );
  });

  it("counts in the noun it is given", () => {
    render(
      <Pagination
        basePath="/admin/submissions"
        noun="draft"
        page={1}
        pageSize={10}
        total={22}
        totalPages={3}
      />,
    );

    expect(
      screen.getByText("Menampilkan 1–10 dari 22 draft"),
    ).toBeInTheDocument();
  });

  it("stays on the page it is given and keeps the filters in both links", () => {
    render(
      <Pagination
        basePath="/admin/submissions"
        noun="draft"
        query={{ q: "100% asli", type: "specific" }}
        page={2}
        pageSize={10}
        total={22}
        totalPages={3}
      />,
    );

    expect(screen.getByRole("link", { name: "Sebelumnya" })).toHaveAttribute(
      "href",
      "/admin/submissions?q=100%25+asli&type=specific",
    );
    expect(screen.getByRole("link", { name: "Berikutnya" })).toHaveAttribute(
      "href",
      "/admin/submissions?q=100%25+asli&type=specific&page=3",
    );
  });

  // Rate & Invoicing hands over its whole query, page included: the way back to page 1 must not
  // keep the page it is leaving.
  it("drops a page the query still carries when linking back to the first page", () => {
    render(
      <Pagination
        basePath="/admin/invoicing"
        noun="invoice"
        query={{ sort: "total", page: "2" }}
        page={2}
        pageSize={10}
        total={13}
        totalPages={2}
      />,
    );

    expect(screen.getByRole("link", { name: "Sebelumnya" })).toHaveAttribute(
      "href",
      "/admin/invoicing?sort=total",
    );
  });

  it("stays on show for a single page when asked to, with nowhere to go", () => {
    render(
      <Pagination
        basePath="/admin/creators/creator-1"
        noun="konten"
        always
        page={1}
        pageSize={10}
        total={7}
        totalPages={1}
      />,
    );

    expect(
      screen.getByText("Menampilkan 1–7 dari 7 konten"),
    ).toBeInTheDocument();
    expect(screen.getByText("Halaman 1 dari 1")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Sebelumnya")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByText("Berikutnya")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("counts an empty list as nothing rather than as a slice from 1 to 0", () => {
    render(
      <Pagination
        basePath="/admin/creators/creator-1"
        noun="konten"
        always
        page={1}
        pageSize={10}
        total={0}
        totalPages={1}
      />,
    );

    expect(screen.getByText("Menampilkan 0 konten")).toBeInTheDocument();
    expect(screen.queryByText(/1–0/)).toBeNull();
    expect(screen.getByText("Halaman 1 dari 1")).toBeInTheDocument();
  });

  it("lets its controls wrap, so on a 320 px phone Berikutnya stays inside the panel", () => {
    render(
      <Pagination
        {...CREATORS}
        page={2}
        pageSize={10}
        total={35}
        totalPages={4}
      />,
    );

    // The page count and both buttons need about 300 px; a 320 px panel leaves them 246.
    const controls = screen.getByText("Halaman 2 dari 4").parentElement;
    expect(controls).toHaveClass("flex-wrap");
  });

  // Under a finger a press needs about 44px (WCAG 2.5.5, Apple and Android guidance); on a phone
  // this control is one of the page's main ways around, so it gets that height.
  it("gives the neighbouring pages a 44px press on a phone, and the page it cannot leave for", () => {
    render(<Pagination {...CREATORS} page={1} pageSize={10} total={23} totalPages={3} />);

    expectPhoneTarget(screen.getByRole("link", { name: "Berikutnya" }));
    expectPhoneTarget(screen.getByText("Sebelumnya"));
  });
});
