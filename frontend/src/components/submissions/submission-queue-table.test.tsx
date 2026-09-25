import { render, screen } from "@testing-library/react";
import { SubmissionQueueTable } from "./submission-queue-table";
import type { SubmissionQueueItem } from "@/lib/submissions";

const ITEMS: SubmissionQueueItem[] = [
  {
    submissionId: "111",
    creatorName: "Salsa Wijaya",
    contentName: "Evg_1_Salsa_15Sep2026",
    type: "Evergreen",
    deadline: "2026-09-15",
    status: "draft_review",
  },
  {
    submissionId: "222",
    creatorName: "Dimas Putra",
    contentName: "Product Review iPhone",
    type: "Specific",
    deadline: "2026-09-20",
    status: "draft_revised",
  },
];

describe("SubmissionQueueTable", () => {
  it("renders all five columns plus the action column", () => {
    render(<SubmissionQueueTable items={ITEMS} />);

    expect(screen.getByText("Nama Kreator")).toBeInTheDocument();
    expect(screen.getByText("Nama Konten")).toBeInTheDocument();
    expect(screen.getByText("Tipe")).toBeInTheDocument();
    expect(screen.getByText("Deadline")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Aksi")).toBeInTheDocument();
  });

  it("shows creator name, content name, type and formatted deadline", () => {
    render(<SubmissionQueueTable items={[ITEMS[0]]} />);

    expect(screen.getByText("Salsa Wijaya")).toBeInTheDocument();
    expect(screen.getByText("Evg_1_Salsa_15Sep2026")).toBeInTheDocument();
    expect(screen.getByText("Evergreen")).toBeInTheDocument();
    expect(screen.getByText("15 Sep 2026")).toBeInTheDocument();
  });

  it("shows 'Specific' for specific type", () => {
    render(<SubmissionQueueTable items={[ITEMS[1]]} />);

    expect(screen.getByText("Specific")).toBeInTheDocument();
  });

  it("shows 'Draft Menunggu Review' for draft_review status", () => {
    render(<SubmissionQueueTable items={[ITEMS[0]]} />);

    expect(screen.getByText("Draft Menunggu Review")).toBeInTheDocument();
  });

  it("shows 'Draft Revised' for draft_revised status", () => {
    render(<SubmissionQueueTable items={[ITEMS[1]]} />);

    expect(screen.getByText("Draft Revised")).toBeInTheDocument();
  });

  it("renders a 'Lihat Detail' button for each row", () => {
    render(<SubmissionQueueTable items={ITEMS} />);

    const buttons = screen.getAllByRole("button", { name: /lihat detail/i });
    expect(buttons).toHaveLength(2);
  });

  it("shows a 'no submissions' message when items is empty", () => {
    render(<SubmissionQueueTable items={[]} />);

    expect(screen.getByText(/tidak ada draft/i)).toBeInTheDocument();
  });
});
