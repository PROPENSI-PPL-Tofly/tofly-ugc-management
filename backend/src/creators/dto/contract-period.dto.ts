// The answer to creating or editing a contract period (PBI-30). The request body uses the contract
// fields of the Tambah Creator form (contractType, contractStart, contractEnd, interval, quota,
// fixedRate, deadlines) under the same names, so the "Perpanjang Kontrak" form can reuse them.

export interface SavedPeriodContent {
  id: string;
  name: string;
  /** ISO calendar day (`YYYY-MM-DD`). */
  deadline: string;
}

export interface SavedPeriod {
  contractId: string;
  /** The period's own invoice; null only for a row saved before periods had one. */
  invoiceId: string | null;
  startDate: string;
  endDate: string;
  /** The Evergreen schedule, earliest first. */
  contents: SavedPeriodContent[];
}
