import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import Button from "../components/Button";
import NiconicoInfo from "../components/NiconicoInfo";
import NiconicoSearchResults from "../components/NiconicoSearchResults";
import SearchFormWrapper from "../components/SearchFormWrapper";

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

const NiconicoPage = () => {
  const navigate = useNavigate();
  const params = useParams<NiconicoParams>();
  const [searchParams] = useSearchParams();
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
    if (newVideoId !== null && isNiconicoVideoId(newVideoId)) {
      setVideoId(newVideoId);
      setQuery("");
      navigate(`/search/niconico/${newVideoId}`, { replace: true });
    } else if (input) {
      setVideoId("");
      setQuery(input);
      navigate(`/search/niconico?query=${encodeURIComponent(input)}`, {
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
        <Button type="submit">Search</Button>
      </form>
      {query !== "" && <NiconicoSearchResults query={query} />}
      {videoId !== "" && <NiconicoInfo videoId={videoId} />}
    </SearchFormWrapper>
  );
};

export default NiconicoPage;
