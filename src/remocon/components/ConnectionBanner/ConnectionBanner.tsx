import React, { useEffect, useSyncExternalStore } from "react";

import {
  getClientError,
  reportClientError,
  reportClientRecovered,
  subscribeClientStatus,
} from "../../../common/clientError";
import * as styles from "./ConnectionBanner.module.scss";

export default function ConnectionBanner() {
  const message = useSyncExternalStore(
    subscribeClientStatus,
    getClientError,
    getClientError,
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

  if (!message) return null;

  return (
    <aside className={styles.banner} role="status" aria-live="polite">
      <span>{message}</span>
      <button type="button" onClick={() => window.location.reload()}>
        Retry
      </button>
    </aside>
  );
}
