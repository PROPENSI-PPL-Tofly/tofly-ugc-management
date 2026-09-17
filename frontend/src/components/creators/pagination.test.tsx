import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination } from "./pagination";

const replace = vi.fn();
let currentQuery = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/admin/creators",
  useSearchParams: () => new URLSearchParams(currentQuery),
}));

describe("Pagination", () => {
  beforeEach(() => {
    replace.mockClear();
    currentQuery = "";
  });

  it("says which slice of the result is on screen", () => {
    currentQuery = "page=2";
    render(<Pagination page={2} pageSize={10} total={25} totalPages={3} />);

    expect(screen.getByText("Menampilkan 11–20 dari 25 creator")).toBeInTheDocument();
    expect(screen.getByText("Halaman 2 dari 3")).toBeInTheDocument();
  });

  it("counts the last page by what is actually on it", () => {
    currentQuery = "page=3";
    render(<Pagination page={3} pageSize={10} total={25} totalPages={3} />);

    expect(screen.getByText("Menampilkan 21–25 dari 25 creator")).toBeInTheDocument();
  });

  it("goes forward", async () => {
    render(<Pagination page={1} pageSize={10} total={25} totalPages={3} />);

    await userEvent.click(screen.getByRole("button", { name: /berikutnya/i }));

    expect(replace).toHaveBeenCalledWith("/admin/creators?page=2");
  });

  it("goes back, dropping the page number on the way to the first page", async () => {
    currentQuery = "page=2";
    render(<Pagination page={2} pageSize={10} total={25} totalPages={3} />);

    await userEvent.click(screen.getByRole("button", { name: /sebelumnya/i }));

    expect(replace).toHaveBeenCalledWith("/admin/creators");
  });

  it("keeps the filters while paging", async () => {
    currentQuery = "q=rangga&contract=active";
    render(<Pagination page={1} pageSize={10} total={25} totalPages={3} />);

    await userEvent.click(screen.getByRole("button", { name: /berikutnya/i }));

    expect(replace).toHaveBeenCalledWith("/admin/creators?q=rangga&contract=active&page=2");
  });

  it("cannot go back from the first page or on from the last", () => {
    const { unmount } = render(<Pagination page={1} pageSize={10} total={25} totalPages={3} />);
    expect(screen.getByRole("button", { name: /sebelumnya/i })).toBeDisabled();
    unmount();

    render(<Pagination page={3} pageSize={10} total={25} totalPages={3} />);
    expect(screen.getByRole("button", { name: /berikutnya/i })).toBeDisabled();
  });

  it("stays out of the way when everything fits on one page", () => {
    const { container } = render(
      <Pagination page={1} pageSize={10} total={4} totalPages={1} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
