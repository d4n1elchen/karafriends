export const CLIENT_ERROR_EVENT = "karafriends:client-error";
export const CLIENT_RECOVERED_EVENT = "karafriends:client-recovered";

let currentClientError: string | null = null;
let authorizationRequired = false;
const statusListeners = new Set<() => void>();

function notifyStatusListeners(): void {
  statusListeners.forEach((listener) => listener());
}

export function getClientError(): string | null {
  return currentClientError;
}

export function isAuthorizationRequired(): boolean {
  return authorizationRequired;
}

export function subscribeClientStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function toUserErrorMessage(reason: unknown): string {
  if (reason instanceof DOMException && reason.name === "AbortError") {
    return "The karaoke server took too long to respond.";
  }

  const message = reason instanceof Error ? reason.message : String(reason);
  if (/failed to fetch|networkerror|network request failed/i.test(message)) {
    return "The karaoke server cannot be reached. Check your connection and try again.";
  }
  if (/websocket|socket|closed before the connection/i.test(message)) {
    return "The live connection to the karaoke server was interrupted.";
  }
  if (message && message !== "[object Object]") {
    return message;
  }
  return "Something went wrong while contacting the karaoke server.";
}

export function reportClientError(reason: unknown): void {
  currentClientError = toUserErrorMessage(reason);
  notifyStatusListeners();
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<string>(CLIENT_ERROR_EVENT, {
      detail: currentClientError,
    }),
  );
}

export function reportAuthorizationRequired(): void {
  authorizationRequired = true;
  currentClientError = "This remote link has expired.";
  notifyStatusListeners();
}

export function reportClientRecovered(): void {
  if (authorizationRequired) return;
  currentClientError = null;
  notifyStatusListeners();
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CLIENT_RECOVERED_EVENT));
}
