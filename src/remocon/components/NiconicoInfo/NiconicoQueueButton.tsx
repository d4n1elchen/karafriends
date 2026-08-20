import React, { useEffect, useRef, useState } from "react";
import { fetchQuery, graphql, useMutation } from "react-relay";
import { Subscription } from "relay-runtime";
import { invariant } from "ts-invariant";

import environment from "../../../common/graphqlEnvironment";
import Button from "../Button";
import { DOWNLOADING_TEXT, queuedText } from "../queueButtonText";

import { NiconicoInfoVideoInfoQuery$data } from "./__generated__/NiconicoInfoVideoInfoQuery.graphql";
import { NiconicoQueueButtonSongQueuedQuery } from "./__generated__/NiconicoQueueButtonSongQueuedQuery.graphql";
import {
  NiconicoQueueButtonMutation,
  NiconicoQueueButtonMutation$variables,
} from "./__generated__/NiconicoQueueButtonMutation.graphql";

const niconicoQueueButtonSongQueuedQuery = graphql`
  query NiconicoQueueButtonSongQueuedQuery($timestamp: String!) {
    songQueued(timestamp: $timestamp)
  }
`;

const niconicoQueueButtonMutation = graphql`
  mutation NiconicoQueueButtonMutation(
    $input: QueueNicoSongInput!
    $tryHeadOfQueue: Boolean!
  ) {
    queueNicoSong(input: $input, tryHeadOfQueue: $tryHeadOfQueue) {
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
  videoInfo: NiconicoInfoVideoInfoQuery$data["nicoVideoInfo"];
  userIdentity: NiconicoQueueButtonMutation$variables["input"]["userIdentity"];
}

const NiconicoQueueButton = ({ videoId, videoInfo, userIdentity }: Props) => {
  if (videoInfo.__typename !== "NicoVideoInfo") return null;

  const defaultText = "Queue video";
  const [text, setText] = useState(defaultText);
  const queuedTextRef = useRef<string | null>(null);
  const queuedTimestampRef = useRef<string | null>(null);
  const [commit] = useMutation<NiconicoQueueButtonMutation>(
    niconicoQueueButtonMutation,
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
        subscription = fetchQuery<NiconicoQueueButtonSongQueuedQuery>(
          environment,
          niconicoQueueButtonSongQueuedQuery,
          {
            timestamp: queuedTimestampRef.current!,
          },
        ).subscribe({
          next: (data: NiconicoQueueButtonSongQueuedQuery["response"]) => {
            if (data.songQueued) {
              setText(queuedTextRef.current || "Queued");
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

      if (subscription !== null) {
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
        },
        tryHeadOfQueue: e.shiftKey,
      },
      onCompleted: ({ queueNicoSong }) => {
        switch (queueNicoSong.__typename) {
          case "QueueSongInfo":
            queuedTextRef.current = queuedText(queueNicoSong.eta);
            queuedTimestampRef.current = queueNicoSong.timestamp;
            setText(DOWNLOADING_TEXT);
            break;
          case "QueueSongError":
            setText(`Error: ${queueNicoSong.reason}`);
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

export default NiconicoQueueButton;
