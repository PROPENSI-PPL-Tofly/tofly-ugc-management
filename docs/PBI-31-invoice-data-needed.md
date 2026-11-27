# PBI-31: data to ask Tofly for (invoice & receipt PDF)

Tofly is a PT Perorangan. The invoice and receipt PDFs already print a placeholder in square
brackets for each item below. Once Tofly provides an item, replace its placeholder in
`backend/src/invoices/invoice-placeholders.ts` (one place for all of them).

## 1. Tofly as the issuer ("Dari" on both documents)

| Item | Placeholder now | Where it goes |
| --- | --- | --- |
| Name of the PT exactly as on the PT Perorangan certificate | `[Nama PT sesuai sertifikat PT Perorangan]` | `TOFLY_ISSUER.name` |
| Registered address (each printed line separately) | `[Alamat terdaftar PT]`, `[Kota, kode pos]` | `TOFLY_ISSUER.address` |
| NPWP of the PT (16 digits) | `[NPWP badan, 16 digit]` | `TOFLY_ISSUER.npwp` |
| Finance email creators can write to | `[Email finance Tofly]` | `TOFLY_ISSUER.email` |

## 2. Tax on what Tofly pays creators (a decision, not only data)

- **Does Tofly withhold PPh 21 from creators?** Content creators and influencers count as
  "bukan pegawai" under PMK 168/2023: PPh 21 = Pasal 17 rate × 50% of gross. A creator paid
  through a management company or other entity is PPh 23 instead.
- If yes, the PDFs need two real rows instead of `[Menunggu keputusan PPh 21]`
  (`WITHHOLDING_PLACEHOLDER`): "PPh 21 dipotong" and "Jumlah diterima creator". The amounts then
  have to be calculated by the app, which changes what is paid: this needs its own PBI.
- If yes, Tofly also issues a bukti potong for each creator through Coretax. The receipt is not
  a bukti potong.
- To confirm with a tax consultant or the KPP before it becomes an AC.

## 3. Creator data the app does not keep yet

| Item | Why | Placeholder now |
| --- | --- | --- |
| NIK or NPWP | A bukti potong must name one; without a valid NIK the rate can be 20% higher | `[NIK/NPWP creator]` (`CREATOR_TAX_ID_PLACEHOLDER`) |
| Name as on the KTP | The bukti potong and the transfer | none yet (the app's name is used) |
| Bank, account number, account holder | Shown on the receipt ("Dibayarkan ke rekening") | `[Bank · nomor rekening · atas nama]` (`CREATOR_BANK_PLACEHOLDER`) |

Collecting these needs fields in Tambah Creator / the creator's profile, and they are personal
data (UU PDP): stored encrypted or at least access-restricted, shown only to Admin and the creator.

**TODO (reminder from Kania, 25 Nov 2026): the creator needs an entry point of their own** to
fill in and update their bank account and NIK/NPWP, not only the Admin through Tambah Creator.
Not built yet and not in any PBI: it needs its own PBI (where it lives on the creator's side,
e.g. a profile/settings page or a prompt before the first payment; validation of NIK (16 digits)
and the account; who may change it once an invoice is paid; and how a change is recorded). When
it exists, the receipt and the bukti potong read from it and the two placeholders go.

## 4. Tofly's own tax status (affects the documents only indirectly)

- Does Tofly use the 0.5% final PPh for UMKM (PP 55/2022, time limit possibly changed by
  PP 20/2026)? Confirm with DJP.
- Is Tofly a PKP? PPN only matters for a PKP; on a payout to creators it normally does not appear
  on Tofly's side, but confirm.

## Decided so far (25 Nov 2026)

- Invoice PDF: downloadable once the creator acknowledged it (Di-acknowledge, Bukti Bayar
  Terkirim, Paid), so no adjustment can change it after it is shared. Issue date = acknowledge day.
- Receipt PDF: downloadable once Paid, with every content line as the invoice has (as Stripe's receipt repeats its invoice's items), so it stands on its own. Payment method "Transfer bank" with the day the proof was uploaded.
- Numbers follow the document, not Finalize: TOF-INV-YYYYMM-NNN when the creator acknowledges
  (the issue day), TOF-RCP-YYYYMM-NNN when the payment is confirmed, each with its own monthly
  counter. So TOF-RCP-202612-001 can belong to TOF-INV-202611-007.
- PDFs are made again on every download from the frozen snapshot (not stored). The amounts never
  change; the layout follows the current template.
- Subtotal (the parts before adjustments) stays on both documents.
- Content lines worth Rp0 (a late Specific, a link with no data) are left out of the PDFs; the
  screen keeps them. No explanatory notes (no "Total ditahan…", no "sebagian data belum ada").
- Pembayaran's Paid filter now also lists an earlier period's paid invoice, so its invoice and
  receipt can be downloaded; the default list still leaves it out.
- PBI-32: its corrections happen before the creator acknowledges, and the invoice is only issued
  after, so an issued PDF never changes. Still to do when 32.1 lands: PBI-31 AC 4 ("Diubah Admin"
  on a corrected line), once 32.1 settles how a correction is kept in the snapshot.
- Jira to update: PBI-31 AC 1 and AC 5 (still "Unduh PDF … Final or later"), AC 4 wording, and
  31.1's done-when ("Invoice number assigned at finalize" is now at acknowledge).
