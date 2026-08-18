import { invariant } from "ts-invariant";

import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import useNowPlaying from "../hooks/useNowPlaying";
import useUserIdentity from "../hooks/useUserIdentity";

import Button from "../components/Button";
import { withLoader } from "../components/Loader";
import SearchFormWrapper from "../components/SearchFormWrapper";
import YouTubeInfo from "../components/YouTubeInfo";
import YouTubeSearchResults from "../components/YouTubeSearchResults";

import { useNowPlayingQuery$data } from "../hooks/__generated__/useNowPlayingQuery.graphql";

export function getVideoId(videoQuery: string): string | null {
  try {
    const url = new URL(videoQuery);
    return url.hostname === "youtu.be"
      ? url.pathname.replace("/", "")
      : url.searchParams.get("v");
  } catch (e) {
    if (e instanceof Error && e.name !== "TypeError") {
      throw e;
    }
  }
  return videoQuery;
}

export function isYouTubeVideoId(videoQuery: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(videoQuery);
}

export function isYouTubeVideoWithLyricsPlaying(
  currentSong: useNowPlayingQuery$data["currentSong"] | null | undefined,
  videoId: string,
  nickname: string,
): boolean {
  if (!currentSong || currentSong.__typename !== "YoutubeQueueItem") {
    return false;
  }

  invariant(currentSong.hasAdhocLyrics !== undefined);

  return (
    currentSong.songId === videoId &&
    currentSong.userIdentity?.nickname === nickname &&
    currentSong.hasAdhocLyrics
  );
}

type YouTubeParams = {
  videoId: string;
};

const YouTubePage = () => {
  const navigate = useNavigate();
  const { nickname } = useUserIdentity();
  const currentSong = useNowPlaying();

  const params = useParams<YouTubeParams>();
  const [searchParams, setSearchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const [videoId, setVideoId] = useState<string>(params.videoId || "");
  const [query, setQuery] = useState<string>(searchParams.get("query") || "");

  useEffect(() => {
    const routeVideoId = params.videoId || "";
    setVideoId(routeVideoId);
    setQuery(routeVideoId ? "" : searchParams.get("query") || "");
  }, [params.videoId, searchParams]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputRef.current) return;
    const input = inputRef.current.value.trim();
    const newVideoId = getVideoId(input);
    if (newVideoId !== null && isYouTubeVideoId(newVideoId)) {
      setVideoId(newVideoId);
      setQuery("");
      history.replaceState({}, "", `#/search/youtube/${newVideoId}`);
    } else if (input) {
      setVideoId("");
      setQuery(input);
      setSearchParams({ query: input }, { replace: true });
    }
  };

  if (
    isYouTubeVideoWithLyricsPlaying(
      currentSong,
      videoId || params.videoId || "",
      nickname,
    )
  ) {
    navigate(`/adhocLyrics/${videoId || params.videoId || ""}`);
  }

  return (
    <SearchFormWrapper>
      <h2>Search YouTube</h2>
      <form onSubmit={onSubmit}>
        <input
          key={videoId || query}
          ref={inputRef}
          placeholder="Song name, YouTube URL, or video ID"
          defaultValue={videoId || query}
        />
        <Button type="submit">Search</Button>
      </form>
      {query !== "" && <YouTubeSearchResults query={query} />}
      {videoId !== "" && <YouTubeInfo videoId={videoId} />}
    </SearchFormWrapper>
  );
};

export default withLoader(YouTubePage);
