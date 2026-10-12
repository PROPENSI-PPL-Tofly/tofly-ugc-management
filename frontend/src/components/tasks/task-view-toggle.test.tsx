import { render, screen, within } from "@testing-library/react";
import { TaskViewToggle } from "./task-view-toggle";

describe("TaskViewToggle", () => {
  it("offers the table and then the calendar, as one named group", () => {
    render(<TaskViewToggle view="table" status={null} />);

    const group = screen.getByRole("group", { name: "Tampilan tugas" });

    expect(
      within(group)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Tabel", "Kalender"]);
  });

  it("marks the table as the view being shown", () => {
    render(<TaskViewToggle view="table" status={null} />);

    expect(screen.getByRole("link", { name: "Tabel" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Kalender" })).not.toHaveAttribute("aria-current");
  });

  it("marks the calendar as the view being shown", () => {
    render(<TaskViewToggle view="calendar" status={null} />);

    expect(screen.getByRole("link", { name: "Kalender" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Tabel" })).not.toHaveAttribute("aria-current");
  });

  it.each(["table", "calendar"] as const)("marks exactly one view on the %s view", (view) => {
    const { container } = render(<TaskViewToggle view={view} status={null} />);

    expect(container.querySelectorAll("[aria-current]")).toHaveLength(1);
  });

  it("leads each link to its view of Task Saya", () => {
    render(<TaskViewToggle view="table" status={null} />);

    expect(screen.getByRole("link", { name: "Tabel" })).toHaveAttribute("href", "/creator/tasks");
    expect(screen.getByRole("link", { name: "Kalender" })).toHaveAttribute(
      "href",
      "/creator/tasks?view=calendar",
    );
  });

  it("keeps the status filter on both links", () => {
    render(<TaskViewToggle view="calendar" status="draft_revision" />);

    expect(screen.getByRole("link", { name: "Tabel" })).toHaveAttribute(
      "href",
      "/creator/tasks?status=draft_revision",
    );
    expect(screen.getByRole("link", { name: "Kalender" })).toHaveAttribute(
      "href",
      "/creator/tasks?status=draft_revision&view=calendar",
    );
  });
});
