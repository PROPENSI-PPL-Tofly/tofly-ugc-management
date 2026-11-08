import { Fragment } from "react";
import { PRODUCTIVITY_BANDS } from "@/lib/creator-detail";

/**
 * What the ⓘ beside Produktivitas says: one band per line, its name first, so the rules can be
 * scanned instead of read as one paragraph. Plain text broken by <br>, not one element per line:
 * the button reads the bubble as its description, and text is what a description is made of.
 */
export function ProductivityTip() {
  return PRODUCTIVITY_BANDS.map(({ label, rule }, index) => (
    <Fragment key={label}>
      {index > 0 ? <br /> : null}
      {`${label}: ${rule}`}
      {index < PRODUCTIVITY_BANDS.length - 1 ? " " : null}
    </Fragment>
  ));
}
