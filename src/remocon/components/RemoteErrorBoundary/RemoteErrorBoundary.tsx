import * as Sentry from "@sentry/browser";
import React, { ErrorInfo, ReactNode } from "react";

import { reportClientError } from "../../../common/clientError";
import * as styles from "./RemoteErrorBoundary.module.scss";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class RemoteErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportClientError(error);
    Sentry.captureException(error, {
      extra: { componentStack: info.componentStack },
    });
  }

  render() {
    if (this.state.error) {
      return (
        <main className={styles.failure} role="alert">
          <h1>The remote hit a problem</h1>
          <p>
            Your karaoke room is still safe. Reload the remote to reconnect.
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            Try again
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
