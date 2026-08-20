import React from "react";
import { Link } from "react-router";
import { invariant } from "ts-invariant";

import { ListItem } from "../List";
import * as styles from "./SongHistory.module.scss";
import { SongHistory_songHistory$data } from "./__generated__/SongHistory_songHistory.graphql";

type Props = SongHistory_songHistory$data["songHistory"]["edges"][0]["node"];

function getSongLink(queueItemType: string, songId: string): string {
  switch (queueItemType) {
    case "DamQueueItem":
      return `/song/${songId}`;
    case "JoysoundQueueItem":
      return `/joysoundSong/${songId}`;
    case "YoutubeQueueItem":
      return `/search/youtube/${songId}`;
    case "NicoQueueItem":
      return `/search/niconico/${songId}`;
  }

  return `/song/${songId}`;
}

function getProvider(queueItemType: string): {
  className: string;
  label: string;
} {
  switch (queueItemType) {
    case "DamQueueItem":
      return { className: styles.dam, label: "DAM" };
    case "JoysoundQueueItem":
      return { className: styles.joysound, label: "JOYSOUND" };
    case "YoutubeQueueItem":
      return { className: styles.youtube, label: "YouTube" };
    case "NicoQueueItem":
      return { className: styles.niconico, label: "Niconico" };
  }

  return { className: styles.unknown, label: "Unknown" };
}

const SongHistoryItem = ({ song }: Props) => {
  invariant(song.__typename !== "%other");

  const songLink = getSongLink(song.__typename, song.songId);
  const provider = getProvider(song.__typename);
  const date = new Date(parseInt(song.timestamp, 10));

  return (
    <Link to={songLink}>
      <ListItem>
        <div>
          <div className={styles.titleRow}>
            <strong>{song.name}</strong>
            <span
              className={`${styles.providerBadge} ${provider.className}`}
              aria-label={`${provider.label} provider`}
            >
              {provider.label}
            </span>
            <span className={styles.queuedBy}>
              Queued by: {song.userIdentity.nickname}
            </span>
          </div>
        </div>

        <div>
          {song.artistName}
          <span className={styles.date}>{date.toLocaleString()}</span>
        </div>
      </ListItem>
    </Link>
  );
};

export default SongHistoryItem;
