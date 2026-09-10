// Same-origin proxy: the browser only ever calls /api/* on this app, and the
// Next server forwards to the backend. That keeps the backend URL a runtime
// value (see below) and means nothing calls the API cross-origin, so the
// backend needs no CORS in production.

// Without this Next tries to evaluate the route at build time, which would both
// fail and defeat the point of reading BACKEND_URL per request.
export const dynamic = "force-dynamic";

// Hop-by-hop headers describe the browser→frontend connection, not the
// frontend→backend one. Forwarding them corrupts the upstream request.
const STRIP_REQUEST_HEADERS = new Set(["host", "connection", "content-length"]);

// fetch() has already decoded and framed the upstream body, so replaying the
// encoding headers verbatim would tell the browser to decode it a second time.
const STRIP_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
]);

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, context: RouteContext): Promise<Response> {
  // Read inside the handler, not at module scope: BACKEND_URL is a plain
  // runtime env var on the Cloud Run service, so a module-scope read would bake
  // in whatever the value was when the image was built.
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return Response.json(
      { error: "Bad gateway", detail: "BACKEND_URL is not configured" },
      { status: 502 },
    );
  }

  const { path } = await context.params;
  const target = new URL(path.join("/"), `${backendUrl.replace(/\/+$/, "")}/`);
  target.search = new URL(request.url).search;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
    });
  } catch (error) {
    // A dead or unreachable backend surfaces as a clean 502 rather than an
    // unhandled rejection and a generic Next error page.
    return Response.json(
      {
        error: "Bad gateway",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const name = key.toLowerCase();
    // Set-Cookie is the one header that legitimately repeats, and set() would
    // keep only the last one. Handled separately below.
    if (name === "set-cookie") return;
    if (!STRIP_RESPONSE_HEADERS.has(name)) responseHeaders.set(key, value);
  });

  // getSetCookie() returns each cookie intact. Reading them off the iterator
  // instead risks a single comma-joined string, which cannot be split back
  // apart safely because Expires dates contain commas.
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append("set-cookie", cookie);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
