import React from "react";
import { graphql, useLazyLoadQuery } from "react-relay";

import { MediaDownloadStatusQuery } from "./__generated__/MediaDownloadStatusQuery.graphql";
import DownloadBadge from "./DownloadBadge";

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

  return <DownloadBadge downloaded={data.mediaDownloaded} />;
};

export default MediaDownloadStatus;
