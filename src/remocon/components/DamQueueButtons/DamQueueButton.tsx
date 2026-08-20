import React, { useEffect, useState } from "react";
import { fetchQuery, graphql, useMutation } from "react-relay";
import { Subscription } from "relay-runtime";
import { invariant } from "ts-invariant";

import environment from "../../../common/graphqlEnvironment";
import { SongPageQuery$data } from "../../pages/__generated__/SongPageQuery.graphql";
import Button from "../Button";
import { DamQueueButtonGetVideoDownloadProgressQuery } from "./__generated__/DamQueueButtonGetVideoDownloadProgressQuery.graphql";
import {
  DamQueueButtonMutation,
  DamQueueButtonMutation$variables,
} from "./__generated__/DamQueueButtonMutation.graphql";

const damQueueButtonGetVideoDownloadProgressQuery = graphql`
  query DamQueueButtonGetVideoDownloadProgressQuery(
    $videoDownloadType: Int!
    $songId: String!
    $suffix: String
  ) {
    videoDownloadProgress(
      videoDownloadType: $videoDownloadType
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
  const [commit] = useMutation<DamQueueButtonMutation>(damQueueButtonMutation);

  useEffect(() => {
    invariant(window);

    let intervalId: number | null = null;
    let timeoutId: number | null = null;
    let subscription: Subscription | null = null;

    if (text === "Finished Downloading" || text.includes("Error")) {
      timeoutId = window.setTimeout(() => setText(defaultText), 2500);
    } else if (text !== defaultText && text !== "Waiting for server...") {
      intervalId = window.setInterval(() => {
        subscription = fetchQuery<DamQueueButtonGetVideoDownloadProgressQuery>(
          environment,
          damQueueButtonGetVideoDownloadProgressQuery,
          {
            videoDownloadType: 3,
            songId: song.id,
            suffix: streamingUrlIndex.toString(),
          },
        ).subscribe({
          next: (data) => {
            if (
              data.videoDownloadProgress.progress === 1.0 ||
              (text !== "Downloading" &&
                data.videoDownloadProgress.progress === -1.0)
            ) {
              setText("Finished Downloading");
            } else {
              setText("Downloading...");
            }
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
            setText("Downloading");
            break;
          case "QueueSongError":
            setText(`Error: ${queueDamSong.reason}`);
            break;
        }
      },
    });
  };

  return (
    <Button disabled={text !== defaultText} onClick={onClick}>
      {text}
    </Button>
  );
};

export default DamQueueButton;
