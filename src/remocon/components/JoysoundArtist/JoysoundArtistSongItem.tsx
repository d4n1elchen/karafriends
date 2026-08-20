import React from "react";
import { Link } from "react-router";

import { ListItem } from "../List";
import { DownloadBadge } from "../MediaDownloadStatus";
import { JoysoundArtist_joysoundSongsByArtist$data } from "./__generated__/JoysoundArtist_joysoundSongsByArtist.graphql";

type Props =
  JoysoundArtist_joysoundSongsByArtist$data["joysoundSongsByArtist"]["edges"][0]["node"];

const JoysoundArtistSongItem = ({ id, name, downloaded }: Props) => (
  <Link to={`/joysoundSong/${id}`}>
    <ListItem>
      <strong>{name}</strong>
      <DownloadBadge downloaded={downloaded} hideWhenMissing />
    </ListItem>
  </Link>
);

export default JoysoundArtistSongItem;
