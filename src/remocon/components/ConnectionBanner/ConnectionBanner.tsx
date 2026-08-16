import React, { ReactNode, useEffect, useSyncExternalStore } from "react";

import {
  getClientError,
  isAuthorizationRequired,
  reportClientError,
  reportClientRecovered,
  subscribeClientStatus,
} from "../../../common/clientError";
import * as styles from "./ConnectionBanner.module.scss";

export default function ConnectionBanner({
  children,
}: {
  children: ReactNode;
}) {
  const message = useSyncExternalStore(
    subscribeClientStatus,
    getClientError,
    getClientError,
  );
  const remoteLinkExpired = useSyncExternalStore(
    subscribeClientStatus,
    isAuthorizationRequired,
    isAuthorizationRequired,
  );

  useEffect(() => {
    const handleOffline = () => reportClientError("This phone is offline.");
    if (!navigator.onLine) handleOffline();

    window.addEventListener("online", reportClientRecovered);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", reportClientRecovered);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (remoteLinkExpired) {
    return (
      <main className={styles.expired} role="alert">
        <h1>Remote link expired</h1>
        <p>The karaoke server restarted and issued a new remote access code.</p>
        <p>Scan or click the new QR code on the karaoke screen to reconnect.</p>
      </main>
    );
  }

  return (
    <>
      {message && (
        <aside className={styles.banner} role="status" aria-live="polite">
          <span>{message}</span>
          <button type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </aside>
      )}
      {children}
    </>
  );
}
