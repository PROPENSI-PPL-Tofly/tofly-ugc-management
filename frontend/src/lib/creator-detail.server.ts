// Server-side only: one creator's detail, fetched while the page renders. It reads the
// browser's session through next/headers, which client components cannot import, so it lives
// apart from the shared creator-detail module.
//
// Two endpoints of subtask 4.1 answer the page: GET /creators/:id names the creator and their
// contract periods, and GET /contents?contract= lists one page of the open period's content.
// Their queries and answers are spelled in the API's own words, so both pass through
// creator-detail-api, the one module that knows them.

import type { RawContentList, RawContentListItem } from "./content-list-api";
import { isUuid, type CreatorDetailParams, type CreatorDetailView } from "./creator-detail";
import {
  openContractId,
  toCreatorCalendarQuery,
  toCreatorContentsQuery,
  toCreatorDetailView,
  type RawCreatorDetail,
  type RawPeriodInvoice,
} from "./creator-detail-api";
import { jakartaDay } from "./format";
import { appSessionCookieHeader } from "./session-cookie";

function withoutTrailingSlash(url: string): string {
  let end = url.length;

  while (end > 0 && url[end - 1] === "/") {
    end -= 1;
  }

  return url.slice(0, end);
}

/**
 * The creator's profile, contract history and the open contract's content, or null when there
 * is no such creator. Any other failure throws, so the page offers a retry rather than telling
 * the admin a creator is gone, or a period is empty, when it was the request that failed.
 *
 * This app talks to the backend directly, so the address never reaches the browser.
 * BACKEND_URL is read per call because it is a plain runtime variable on the deployed service;
 * a module-scope read would freeze whatever it was at build time.
 */
export async function fetchCreatorDetail(
  id: string,
  state: CreatorDetailParams,
): Promise<CreatorDetailView | null> {
  // The id comes from the address bar. One that is not an id names no creator, and is never
  // put into a request path to find that out (OWASP A03).
  if (!isUuid(id)) return null;

  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    throw new Error("BACKEND_URL is not configured");
  }

  const backend = withoutTrailingSlash(backendUrl);
  const today = jakartaDay();

  // Admin-only: each request carries the browser's session, and only it (OWASP A01).
  const cookie = await appSessionCookieHeader();
  const read = (path: string) =>
    fetch(`${backend}${path}`, {
      cache: "no-store",
      ...(cookie && { headers: { cookie } }),
    });

  const detail = await read(`/creators/${encodeURIComponent(id)}`);

  if (detail.status === 404) return null;

  if (!detail.ok) {
    throw new Error(`Loading creator detail failed with HTTP ${detail.status}`);
  }

  const raw = (await detail.json()) as RawCreatorDetail;

  // Which contract is open is only known once the creator's own contracts are: the content is
  // asked for by one of those, never by whatever the address named.
  const contract = openContractId(raw, state);

  if (contract === null) return toCreatorDetailView(raw, null, state);

  const readContents = async (wanted: CreatorDetailParams): Promise<RawContentList> => {
    const response = await read(`/contents?${toCreatorContentsQuery(contract, wanted, today)}`);

    if (!response.ok) {
      throw new Error(`Loading the creator's content failed with HTTP ${response.status}`);
    }

    return (await response.json()) as RawContentList;
  };

  /** Every row in the period, paged in the API's maximum batches for the calendar. */
  const readCalendar = async (): Promise<RawContentListItem[]> => {
    const page = async (number: number): Promise<RawContentList> => {
      const response = await read(`/contents?${toCreatorCalendarQuery(contract, number, today)}`);
      if (!response.ok) {
        throw new Error(`Loading the period's calendar failed with HTTP ${response.status}`);
      }
      return (await response.json()) as RawContentList;
    };

    const first = await page(1);
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, index) => page(index + 2)),
    );
    return [first, ...rest].flatMap((answer) => answer.items);
  };

  /** Invoice failures affect only the earnings card; the rest of the creator view stays usable. */
  const readInvoice = async (): Promise<RawPeriodInvoice | null> => {
    try {
      const response = await read(
        `/invoices/${encodeURIComponent(id)}?${new URLSearchParams({ contract })}`,
      );
      return response.ok ? ((await response.json()) as RawPeriodInvoice) : null;
    } catch {
      return null;
    }
  };

  const [firstRead, calendar, invoice] = await Promise.all([
    readContents(state),
    readCalendar(),
    readInvoice(),
  ]);
  let contents = firstRead;

  // A page past the end (an old link, or a period that shrank as content was decided) comes
  // back with no rows, which would read as a period without content. Its last page is asked
  // for instead, once: if the period shrank again meanwhile, the answer is shown as it is.
  if (contents.total > 0 && contents.page > contents.totalPages) {
    contents = await readContents({ ...state, page: contents.totalPages });
  }

  return toCreatorDetailView(raw, contents, state, calendar, invoice);
}
