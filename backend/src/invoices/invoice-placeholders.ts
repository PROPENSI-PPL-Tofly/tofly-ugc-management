// Placeholders on the invoice and receipt PDFs (PBI-31) for what Tofly has not provided yet.
// Each is hard-coded here, in one place, and is to be replaced by the real value once Tofly
// sends it: the list of what to ask for is docs/PBI-31-invoice-data-needed.md. The square
// brackets keep a placeholder from ever reading as real data on a printed page.

/** Tofly as the issuer: its PT Perorangan's name, registered address, NPWP and finance email. */
export const TOFLY_ISSUER = {
  name: '[Nama PT sesuai sertifikat PT Perorangan]',
  /** One entry per printed line. */
  address: ['[Alamat terdaftar PT]', '[Kota, kode pos]'],
  npwp: '[NPWP badan, 16 digit]',
  email: '[Email finance Tofly]',
} as const;

/** The creator's NIK or NPWP, which a PPh 21 withholding slip needs; the app does not keep it yet. */
export const CREATOR_TAX_ID_PLACEHOLDER = '[NIK/NPWP creator]';

/** The account the creator is paid to; the app does not keep it yet. */
export const CREATOR_BANK_PLACEHOLDER = '[Bank · nomor rekening · atas nama]';

/** The PPh 21 withheld and the amount the creator receives, until Tofly decides on withholding. */
export const WITHHOLDING_PLACEHOLDER = '[Menunggu keputusan PPh 21]';
