import * as Sentry from "@sentry/browser";
import React from "react";
import { createRoot } from "react-dom/client"; // tslint:disable-line:no-submodule-imports
import { RelayEnvironmentProvider } from "react-relay";

import environment from "../common/graphqlEnvironment";
import { reportClientError } from "../common/clientError";
import App from "./App";
import ConnectionBanner from "./components/ConnectionBanner";
import RemoteErrorBoundary from "./components/RemoteErrorBoundary";
import "./index.module.scss";

Sentry.init({
  dsn: "https://80cbda8ca4af42d9b95c60eb1f00566f@sentry.io/6728669",
  debug: true,
});

window.addEventListener("unhandledrejection", (event) => {
  reportClientError(event.reason);
  Sentry.captureException(event.reason);
  event.preventDefault();
});

window.addEventListener("error", (event) => {
  if (!event.error) return;
  reportClientError(event.error);
  Sentry.captureException(event.error);
  event.preventDefault();
});

const container = document.getElementById("root");
const root = createRoot(container!);

root.render(
  <React.StrictMode>
    <RemoteErrorBoundary>
      <ConnectionBanner />
      <RelayEnvironmentProvider environment={environment}>
        <App />
      </RelayEnvironmentProvider>
    </RemoteErrorBoundary>
  </React.StrictMode>,
);
