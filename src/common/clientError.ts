export const CLIENT_ERROR_EVENT = "karafriends:client-error";
export const CLIENT_RECOVERED_EVENT = "karafriends:client-recovered";

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
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<string>(CLIENT_ERROR_EVENT, {
      detail: toUserErrorMessage(reason),
    }),
  );
}

export function reportClientRecovered(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CLIENT_RECOVERED_EVENT));
}
