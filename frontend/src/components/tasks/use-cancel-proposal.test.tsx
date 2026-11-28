import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useCancelProposal, type ProposalToCancel } from "./use-cancel-proposal";

// The request is stubbed: cancel-proposal.test covers it.
const { cancelProposal } = vi.hoisted(() => ({ cancelProposal: vi.fn() }));
vi.mock("@/lib/cancel-proposal", () => ({
  cancelProposal: (id: string) => cancelProposal(id),
}));

const PROPOSAL: ProposalToCancel = { id: "proposal-1", name: "Review Paket Kilat" };
const OTHER: ProposalToCancel = { id: "proposal-2", name: "Unboxing Serum" };

/** A host with one "ask" button per proposal, showing which ones are on their way. */
function Host({ onCancelled = vi.fn(), onFailed = vi.fn() }) {
  const withdrawal = useCancelProposal({ onCancelled, onFailed });
  return (
    <>
      {[PROPOSAL, OTHER].map((proposal) => (
        <button key={proposal.id} type="button" onClick={() => withdrawal.ask(proposal)}>
          {`ask ${proposal.id}${withdrawal.isWithdrawing(proposal.id) ? " (sending)" : ""}`}
        </button>
      ))}
      {withdrawal.dialog}
    </>
  );
}

function confirm() {
  const dialog = screen.getByRole("alertdialog", { name: "Batalkan Pengajuan?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Batalkan Pengajuan" }));
}

// Review on #270 (Rani): the dialog closes before the answer comes back, so a second confirmation
// sent a second DELETE and toasted "tidak ditemukan" over a withdrawal that had worked.
describe("useCancelProposal, one withdrawal at a time", () => {
  let answer: (value: { ok: true }) => void;

  beforeEach(() => {
    cancelProposal.mockReset().mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
  });

  it("asks nothing again about a proposal already on its way", async () => {
    render(<Host />);

    fireEvent.click(screen.getByRole("button", { name: "ask proposal-1" }));
    confirm();
    fireEvent.click(await screen.findByRole("button", { name: "ask proposal-1 (sending)" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(cancelProposal).toHaveBeenCalledOnce();
  });

  it("still asks about another proposal meanwhile", async () => {
    render(<Host />);

    fireEvent.click(screen.getByRole("button", { name: "ask proposal-1" }));
    confirm();
    fireEvent.click(await screen.findByRole("button", { name: "ask proposal-2" }));

    expect(screen.getByRole("alertdialog")).toHaveTextContent('"Unboxing Serum" akan dihapus dari daftar.');
  });

  it("lets it be asked about again once the answer is in", async () => {
    const onCancelled = vi.fn();
    render(<Host onCancelled={onCancelled} />);

    fireEvent.click(screen.getByRole("button", { name: "ask proposal-1" }));
    confirm();
    await act(async () => answer({ ok: true }));

    expect(onCancelled).toHaveBeenCalledExactlyOnceWith(PROPOSAL);
    fireEvent.click(screen.getByRole("button", { name: "ask proposal-1" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
