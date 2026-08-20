import React from "react";
import { Link } from "react-router";

import { ListItem } from "../List";
import { DownloadBadge } from "../MediaDownloadStatus";
import WeebText from "../WeebText";
import { SongSearchResults_songsByName$data } from "./__generated__/SongSearchResults_songsByName.graphql";

type Props =
  SongSearchResults_songsByName$data["songsByName"]["edges"][0]["node"];

const SongSearchResultsItem = ({
  id,
  name,
  nameYomi,
  artistName,
  artistNameYomi,
  downloaded,
}: Props) => (
  <Link to={`/song/${id}`}>
    <ListItem>
      <div>
        <WeebText bold text={name} yomi={nameYomi} />
      </div>
      <div>
        <WeebText text={artistName} yomi={artistNameYomi} />
      </div>
      <DownloadBadge downloaded={downloaded} hideWhenMissing />
    </ListItem>
  </Link>
);

export default SongSearchResultsItem;
