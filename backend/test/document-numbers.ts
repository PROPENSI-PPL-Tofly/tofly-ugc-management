// Document numbers for e2e fixtures that write an acknowledged or paid invoice straight into the
// database (PBI-31): the database requires an issued invoice to carry its invoice number and a
// paid one its receipt number. The month 209912 is one no real invoice reaches, and the process id
// keeps two runs apart, so a fixture never collides with a number the app hands out.

let issued = 0;

export function fixtureNumber(kind: 'invoice' | 'receipt'): string {
  issued += 1;
  const prefix = kind === 'invoice' ? 'TOF-INV' : 'TOF-RCP';
  return `${prefix}-209912-${process.pid}${String(issued).padStart(3, '0')}`;
}

/** The numbers an invoice in `status` must carry, as the database requires. */
export function numbersFor(status: string): {
  invoice_number: string | null;
  receipt_number: string | null;
} {
  const issuedStatuses = ['creator_acked', 'payment_uploaded', 'paid'];
  return {
    invoice_number: issuedStatuses.includes(status) ? fixtureNumber('invoice') : null,
    receipt_number: status === 'paid' ? fixtureNumber('receipt') : null,
  };
}
