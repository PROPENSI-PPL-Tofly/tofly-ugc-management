import { render, screen } from "@testing-library/react";
import { myTask } from "@/components/tasks/task.fixture";
import MyTasksPage from "./page";

const fetchMyTasks = vi.fn();

vi.mock("@/lib/tasks", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tasks")>("@/lib/tasks");
  return { ...actual, fetchMyTasks: (...args: unknown[]) => fetchMyTasks(...args) };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/creator/tasks",
  useSearchParams: () => new URLSearchParams(),
}));

describe("MyTasksPage", () => {
  beforeEach(() => {
    fetchMyTasks.mockReset();
  });

  it("asks for the page the URL describes", async () => {
    fetchMyTasks.mockResolvedValue({ items: [], page: 2, pageSize: 5, total: 6, totalPages: 2 });

    render(await MyTasksPage({ searchParams: Promise.resolve({ page: "2" }) }));

    expect(fetchMyTasks).toHaveBeenCalledWith(2);
  });

  it("renders the task list inside the creator shell", async () => {
    fetchMyTasks.mockResolvedValue({
      items: [myTask()],
      page: 1,
      pageSize: 5,
      total: 7,
      totalPages: 2,
    });

    render(await MyTasksPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Task Saya", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Task Saya" })).toHaveAttribute("href", "/creator/tasks");
    expect(screen.getByLabelText("Creator")).toBeInTheDocument();
    expect(screen.getByText("Evergreen - Review Fitur Tobi AI")).toBeInTheDocument();
    expect(screen.getByText("Menampilkan 1–5 dari 7 tugas")).toBeInTheDocument();
  });

  it("explains when the list cannot be loaded instead of crashing", async () => {
    fetchMyTasks.mockRejectedValue(new Error("Loading tasks failed with HTTP 401"));

    render(await MyTasksPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("alert")).toHaveTextContent("Daftar tugas tidak dapat dimuat");
  });
});
