import type { CreatorInvoice } from "./creator-invoice";
import { CreatorInvoicesError } from "./creator-invoice";
import { fetchMyInvoices } from "./creator-invoice.server";
import { loadProposalWindow } from "./creator-proposal.server";
import { fetchDeadlineBuffer } from "./deadline-buffer.server";

vi.mock("./creator-invoice.server", () => ({ fetchMyInvoices: vi.fn() }));
vi.mock("./deadline-buffer.server", () => ({ fetchDeadlineBuffer: vi.fn() }));

const invoices = vi.mocked(fetchMyInvoices);
const buffer = vi.mocked(fetchDeadlineBuffer);

const TODAY = "2026-11-16";

function running(): CreatorInvoice {
  return {
    contractId: "11111111-1111-4111-8111-111111111111",
    periodNumber: 1,
    periodStart: "2026-10-01",
    periodEnd: "2026-12-31",
    notStarted: false,
    status: "accruing",
  } as CreatorInvoice;
}

// PBI-14 (14.2): the window the form opens on, read while Task Saya renders.
describe("loadProposalWindow", () => {
  it("draws the window from the running contract and the buffer a Super Admin set", async () => {
    invoices.mockResolvedValue([running()]);
    buffer.mockResolvedValue(7);

    await expect(loadProposalWindow(TODAY)).resolves.toEqual({ first: "2026-11-23", last: "2026-12-24" });
  });

  // AC 3: no running contract, no button.
  it("has no window for a creator without a running contract", async () => {
    invoices.mockResolvedValue([{ ...running(), status: "paid" }]);
    buffer.mockResolvedValue(5);

    await expect(loadProposalWindow(TODAY)).resolves.toBeNull();
  });

  // A failed read hides the button rather than taking Task Saya down; the list still loads.
  it("has no window when the invoices cannot be read", async () => {
    invoices.mockRejectedValue(new CreatorInvoicesError(500));
    buffer.mockResolvedValue(5);

    await expect(loadProposalWindow(TODAY)).resolves.toBeNull();
  });
});
