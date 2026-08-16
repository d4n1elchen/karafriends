import { invariant } from "ts-invariant";
import { reportClientError, reportClientRecovered } from "./clientError";
import { getRemoteAccessToken, getRoomId } from "./roomId";

import { createClient } from "graphql-ws";
import {
  Environment,
  Network,
  Observable,
  RecordSource,
  RequestParameters,
  Store,
  Variables,
} from "relay-runtime";

const REQUEST_TIMEOUT_MS = 20_000;

async function fetchQuery(request: RequestParameters, variables: Variables) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const remoteToken = getRemoteAccessToken();
    const response = await fetch(
      window.karafriends?.isDesktop
        ? `http://localhost:${
            window.karafriends.karafriendsConfig().remoconPort
          }/graphql`
        : "/graphql",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Karafriends-Room": getRoomId(),
          ...(remoteToken ? { "X-Karafriends-Remote-Token": remoteToken } : {}),
        },
        body: JSON.stringify({
          query: request.text,
          variables,
        }),
        signal: controller.signal,
      },
    );

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`Karaoke server returned HTTP ${response.status}.`);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new Error("The karaoke server returned an invalid response.");
    }

    if (
      payload &&
      typeof payload === "object" &&
      "errors" in payload &&
      Array.isArray(payload.errors) &&
      payload.errors.length > 0
    ) {
      const firstError = payload.errors[0];
      reportClientError(
        firstError && typeof firstError === "object" && "message" in firstError
          ? String(firstError.message)
          : "The karaoke server could not complete the request.",
      );
    } else {
      reportClientRecovered();
    }

    return payload;
  } catch (error) {
    reportClientError(error);
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function getSubscriptionUrl(): string {
  if (window.karafriends?.isDesktop) {
    return `ws://localhost:${
      window.karafriends.karafriendsConfig().remoconPort
    }/graphql`;
  }

  const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";

  return `${wsProtocol}://${window.location.hostname}:${window.location.port}/graphql`;
}

const subscriptionClient = createClient({
  url: getSubscriptionUrl(),
  connectionParams: () => ({
    roomId: getRoomId(),
    remoteToken: getRemoteAccessToken(),
  }),
  shouldRetry: () => true,
  on: {
    connected: () => reportClientRecovered(),
    error: (error) => reportClientError(error),
    closed: (event) => {
      const closeEvent = event as { code?: number; reason?: string };
      if (closeEvent.code !== 1000)
        reportClientError(closeEvent.reason || "WebSocket closed");
    },
  },
});

const subscribe = (operation: RequestParameters, variables: Variables) => {
  return Observable.create((sink) => {
    invariant(operation.text);

    return subscriptionClient.subscribe(
      {
        operationName: operation.name,
        query: operation.text,
        variables,
      },
      sink,
    );
  });
};

const environment = new Environment({
  // @ts-ignore: the relay type stubs are pitifully broken
  network: Network.create(fetchQuery, subscribe),
  store: new Store(new RecordSource()),
});

export default environment;
