import { render, screen } from "@testing-library/react";
import { useLinkStatus } from "next/link";
import { Pagination } from "./pagination";

vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return { ...actual, useLinkStatus: vi.fn(() => ({ pending: false })) };
});

describe("Pagination", () => {
  beforeEach(() => {
    vi.mocked(useLinkStatus).mockReturnValue({ pending: false });
  });

  it("says nothing when everything fits on one page", () => {
    const { container } = render(
      <Pagination page={1} pageSize={10} total={7} totalPages={1} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("describes the slice on show and where it sits", () => {
    render(<Pagination page={2} pageSize={10} total={23} totalPages={3} />);

    expect(screen.getByText("Menampilkan 11–20 dari 23 creator")).toBeInTheDocument();
    expect(screen.getByText("Halaman 2 dari 3")).toBeInTheDocument();
  });

  it("links to the neighbouring pages through the URL", () => {
    render(<Pagination page={2} pageSize={10} total={23} totalPages={3} />);

    expect(screen.getByRole("link", { name: "Sebelumnya" })).toHaveAttribute(
      "href",
      "/admin/creators",
    );
    expect(screen.getByRole("link", { name: "Berikutnya" })).toHaveAttribute(
      "href",
      "/admin/creators?page=3",
    );
  });

  it("disables the way back on the first page", () => {
    render(<Pagination page={1} pageSize={10} total={23} totalPages={3} />);

    expect(screen.queryByRole("link", { name: "Sebelumnya" })).toBeNull();
    expect(screen.getByText("Sebelumnya")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("link", { name: "Berikutnya" })).toHaveAttribute(
      "href",
      "/admin/creators?page=2",
    );
  });

  it("disables the way forward on the last page, counting a partial slice", () => {
    render(<Pagination page={3} pageSize={10} total={23} totalPages={3} />);

    expect(screen.getByText("Menampilkan 21–23 dari 23 creator")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Berikutnya" })).toBeNull();
    expect(screen.getByText("Berikutnya")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("link", { name: "Sebelumnya" })).toHaveAttribute(
      "href",
      "/admin/creators?page=2",
    );
  });

  it("tells the user a page is on its way while the link is pending", () => {
    vi.mocked(useLinkStatus).mockReturnValue({ pending: true });

    render(<Pagination page={2} pageSize={10} total={23} totalPages={3} />);

    const label = screen.getByText("Berikutnya");
    expect(label).toHaveAttribute("aria-busy", "true");
    expect(label).toHaveAttribute("data-pending", "true");
    expect(screen.getByText("Sebelumnya")).toHaveAttribute("data-pending", "true");
  });
});
