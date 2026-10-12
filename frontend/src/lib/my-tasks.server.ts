import { appSessionCookieHeader } from "./session-cookie";
import {
    MY_TASKS_PAGE_SIZE,
    MyTasksError,
    type MyTasksParams,
    type MyTasksResponse,
} from "./my-tasks";
import { API_TABS, toMyContentsQuery, toMyTasksResponse, type RawMyContents } from "./my-tasks-api";

/** Sent when a 200 carries a body the page cannot use. */
const UNUSABLE_ANSWER = 502;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Just what the page relies on to render without crashing: a list of tasks, each with an id
 * for its row key and a list of actions, numeric paging, and a number for every tab's badge.
 */
function isRawMyContents(body: unknown): body is RawMyContents {
    if (!isRecord(body) || !Array.isArray(body.items)) return false;

    const paging = [body.page, body.pageSize, body.total, body.totalPages];
    if (!paging.every((value) => typeof value === "number")) return false;

    const counts = body.tabCounts;
    if (!isRecord(counts) || !API_TABS.every((tab) => typeof counts[tab] === "number")) return false;

    return body.items.every(
        (item) => isRecord(item) && typeof item.id === "string" && Array.isArray(item.actions),
    );
}

/**
 * Server-side only: talks to the backend directly so its address never reaches the browser.
 * The backend resolves whose tasks these are from the forwarded application session (OWASP A01).
 * Named periods ("30 hari ke depan") are counted from `today`, Jakarta time. The table reads
 * its own page size; the calendar asks for more rows at once.
 */
export async function fetchMyTasks(
    state: MyTasksParams,
    today: string,
    pageSize: number = MY_TASKS_PAGE_SIZE,
): Promise<MyTasksResponse> {
    const backendUrl = process.env.BACKEND_URL;

    if (!backendUrl) {
        throw new Error("BACKEND_URL is not configured");
    }

    const base = backendUrl.endsWith("/") ? backendUrl.slice(0, -1) : backendUrl;
    const query = toMyContentsQuery(state, today, pageSize);

    const cookie = await appSessionCookieHeader();
    const headers = cookie ? { cookie } : undefined;

    const response = await fetch(`${base}/me/contents?${query}`, {
        cache: "no-store",
        ...(headers && { headers }),
    });

    if (!response.ok) {
        throw new MyTasksError(response.status);
    }

    const body: unknown = await response.json();

    if (!isRawMyContents(body)) {
        throw new MyTasksError(UNUSABLE_ANSWER);
    }

    return toMyTasksResponse(body);
}
