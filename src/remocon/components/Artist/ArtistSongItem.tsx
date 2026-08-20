import React from "react";
import { Link } from "react-router";

import { ListItem } from "../List";
import { DownloadBadge } from "../MediaDownloadStatus";
import WeebText from "../WeebText";
import { Artist_artistById$data } from "./__generated__/Artist_artistById.graphql";

type Props = Artist_artistById$data["artistById"]["songs"]["edges"][0]["node"];

const ArtistSongItem = ({ id, name, nameYomi, downloaded }: Props) => (
  <Link to={`/song/${id}`}>
    <ListItem
      cornerAccessory={
        downloaded ? <DownloadBadge downloaded compact /> : undefined
      }
    >
      <WeebText bold text={name} yomi={nameYomi} />
    </ListItem>
  </Link>
);

export default ArtistSongItem;
