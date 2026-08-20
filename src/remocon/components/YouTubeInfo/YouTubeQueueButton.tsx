import React, { useEffect, useRef, useState } from "react";
import { fetchQuery, graphql, useMutation } from "react-relay";
import { Subscription } from "relay-runtime";
import { invariant } from "ts-invariant";

import environment from "../../../common/graphqlEnvironment";
import Button from "../Button";
import {
  DOWNLOADING_TEXT,
  downloadingText,
  queuedText,
} from "../queueButtonText";

import { YouTubeInfoVideoInfoQuery$data } from "./__generated__/YouTubeInfoVideoInfoQuery.graphql";
import { YouTubeQueueButtonSongQueuedQuery } from "./__generated__/YouTubeQueueButtonSongQueuedQuery.graphql";
import {
  YouTubeQueueButtonMutation,
  YouTubeQueueButtonMutation$variables,
} from "./__generated__/YouTubeQueueButtonMutation.graphql";

const youTubeQueueButtonSongQueuedQuery = graphql`
  query YouTubeQueueButtonSongQueuedQuery(
    $timestamp: String!
    $songId: String!
  ) {
    songQueued(timestamp: $timestamp)
    videoDownloadProgress(videoDownloadType: 1, songId: $songId, suffix: null) {
      progress
    }
  }
`;

const youTubeQueueButtonMutation = graphql`
  mutation YouTubeQueueButtonMutation(
    $input: QueueYoutubeSongInput!
    $tryHeadOfQueue: Boolean!
  ) {
    queueYoutubeSong(input: $input, tryHeadOfQueue: $tryHeadOfQueue) {
      ... on QueueSongInfo {
        __typename
        eta
        timestamp
      }
      ... on QueueSongError {
        __typename
        reason
      }
    }
  }
`;

interface Props {
  videoId: string;
  videoInfo: YouTubeInfoVideoInfoQuery$data["youtubeVideoInfo"];
  adhocSongLyrics: string | null;
  selectedCaption: string | null;
  userIdentity: YouTubeQueueButtonMutation$variables["input"]["userIdentity"];
}

const YouTubeQueueButton = ({
  videoId,
  videoInfo,
  adhocSongLyrics,
  selectedCaption,
  userIdentity,
}: Props) => {
  if (videoInfo.__typename !== "YoutubeVideoInfo") return null;

  const defaultText = "Queue video";
  const [text, setText] = useState(defaultText);
  const queuedTextRef = useRef<string | null>(null);
  const queuedTimestampRef = useRef<string | null>(null);
  const [commit] = useMutation<YouTubeQueueButtonMutation>(
    youTubeQueueButtonMutation,
  );

  useEffect(() => {
    invariant(window);

    let intervalId: number | null = null;
    let timeoutId: number | null = null;
    let subscription: Subscription | null = null;

    if (text.startsWith("Queued") || text.includes("Error")) {
      timeoutId = window.setTimeout(() => setText(defaultText), 2500);
    } else if (text !== defaultText && text !== "Waiting for server...") {
      intervalId = window.setInterval(() => {
        subscription = fetchQuery<YouTubeQueueButtonSongQueuedQuery>(
          environment,
          youTubeQueueButtonSongQueuedQuery,
          {
            timestamp: queuedTimestampRef.current!,
            songId: videoId,
          },
        ).subscribe({
          next: (data: YouTubeQueueButtonSongQueuedQuery["response"]) => {
            if (data.songQueued) {
              setText(queuedTextRef.current || "Queued");
            } else {
              setText(downloadingText(data.videoDownloadProgress.progress));
            }
          },
        });
      }, 1000);
    }

    return () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
      }

      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [text]);

  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setText("Waiting for server...");

    console.log(`tryHeadOfQueue=${e.shiftKey}`);
    commit({
      variables: {
        input: {
          songId: videoId,
          name: videoInfo.title,
          artistName: videoInfo.author,
          playtime: videoInfo.lengthSeconds,
          userIdentity,
          adhocSongLyrics,
          captionCode: selectedCaption || null,
          gainValue: videoInfo.gainValue,
        },
        tryHeadOfQueue: e.shiftKey,
      },
      onCompleted: ({ queueYoutubeSong }) => {
        switch (queueYoutubeSong.__typename) {
          case "QueueSongInfo":
            queuedTextRef.current = queuedText(queueYoutubeSong.eta);
            queuedTimestampRef.current = queueYoutubeSong.timestamp;
            setText(DOWNLOADING_TEXT);
            break;
          case "QueueSongError":
            setText(`Error: ${queueYoutubeSong.reason}`);
            break;
        }
      },
      onError: () => setText("Error: unable to queue song"),
    });
  };

  return (
    <Button disabled={text !== defaultText} onClick={onClick}>
      {text}
    </Button>
  );
};

export default YouTubeQueueButton;
