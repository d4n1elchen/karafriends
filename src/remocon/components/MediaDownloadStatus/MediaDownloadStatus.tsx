import React, { useEffect, useState } from "react";
import { fetchQuery, graphql, useLazyLoadQuery } from "react-relay";
import { Subscription } from "relay-runtime";

import environment from "../../../common/graphqlEnvironment";
import { MediaDownloadStatusQuery } from "./__generated__/MediaDownloadStatusQuery.graphql";
import { MediaSource } from "../../mediaDownloadCache";
import DownloadBadge from "./DownloadBadge";

const mediaDownloadStatusQuery = graphql`
  query MediaDownloadStatusQuery(
    $source: MediaSource!
    $songId: String!
    $suffix: String
    $videoDownloadType: Int!
  ) {
    mediaDownloaded(source: $source, songId: $songId, suffix: $suffix)
    videoDownloadProgress(
      videoDownloadType: $videoDownloadType
      songId: $songId
      suffix: $suffix
    ) {
      progress
    }
  }
`;

interface Props {
  source: MediaSource;
  songId: string;
  suffix?: string | null;
}

const MediaDownloadStatus = ({ source, songId, suffix = null }: Props) => {
  const videoDownloadType = {
    JOYSOUND: 0,
    YOUTUBE: 1,
    NICONICO: 2,
    DAM: 3,
  }[source];
  const data = useLazyLoadQuery<MediaDownloadStatusQuery>(
    mediaDownloadStatusQuery,
    { source, songId, suffix, videoDownloadType },
    { fetchPolicy: "network-only" },
  );
  const [downloading, setDownloading] = useState(
    data.videoDownloadProgress.progress >= 0,
  );

  useEffect(() => {
    if (data.mediaDownloaded) {
      setDownloading(false);
      return;
    }

    let subscription: Subscription | null = null;
    const checkProgress = () => {
      subscription?.unsubscribe();
      subscription = fetchQuery<MediaDownloadStatusQuery>(
        environment,
        mediaDownloadStatusQuery,
        { source, songId, suffix, videoDownloadType },
        { fetchPolicy: "network-only" },
      ).subscribe({
        next: (latest) =>
          setDownloading(latest.videoDownloadProgress.progress >= 0),
      });
    };

    checkProgress();
    const intervalId = window.setInterval(checkProgress, 1000);
    return () => {
      clearInterval(intervalId);
      subscription?.unsubscribe();
    };
  }, [data.mediaDownloaded, songId, source, suffix, videoDownloadType]);

  return (
    <DownloadBadge
      downloaded={data.mediaDownloaded}
      downloading={downloading}
    />
  );
};

export default MediaDownloadStatus;
