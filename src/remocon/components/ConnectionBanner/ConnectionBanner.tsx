import React, { useEffect, useState } from "react";

import {
  CLIENT_ERROR_EVENT,
  CLIENT_RECOVERED_EVENT,
} from "../../../common/clientError";
import * as styles from "./ConnectionBanner.module.scss";

export default function ConnectionBanner() {
  const [message, setMessage] = useState<string | null>(() =>
    navigator.onLine ? null : "This phone is offline.",
  );

  useEffect(() => {
    const handleError = (event: Event) =>
      setMessage((event as CustomEvent<string>).detail);
    const handleRecovered = () => setMessage(null);
    const handleOffline = () => setMessage("This phone is offline.");

    window.addEventListener(CLIENT_ERROR_EVENT, handleError);
    window.addEventListener(CLIENT_RECOVERED_EVENT, handleRecovered);
    window.addEventListener("online", handleRecovered);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener(CLIENT_ERROR_EVENT, handleError);
      window.removeEventListener(CLIENT_RECOVERED_EVENT, handleRecovered);
      window.removeEventListener("online", handleRecovered);
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
