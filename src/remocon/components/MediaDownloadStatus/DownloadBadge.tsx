import classNames from "classnames";
import React from "react";

import * as styles from "./MediaDownloadStatus.module.scss";

interface Props {
  downloaded: boolean;
  hideWhenMissing?: boolean;
  compact?: boolean;
}

const DownloadBadge = ({
  downloaded,
  hideWhenMissing = false,
  compact = false,
}: Props) => {
  if (!downloaded && hideWhenMissing) return null;

  return (
    <span
      className={classNames(styles.status, {
        [styles.downloaded]: downloaded,
        [styles.compact]: compact,
      })}
    >
      {downloaded ? "✓ Downloaded" : "Not downloaded"}
    </span>
  );
};

export default DownloadBadge;
