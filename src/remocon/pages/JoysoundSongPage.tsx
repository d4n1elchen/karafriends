import React, { useRef, useState } from "react";
import { graphql, useLazyLoadQuery, useMutation } from "react-relay";
import { Link, useParams } from "react-router";

import Button from "../components/Button";
import JoysoundQueueButtons from "../components/JoysoundQueueButtons";
import JoysoundYouTubeInfo from "../components/JoysoundYouTubeInfo";
import { withLoader } from "../components/Loader";
import SearchFormWrapper from "../components/SearchFormWrapper";
import MediaDownloadStatus from "../components/MediaDownloadStatus";
import SongTitle from "../components/SongTitle";
import YouTubeSearchResults from "../components/YouTubeSearchResults";
import { JoysoundSongPageQuery } from "./__generated__/JoysoundSongPageQuery.graphql";
import { JoysoundSongPageBackgroundQuery } from "./__generated__/JoysoundSongPageBackgroundQuery.graphql";
import { JoysoundSongPageSetBackgroundMutation } from "./__generated__/JoysoundSongPageSetBackgroundMutation.graphql";

import {
  getVideoId as getYoutubeVideoId,
  isYouTubeVideoId,
} from "./YouTubePage";

const joysoundSongPageQuery = graphql`
  query JoysoundSongPageQuery($id: String!) {
    joysoundSongDetail(id: $id) {
      id
      name
      artistName
      lyricsPreview
      tieUp
    }
  }
`;

const joysoundSongPageBackgroundQuery = graphql`
  query JoysoundSongPageBackgroundQuery($songId: String!) {
    joysoundBackground(songId: $songId)
  }
`;

const joysoundSongPageSetBackgroundMutation = graphql`
  mutation JoysoundSongPageSetBackgroundMutation(
    $songId: String!
    $youtubeVideoId: String
  ) {
    setJoysoundBackground(songId: $songId, youtubeVideoId: $youtubeVideoId)
  }
`;

type RouteParams = {
  id: string;
  youtubeVideoId?: string;
};

const JoysoundSongPage = () => {
  const params = useParams<RouteParams>();
  const inputRef = useRef<HTMLInputElement>(null);

  const data = useLazyLoadQuery<JoysoundSongPageQuery>(joysoundSongPageQuery, {
    id: params.id!,
  });

  const song = data.joysoundSongDetail;
  const backgroundData = useLazyLoadQuery<JoysoundSongPageBackgroundQuery>(
    joysoundSongPageBackgroundQuery,
    { songId: song.id },
    { fetchPolicy: "network-only" },
  );
  const [commitBackground] = useMutation<JoysoundSongPageSetBackgroundMutation>(
    joysoundSongPageSetBackgroundMutation,
  );

  const [youtubeVideoId, setYoutubeVideoId] = useState<string>(
    params.youtubeVideoId || backgroundData.joysoundBackground || "",
  );
  const [validatedYoutubeId, setValidatedYoutubeVideoId] = useState<string>("");
  const [waitForVideoIdInput, setWaitForVideoIdInput] =
    useState<boolean>(false);
  const [youtubeSearchQuery, setYoutubeSearchQuery] = useState<string>("");

  const selectYoutubeVideo = (videoId: string) => {
    setYoutubeVideoId(videoId);
    setYoutubeSearchQuery("");
    setWaitForVideoIdInput(false);
    history.replaceState({}, "", `#/joysoundSong/${song.id}/${videoId}`);
  };

  const onSubmitYoutubeForm = (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputRef.current) return;

    const input = inputRef.current.value.trim();
    const newYoutubeVideoId = getYoutubeVideoId(input);

    if (newYoutubeVideoId && isYouTubeVideoId(newYoutubeVideoId)) {
      selectYoutubeVideo(newYoutubeVideoId);
    } else if (input) {
      setYoutubeSearchQuery(input);
    }
  };

  const detachVideo = () => {
    setYoutubeVideoId("");
    setValidatedYoutubeVideoId("");
    setYoutubeSearchQuery("");

    history.replaceState({}, "", `#/joysoundSong/${song.id}`);
    commitBackground({
      variables: { songId: song.id, youtubeVideoId: null },
      onError: (error) =>
        console.error("Failed to clear Joysound background binding", error),
    });
  };

  const onYoutubeVideoValidated = (videoId: string) => {
    setValidatedYoutubeVideoId(videoId);
    commitBackground({
      variables: { songId: song.id, youtubeVideoId: videoId },
      onError: (error) =>
        console.error("Failed to save Joysound background binding", error),
    });
  };

  return (
    <div>
      <SongTitle title={song.name}>
        <MediaDownloadStatus
          source="JOYSOUND"
          songId={song.id}
          suffix={validatedYoutubeId || null}
          compact
        />
      </SongTitle>
      <Link to={`/search/artist/${song.artistName}`}>{song.artistName}</Link>
      {!!song.tieUp && <span> • {song.tieUp}</span>}
      {!!song.lyricsPreview && (
        <blockquote>{song.lyricsPreview} ...</blockquote>
      )}
      {youtubeVideoId ? (
        <Button full onClick={() => detachVideo()}>
          Detach YouTube video
        </Button>
      ) : (
        <Button
          full
          onClick={() => {
            if (waitForVideoIdInput) setYoutubeSearchQuery("");
            setWaitForVideoIdInput(!waitForVideoIdInput);
          }}
        >
          {waitForVideoIdInput ? "Cancel" : "Set background video from YouTube"}
        </Button>
      )}
      {waitForVideoIdInput ? (
        <SearchFormWrapper>
          <form onSubmit={onSubmitYoutubeForm}>
            <input
              ref={inputRef}
              placeholder="Song name, YouTube URL, or video ID"
              defaultValue={youtubeVideoId || `${song.name} ${song.artistName}`}
            />
            <Button full type="submit">
              Search / set video
            </Button>
          </form>
          {youtubeSearchQuery && (
            <>
              <p>Select a result to use as the background video:</p>
              <YouTubeSearchResults
                query={youtubeSearchQuery}
                onSelectVideo={selectYoutubeVideo}
              />
            </>
          )}
        </SearchFormWrapper>
      ) : (
        <>
          <JoysoundQueueButtons
            song={song}
            youtubeVideoId={youtubeVideoId}
            validatedYoutubeId={validatedYoutubeId}
          />
          {youtubeVideoId !== "" && (
            <JoysoundYouTubeInfo
              videoId={youtubeVideoId}
              onValidated={onYoutubeVideoValidated}
            />
          )}
        </>
      )}
    </div>
  );
};

export default withLoader(JoysoundSongPage);
