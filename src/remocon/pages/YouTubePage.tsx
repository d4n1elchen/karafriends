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
import * as styles from "./YouTubePage.module.scss";
import {
  buildYoutubeSearchQuery,
  parseYoutubeKaraokeKeyword,
  YoutubeKaraokeKeyword,
} from "../../common/youtubeKaraokeSearch";

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

const KARAOKE_KEYWORD_STORAGE_KEY = "youtubeKaraokeKeyword";

function storedKaraokeKeyword(): YoutubeKaraokeKeyword {
  return (
    parseYoutubeKaraokeKeyword(
      localStorage.getItem(KARAOKE_KEYWORD_STORAGE_KEY),
    ) || "none"
  );
}

const YouTubePage = () => {
  const navigate = useNavigate();
  const { nickname } = useUserIdentity();
  const currentSong = useNowPlaying();

  const params = useParams<YouTubeParams>();
  const [searchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const [videoId, setVideoId] = useState<string>(params.videoId || "");
  const [query, setQuery] = useState<string>(searchParams.get("query") || "");
  const [karaokeKeyword, setKaraokeKeyword] = useState<YoutubeKaraokeKeyword>(
    () => {
      if (searchParams.has("query")) {
        return (
          parseYoutubeKaraokeKeyword(searchParams.get("karaoke")) || "none"
        );
      }
      return storedKaraokeKeyword();
    },
  );

  useEffect(() => {
    const routeVideoId = params.videoId || "";
    setVideoId(routeVideoId);
    setQuery(routeVideoId ? "" : searchParams.get("query") || "");
    setKaraokeKeyword(
      searchParams.has("query")
        ? parseYoutubeKaraokeKeyword(searchParams.get("karaoke")) || "none"
        : storedKaraokeKeyword(),
    );
  }, [params.videoId, searchParams]);

  const onKaraokeKeywordChanged = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextKeyword = parseYoutubeKaraokeKeyword(e.target.value) || "none";
    setKaraokeKeyword(nextKeyword);
    localStorage.setItem(KARAOKE_KEYWORD_STORAGE_KEY, nextKeyword);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputRef.current) return;
    const input = inputRef.current.value.trim();
    const newVideoId = getVideoId(input);
    if (newVideoId !== null && isYouTubeVideoId(newVideoId)) {
      setVideoId(newVideoId);
      setQuery("");
      navigate(`/search/youtube/${newVideoId}`, { replace: true });
    } else if (input) {
      setVideoId("");
      setQuery(input);
      const nextSearchParams = new URLSearchParams({ query: input });
      if (karaokeKeyword !== "none") {
        nextSearchParams.set("karaoke", karaokeKeyword);
      }
      navigate(`/search/youtube?${nextSearchParams.toString()}`, {
        replace: true,
      });
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
        <div className={styles.keywordRow}>
          <Button type="submit">Search</Button>
          <label htmlFor="youtube-karaoke-keyword">Add keyword:</label>
          <select
            id="youtube-karaoke-keyword"
            value={karaokeKeyword}
            onChange={onKaraokeKeywordChanged}
          >
            <option value="none">None</option>
            <option value="jp">カラオケ</option>
            <option value="en">karaoke</option>
            <option value="zh">卡拉OK</option>
          </select>
        </div>
      </form>
      {query !== "" && (
        <YouTubeSearchResults
          query={buildYoutubeSearchQuery(
            query,
            parseYoutubeKaraokeKeyword(searchParams.get("karaoke")) || "none",
          )}
        />
      )}
      {videoId !== "" && <YouTubeInfo videoId={videoId} />}
    </SearchFormWrapper>
  );
};

export default withLoader(YouTubePage);
