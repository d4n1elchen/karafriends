import classNames from "classnames";
import React from "react";
import { graphql, useLazyLoadQuery } from "react-relay";

import { MediaDownloadStatusQuery } from "./__generated__/MediaDownloadStatusQuery.graphql";
import * as styles from "./MediaDownloadStatus.module.scss";

const mediaDownloadStatusQuery = graphql`
  query MediaDownloadStatusQuery(
    $source: MediaSource!
    $songId: String!
    $suffix: String
  ) {
    mediaDownloaded(source: $source, songId: $songId, suffix: $suffix)
  }
`;

interface Props {
  source: "DAM" | "JOYSOUND" | "YOUTUBE" | "NICONICO";
  songId: string;
  suffix?: string | null;
}

const MediaDownloadStatus = ({ source, songId, suffix = null }: Props) => {
  const data = useLazyLoadQuery<MediaDownloadStatusQuery>(
    mediaDownloadStatusQuery,
    { source, songId, suffix },
    { fetchPolicy: "network-only" },
  );

  return (
    <span
      className={classNames(styles.status, {
        [styles.downloaded]: data.mediaDownloaded,
      })}
    >
      {data.mediaDownloaded ? "✓ Downloaded" : "Not downloaded"}
    </span>
  );
};

export default MediaDownloadStatus;
