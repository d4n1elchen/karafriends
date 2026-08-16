import { useEffect, useRef } from "react";

import formatDuration from "format-duration";
import useQueue from "../../common/hooks/useQueue";

async function registerServiceWorker() {
  return navigator.serviceWorker.register(
    new URL("../notificationServiceWorker.ts", import.meta.url),
    { scope: "/" },
  );
}

async function showNotification(
  ...args: ConstructorParameters<typeof Notification>
) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  try {
    if ("serviceWorker" in navigator) {
      const registration = await registerServiceWorker();
      if (typeof registration.showNotification === "function") {
        await registration.showNotification(...args);
        return;
      }
    }

    // Some browsers expose Notification but only permit service-worker
    // notifications. The constructor can still throw, so keep this fallback
    // inside the optional notification boundary as well.
    if (typeof Notification === "function") {
      new Notification(...args); // tslint:disable-line:no-unused-expression
    }
  } catch (error) {
    // Notifications are an optional enhancement and must never turn a
    // successful queue operation into a global remocon error.
    console.warn("Unable to show queue notification", error);
  }
}

export default function useQueueNotifications(myDeviceId: string) {
  const queue = useQueue();
  const notifiedItems = useRef(new Set<string>());

  useEffect(() => {
    for (const [item, eta] of queue) {
      const notificationKey = `${item.__typename}:${item.timestamp}`;
      if (
        item.userIdentity &&
        item.userIdentity.deviceId === myDeviceId &&
        eta <= 10 * 60 &&
        !notifiedItems.current.has(notificationKey)
      ) {
        notifiedItems.current.add(notificationKey);
        void showNotification("karafriends", {
          body: `Your song ${
            item.name
          } is coming up soon! Estimated wait: T-${formatDuration(eta * 1000)}`,
        });
      }
    }
  }, [myDeviceId, queue]);
}
