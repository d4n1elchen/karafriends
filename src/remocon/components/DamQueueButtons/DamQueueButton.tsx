import React, { useEffect, useState } from "react";
import { graphql, useMutation } from "react-relay";

import { SongPageQuery$data } from "../../pages/__generated__/SongPageQuery.graphql";
import Button from "../Button";
import { queuedText } from "../queueButtonText";
import {
  DamQueueButtonMutation,
  DamQueueButtonMutation$variables,
} from "./__generated__/DamQueueButtonMutation.graphql";

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
  const [commit] = useMutation<DamQueueButtonMutation>(damQueueButtonMutation);

  useEffect(() => {
    if (!text.startsWith("Queued") && !text.includes("Error")) return;
    const timeoutId = window.setTimeout(() => setText(defaultText), 2500);
    return () => clearTimeout(timeoutId);
  }, [defaultText, text]);

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
            setText(queuedText(queueDamSong.eta));
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
