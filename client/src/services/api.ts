import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.DEV ? "/api/v1" : import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export function getApiError(error: unknown) {
  if (axios.isAxiosError<{ error?: { message?: string } }>(error)) {
    return error.response?.data.error?.message ?? error.message;
  }
  return error instanceof Error ? error.message : "An unexpected error occurred";
}
