import React, { useEffect, useRef, useState } from "react";
import { fetchQuery, graphql, useMutation } from "react-relay";
import { Subscription } from "relay-runtime";

import environment from "../../../common/graphqlEnvironment";
import { SongPageQuery$data } from "../../pages/__generated__/SongPageQuery.graphql";
import Button from "../Button";
import {
  DOWNLOADING_TEXT,
  polledQueueText,
  queuedText,
} from "../queueButtonText";
import { DamQueueButtonSongQueuedQuery } from "./__generated__/DamQueueButtonSongQueuedQuery.graphql";
import {
  DamQueueButtonMutation,
  DamQueueButtonMutation$variables,
} from "./__generated__/DamQueueButtonMutation.graphql";

const damQueueButtonSongQueuedQuery = graphql`
  query DamQueueButtonSongQueuedQuery(
    $timestamp: String!
    $songId: String!
    $suffix: String
  ) {
    songQueued(timestamp: $timestamp)
    videoDownloadProgress(
      videoDownloadType: 3
      songId: $songId
      suffix: $suffix
    ) {
      progress
    }
  }
`;

const damQueueButtonMutation = graphql`
  mutation DamQueueButtonMutation(
    $input: QueueDamSongInput!
    $tryHeadOfQueue: Boolean!
  ) {
    queueDamSong(input: $input, tryHeadOfQueue: $tryHeadOfQueue) {
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

function getDefaultText(vocalType: string) {
  let defaultText = "Queue song - guide vocal (unknown type)";
  switch (vocalType) {
    case "NORMAL":
      defaultText = "Queue song";
      break;
    case "GUIDE_MALE":
      defaultText = "Queue song - guide vocal (male)";
      break;
    case "GUIDE_FEMALE":
      defaultText = "Queue song - guide vocal (female)";
      break;
  }
  return defaultText;
}

interface Props {
  song: SongPageQuery$data["songById"];
  streamingUrlIndex: number;
  userIdentity: DamQueueButtonMutation$variables["input"]["userIdentity"];
}

const DamQueueButton = ({ song, streamingUrlIndex, userIdentity }: Props) => {
  const defaultText = getDefaultText(song.vocalTypes[streamingUrlIndex]);
  const [text, setText] = useState(defaultText);
  const queuedTextRef = useRef<string | null>(null);
  const queuedTimestampRef = useRef<string | null>(null);
  const [commit] = useMutation<DamQueueButtonMutation>(damQueueButtonMutation);

  useEffect(() => {
    let intervalId: number | null = null;
    let timeoutId: number | null = null;
    let subscription: Subscription | null = null;

    if (text.startsWith("Queued") || text.includes("Error")) {
      timeoutId = window.setTimeout(() => setText(defaultText), 2500);
    } else if (text !== defaultText && text !== "Waiting for server...") {
      intervalId = window.setInterval(() => {
        subscription?.unsubscribe();
        subscription = fetchQuery<DamQueueButtonSongQueuedQuery>(
          environment,
          damQueueButtonSongQueuedQuery,
          {
            timestamp: queuedTimestampRef.current!,
            songId: song.id,
            suffix: streamingUrlIndex.toString(),
          },
        ).subscribe({
          next: (data) => {
            setText(
              polledQueueText(
                data.songQueued,
                data.videoDownloadProgress.progress,
                queuedTextRef.current || "Queued",
              ),
            );
          },
        });
      }, 1000);
    }

    return () => {
      if (intervalId !== null) clearInterval(intervalId);
      if (timeoutId !== null) clearTimeout(timeoutId);
      subscription?.unsubscribe();
    };
  }, [defaultText, song.id, streamingUrlIndex, text]);

  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setText("Waiting for server...");
    console.log(`tryHeadOfQueue=${e.shiftKey}`);
    commit({
      variables: {
        input: {
          songId: song.id,
          name: song.name,
          artistName: song.artistName,
          playtime: song.playtime,
          streamingUrlIdx: streamingUrlIndex,
          userIdentity,
        },
        tryHeadOfQueue: e.shiftKey,
      },
      onCompleted: ({ queueDamSong }) => {
        switch (queueDamSong.__typename) {
          case "QueueSongInfo":
            queuedTextRef.current = queuedText(queueDamSong.eta);
            queuedTimestampRef.current = queueDamSong.timestamp;
            setText(DOWNLOADING_TEXT);
            break;
          case "QueueSongError":
            setText(`Error: ${queueDamSong.reason}`);
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

export default DamQueueButton;
