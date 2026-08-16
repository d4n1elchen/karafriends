import React from "react";
import { graphql, useLazyLoadQuery } from "react-relay";
import { Link, useNavigate, useParams } from "react-router";

import Button from "../components/Button";
import DamQueueButtons from "../components/DamQueueButtons";
import { withLoader } from "../components/Loader";
import { SongPageQuery } from "./__generated__/SongPageQuery.graphql";

const songPageQuery = graphql`
  query SongPageQuery($id: String!) {
    songById(id: $id) {
      id
      name
      nameYomi
      artistName
      artistNameYomi
      lyricsPreview
      vocalTypes
      tieUp
      playtime
    }
  }
`;

type RouteParams = {
  id: string;
};

const SongPage = () => {
  const navigate = useNavigate();
  const params = useParams<RouteParams>();
  const data = useLazyLoadQuery<SongPageQuery>(songPageQuery, {
    id: params.id!,
  });
  const song = data.songById;

  return (
    <div>
      <Button type="button" onClick={() => navigate(-1)}>
        ← Back to search results
      </Button>
      <h2>{song.name}</h2>
      <Link to={`/search/artist/${song.artistName}`}>{song.artistName}</Link>
      {!!song.tieUp && <span> • {song.tieUp}</span>}
      {!!song.lyricsPreview && (
        <blockquote>{song.lyricsPreview} ...</blockquote>
      )}
      <DamQueueButtons song={song} />
    </div>
  );
};

export default withLoader(SongPage);
