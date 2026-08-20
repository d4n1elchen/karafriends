import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import Button from "../components/Button";
import NiconicoInfo from "../components/NiconicoInfo";
import NiconicoSearchResults from "../components/NiconicoSearchResults";
import SearchFormWrapper from "../components/SearchFormWrapper";
import * as styles from "./VideoSearchPage.module.scss";
import {
  buildKaraokeSearchQuery,
  KaraokeKeyword,
  parseKaraokeKeyword,
} from "../../common/karaokeSearch";

function getVideoId(videoQuery: string): string | null {
  try {
    const url = new URL(videoQuery);
    return url.pathname.split("/").slice(-1)[0];
  } catch (e) {
    if (e instanceof Error && e.name !== "TypeError") {
      throw e;
    }
  }
  return videoQuery;
}

function isNiconicoVideoId(videoQuery: string): boolean {
  return /^[A-Za-z]{1,8}\d+$/.test(videoQuery);
}

type NiconicoParams = {
  videoId: string;
};

const KARAOKE_KEYWORD_STORAGE_KEY = "niconicoKaraokeKeyword";

function storedKaraokeKeyword(): KaraokeKeyword {
  return (
    parseKaraokeKeyword(localStorage.getItem(KARAOKE_KEYWORD_STORAGE_KEY)) ||
    "none"
  );
}

const NiconicoPage = () => {
  const navigate = useNavigate();
  const params = useParams<NiconicoParams>();
  const [searchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [videoId, setVideoId] = useState<string>(params.videoId || "");
  const [query, setQuery] = useState<string>(searchParams.get("query") || "");
  const [karaokeKeyword, setKaraokeKeyword] = useState<KaraokeKeyword>(() =>
    searchParams.has("query")
      ? parseKaraokeKeyword(searchParams.get("karaoke")) || "none"
      : storedKaraokeKeyword(),
  );

  useEffect(() => {
    const routeVideoId = params.videoId || "";
    setVideoId(routeVideoId);
    setQuery(routeVideoId ? "" : searchParams.get("query") || "");
    setKaraokeKeyword(
      searchParams.has("query")
        ? parseKaraokeKeyword(searchParams.get("karaoke")) || "none"
        : storedKaraokeKeyword(),
    );
  }, [params.videoId, searchParams]);

  const onKaraokeKeywordChanged = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextKeyword = parseKaraokeKeyword(e.target.value) || "none";
    setKaraokeKeyword(nextKeyword);
    localStorage.setItem(KARAOKE_KEYWORD_STORAGE_KEY, nextKeyword);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputRef.current) return;
    const input = inputRef.current.value.trim();
    const newVideoId = getVideoId(input);
    if (newVideoId !== null && isNiconicoVideoId(newVideoId)) {
      setVideoId(newVideoId);
      setQuery("");
      navigate(`/search/niconico/${newVideoId}`, { replace: true });
    } else if (input) {
      setVideoId("");
      setQuery(input);
      const nextSearchParams = new URLSearchParams({ query: input });
      if (karaokeKeyword !== "none") {
        nextSearchParams.set("karaoke", karaokeKeyword);
      }
      navigate(`/search/niconico?${nextSearchParams.toString()}`, {
        replace: true,
      });
    }
  };

  return (
    <SearchFormWrapper>
      <h2>Search Niconico</h2>
      <form onSubmit={onSubmit}>
        <input
          key={videoId || query}
          ref={inputRef}
          placeholder="Song name, Niconico URL, or video ID"
          defaultValue={videoId || query}
        />
        <div className={styles.keywordRow}>
          <Button type="submit">Search</Button>
          <label htmlFor="niconico-karaoke-keyword">Add keyword:</label>
          <select
            id="niconico-karaoke-keyword"
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
        <NiconicoSearchResults
          query={buildKaraokeSearchQuery(
            query,
            parseKaraokeKeyword(searchParams.get("karaoke")) || "none",
          )}
        />
      )}
      {videoId !== "" && <NiconicoInfo videoId={videoId} />}
    </SearchFormWrapper>
  );
};

export default NiconicoPage;
