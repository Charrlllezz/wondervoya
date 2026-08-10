import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getUserId } from "./user-session";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    console.error('API request failed:', res.status, text, res.url);
    throw new Error(`${res.status}: ${text}`);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
}

export async function apiRequest(
  endpoint: string,
  options: RequestOptions = {}
): Promise<any> {
  const { method = 'GET', ...otherOptions } = options;
  const clientUserId = getUserId();
  const config: any = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...otherOptions.headers,
    },
    ...otherOptions,
  };

  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    const requestData = otherOptions.body ? JSON.parse(otherOptions.body) : {};
    const dataWithUserId = { ...requestData, clientUserId };
    config.body = JSON.stringify(dataWithUserId);
  }

  const res = await fetch(endpoint, config);
  await throwIfResNotOk(res);
  return res.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey[0] as string;
    const clientUserId = getUserId();

    // Add clientUserId as query parameter for GET requests
    const separator = url.includes('?') ? '&' : '?';
    const urlWithUserId = `${url}${separator}clientUserId=${encodeURIComponent(clientUserId)}`;

    const res = await fetch(urlWithUserId, {
      credentials: "include",
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
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});