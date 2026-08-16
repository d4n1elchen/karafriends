import React, { useState } from "react";
import Button from "../Button/Button";
import * as styles from "./EnableNotificationsButton.module.scss";

const EnableNotificationsButton = () => {
  if (!("Notification" in window)) {
    return <></>;
  }

  const [permission, setPermission] = useState(Notification.permission);
  const [isRequesting, setIsRequesting] = useState(false);

  const requestPermission = async () => {
    setIsRequesting(true);
    try {
      setPermission(await Notification.requestPermission());
    } catch (error) {
      console.warn("Unable to request notification permission", error);
    } finally {
      setIsRequesting(false);
    }
  };

  return permission === "default" ? (
    <div className={styles.enableNotificationsButtonContainer}>
      <Button disabled={isRequesting} onClick={() => void requestPermission()}>
        {isRequesting ? "Requesting…" : "Enable push notifications"}
      </Button>
    </div>
  ) : (
    <></>
  );
};

export default EnableNotificationsButton;
