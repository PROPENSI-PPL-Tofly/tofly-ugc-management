import { render, screen } from "@testing-library/react";
import { TaskSummary } from "./task-summary";

const base = { name: "Promo Lebaran", deadline: "2026-10-05", brief: "Tunjukkan kemasan" };

describe("TaskSummary", () => {
  it("shows the content name, its formatted deadline and the brief", () => {
    render(<TaskSummary content={base} />);

    expect(screen.getByText("Nama Konten")).toBeInTheDocument();
    expect(screen.getByText("Promo Lebaran")).toBeInTheDocument();
    expect(screen.getByText("5 Okt 2026")).toBeInTheDocument();
    expect(screen.getByText("Brief")).toBeInTheDocument();
    expect(screen.getByText("Tunjukkan kemasan")).toBeInTheDocument();
  });

  it("keeps the brief's own line breaks", () => {
    render(<TaskSummary content={{ ...base, brief: "Baris satu\nBaris dua" }} />);

    expect(screen.getByText(/Baris satu/)).toHaveClass("whitespace-pre-line");
  });

  it("shows a dash for an empty brief rather than a blank field", () => {
    render(<TaskSummary content={{ ...base, brief: "  " }} />);

    expect(screen.getByText("Brief").nextElementSibling).toHaveTextContent("—");
  });

  it("shows a dash when no brief is given at all", () => {
    render(<TaskSummary content={{ name: "Promo", deadline: "2026-10-05" }} />);

    expect(screen.getByText("Brief").nextElementSibling).toHaveTextContent("—");
  });

  it("shows what the admin asked to change when there are revision notes", () => {
    render(<TaskSummary content={{ ...base, revisionNotes: "Perjelas intro" }} />);

    expect(screen.getByText("Catatan Revisi dari Admin")).toBeInTheDocument();
    expect(screen.getByText("Perjelas intro")).toBeInTheDocument();
  });

  it.each([null, undefined, "   "])("leaves out the revision block for %j notes", (notes) => {
    render(<TaskSummary content={{ ...base, revisionNotes: notes }} />);

    expect(screen.queryByText("Catatan Revisi dari Admin")).not.toBeInTheDocument();
  });
});
