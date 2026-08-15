import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { DEVICE_HEADER, getDeviceId } from "./device";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // The API returns { message } for anything a person should read. Prefer
    // that over the raw body, which is JSON noise in an alert.
    let message = res.statusText;
    const body = await res.text();
    if (body) {
      try {
        const parsed = JSON.parse(body);
        message = parsed?.message ?? body;
      } catch {
        message = body;
      }
    }
    throw new Error(message);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = { [DEVICE_HEADER]: getDeviceId() };
  if (data) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

/**
 * Query keys are path segments, optionally ending in a params object:
 *   ["/api/airports"]                        -> /api/airports
 *   ["/api/airports", "LAX"]                 -> /api/airports/LAX
 *   ["/api/airports", { line: "clear" }]     -> /api/airports?line=clear
 */
function urlFromQueryKey(queryKey: readonly unknown[]): string {
  const segments: string[] = [];
  let search = "";

  for (const part of queryKey) {
    if (part === undefined || part === null) continue;
    if (typeof part === "object") {
      const params = new URLSearchParams(
        Object.entries(part as Record<string, string>).filter(
          ([, value]) => value !== undefined && value !== null && value !== "",
        ),
      );
      const query = params.toString();
      if (query) search = `?${query}`;
      continue;
    }
    segments.push(encodeURIComponent(String(part)).replace(/%2F/gi, "/"));
  }

  return segments.join("/") + search;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(urlFromQueryKey(queryKey), {
      credentials: "include",
      headers: { [DEVICE_HEADER]: getDeviceId() },
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      // People check this app immediately before leaving for the airport.
      // Coming back to the tab should show a current number, not the one from
      // whenever they last looked.
      refetchOnWindowFocus: true,
      staleTime: 15_000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
