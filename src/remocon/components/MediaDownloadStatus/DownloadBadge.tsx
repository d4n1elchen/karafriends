import classNames from "classnames";
import React from "react";

import * as styles from "./MediaDownloadStatus.module.scss";

interface Props {
  downloaded: boolean;
  downloading?: boolean;
  hideWhenMissing?: boolean;
  compact?: boolean;
}

const DownloadBadge = ({
  downloaded,
  downloading = false,
  hideWhenMissing = false,
  compact = false,
}: Props) => {
  if (!downloaded && !downloading && hideWhenMissing) return null;

  return (
    <span
      className={classNames(styles.status, {
        [styles.downloaded]: downloaded,
        [styles.downloading]: downloading && !downloaded,
        [styles.compact]: compact,
      })}
    >
      {downloaded
        ? "✓ Downloaded"
        : downloading
          ? "Downloading…"
          : "Not downloaded"}
    </span>
  );
};

export default DownloadBadge;
