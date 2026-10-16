import { render, screen, within } from "@testing-library/react";
import { DEFAULT_MY_TASKS_PARAMS } from "@/lib/my-tasks";
import { TaskViewToggle } from "./task-view-toggle";

const BARE = DEFAULT_MY_TASKS_PARAMS;

describe("TaskViewToggle", () => {
  it("offers the table and then the calendar, as one named group", () => {
    render(<TaskViewToggle view="table" state={BARE} />);

    const group = screen.getByRole("group", { name: "Tampilan tugas" });

    expect(
      within(group)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Tabel", "Kalender"]);
  });

  it("marks the table as the view being shown", () => {
    render(<TaskViewToggle view="table" state={BARE} />);

    expect(screen.getByRole("link", { name: "Tabel" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Kalender" })).not.toHaveAttribute("aria-current");
  });

  it("marks the calendar as the view being shown", () => {
    render(<TaskViewToggle view="calendar" state={BARE} />);

    expect(screen.getByRole("link", { name: "Kalender" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Tabel" })).not.toHaveAttribute("aria-current");
  });

  it.each(["table", "calendar"] as const)("marks exactly one view on the %s view", (view) => {
    const { container } = render(<TaskViewToggle view={view} state={BARE} />);

    expect(container.querySelectorAll("[aria-current]")).toHaveLength(1);
  });

  it("fills the view being shown in brand blue, as every other current selection is", () => {
    render(<TaskViewToggle view="calendar" state={BARE} />);

    const on = screen.getByRole("link", { name: "Kalender" });
    const off = screen.getByRole("link", { name: "Tabel" });
    expect(on).toHaveClass("bg-accent", "text-accent-ink");
    expect(on).not.toHaveClass("bg-ink");
    expect(off).not.toHaveClass("bg-accent");
  });

  it("leads each link to its view of Task Saya", () => {
    render(<TaskViewToggle view="table" state={BARE} />);

    expect(screen.getByRole("link", { name: "Tabel" })).toHaveAttribute("href", "/creator/tasks");
    expect(screen.getByRole("link", { name: "Kalender" })).toHaveAttribute(
      "href",
      "/creator/tasks?view=calendar",
    );
  });

  it("keeps the status filter on both links", () => {
    render(<TaskViewToggle view="calendar" state={{ ...BARE, status: ["draft_revision"] }} />);

    expect(screen.getByRole("link", { name: "Tabel" })).toHaveAttribute(
      "href",
      "/creator/tasks?status=draft_revision",
    );
    expect(screen.getByRole("link", { name: "Kalender" })).toHaveAttribute(
      "href",
      "/creator/tasks?status=draft_revision&view=calendar",
    );
  });

  it("keeps the tab and the search on both links, and leaves the page behind", () => {
    render(<TaskViewToggle view="table" state={{ ...BARE, tab: "waiting", q: "serum", page: 2 }} />);

    expect(screen.getByRole("link", { name: "Tabel" })).toHaveAttribute(
      "href",
      "/creator/tasks?tab=waiting&q=serum",
    );
    expect(screen.getByRole("link", { name: "Kalender" })).toHaveAttribute(
      "href",
      "/creator/tasks?tab=waiting&q=serum&view=calendar",
    );
  });
});
