import React, { useEffect, useRef, useState } from "react";
import { fetchQuery, graphql, useMutation } from "react-relay";
import { Subscription } from "relay-runtime";
import { invariant } from "ts-invariant";

import environment from "../../../common/graphqlEnvironment";
import Button from "../Button";
import { DOWNLOADING_TEXT, queuedText } from "../queueButtonText";

import { JoysoundSongPageQuery$data } from "../../pages/__generated__/JoysoundSongPageQuery.graphql";
import { JoysoundQueueButtonSongQueuedQuery } from "./__generated__/JoysoundQueueButtonSongQueuedQuery.graphql";
import {
  JoysoundQueueButtonMutation,
  JoysoundQueueButtonMutation$variables,
} from "./__generated__/JoysoundQueueButtonMutation.graphql";

const joysoundQueueButtonSongQueuedQuery = graphql`
  query JoysoundQueueButtonSongQueuedQuery($timestamp: String!) {
    songQueued(timestamp: $timestamp)
  }
`;

const joysoundQueueButtonMutation = graphql`
  mutation JoysoundQueueButtonMutation(
    $input: QueueJoysoundSongInput!
    $tryHeadOfQueue: Boolean!
  ) {
    queueJoysoundSong(input: $input, tryHeadOfQueue: $tryHeadOfQueue) {
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
  song: JoysoundSongPageQuery$data["joysoundSongDetail"];
  youtubeVideoId: string | null;
  userIdentity: JoysoundQueueButtonMutation$variables["input"]["userIdentity"];
  isRomaji: boolean;
  isDisabled: boolean;
  setDisabled: (isDisabled: boolean) => void;
}

const JoysoundQueueButton = ({
  song,
  youtubeVideoId,
  userIdentity,
  isRomaji,
  isDisabled,
  setDisabled,
}: Props) => {
  const defaultText = `Queue song${isRomaji ? " (Romaji)" : ""}`;

  const [text, setText] = useState(defaultText);
  const queuedTextRef = useRef<string | null>(null);
  const queuedTimestampRef = useRef<string | null>(null);
  const [commit] = useMutation<JoysoundQueueButtonMutation>(
    joysoundQueueButtonMutation,
  );

  useEffect(() => {
    invariant(window);

    let intervalId: number | null = null;
    let timeoutId: number | null = null;
    let subscription: Subscription | null = null;

    if (text.startsWith("Queued") || text.includes("Error")) {
      timeoutId = window.setTimeout(() => {
        setText(defaultText);
        setDisabled(false);
      }, 2500);
    } else if (text !== defaultText && text !== "Waiting for server...") {
      intervalId = window.setInterval(() => {
        subscription = fetchQuery<JoysoundQueueButtonSongQueuedQuery>(
          environment,
          joysoundQueueButtonSongQueuedQuery,
          {
            timestamp: queuedTimestampRef.current!,
          },
        ).subscribe({
          next: (data: JoysoundQueueButtonSongQueuedQuery["response"]) => {
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
    setDisabled(true);
    setText("Waiting for server...");

    console.log(`tryHeadOfQueue=${e.shiftKey}`);
    commit({
      variables: {
        input: {
          songId: song.id,
          name: song.name,
          playtime: null,
          artistName: song.artistName,
          userIdentity,
          isRomaji,
          youtubeVideoId,
        },
        tryHeadOfQueue: e.shiftKey,
      },
      onCompleted: ({ queueJoysoundSong }) => {
        switch (queueJoysoundSong.__typename) {
          case "QueueSongInfo":
            queuedTextRef.current = queuedText(queueJoysoundSong.eta);
            queuedTimestampRef.current = queueJoysoundSong.timestamp;
            setText(DOWNLOADING_TEXT);
            break;
          case "QueueSongError":
            setText(`Error: ${queueJoysoundSong.reason}`);
            break;
        }
      },
      onError: () => setText("Error: unable to queue song"),
    });
  };

  return (
    <Button disabled={isDisabled} onClick={onClick}>
      {text}
    </Button>
  );
};

export default JoysoundQueueButton;
