import classNames from "classnames";
import React from "react";

import * as styles from "./MediaDownloadStatus.module.scss";

interface Props {
  downloaded: boolean;
  hideWhenMissing?: boolean;
}

const DownloadBadge = ({ downloaded, hideWhenMissing = false }: Props) => {
  if (!downloaded && hideWhenMissing) return null;

  return (
    <span
      className={classNames(styles.status, {
        [styles.downloaded]: downloaded,
      })}
    >
      {downloaded ? "✓ Downloaded" : "Not downloaded"}
    </span>
  );
};

export default DownloadBadge;
