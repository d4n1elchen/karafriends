import React from "react";
import { graphql, useLazyLoadQuery } from "react-relay";
import { Link } from "react-router";

import { List, ListItem } from "../List";
import { withLoader } from "../Loader";
import { DownloadBadge } from "../MediaDownloadStatus";
import * as styles from "./YouTubeSearchResults.module.scss";
import { YouTubeSearchResultsQuery } from "./__generated__/YouTubeSearchResultsQuery.graphql";

const youtubeSearchResultsQuery = graphql`
  query YouTubeSearchResultsQuery($query: String!) {
    youtubeSearch(query: $query) {
      error
      results {
        videoId
        title
        author
        thumbnailUrl
        duration
        downloaded
        hasCaptions
      }
    }
  }
`;

interface Props {
  onSelectVideo?: (videoId: string) => void;
  query: string;
}

const YouTubeSearchResults = ({ onSelectVideo, query }: Props) => {
  const data = useLazyLoadQuery<YouTubeSearchResultsQuery>(
    youtubeSearchResultsQuery,
    { query },
  );

  if (data.youtubeSearch.error) {
    return (
      <div className={styles.error}>
        Unable to search YouTube: {data.youtubeSearch.error}
      </div>
    );
  }

  if (data.youtubeSearch.results.length === 0) {
    return <span>No results found</span>;
  }

  return (
    <List>
      {data.youtubeSearch.results.map((video) => {
        const result = (
          <ListItem
            cornerAccessory={
              video.downloaded ? (
                <DownloadBadge downloaded compact />
              ) : undefined
            }
          >
            <div className={styles.result}>
              {video.thumbnailUrl && (
                <img
                  className={styles.thumbnail}
                  src={video.thumbnailUrl}
                  alt=""
                />
              )}
              <div className={styles.metadata}>
                <strong>{video.title}</strong>
                <span>{video.author}</span>
                {video.duration && (
                  <span className={styles.duration}>{video.duration}</span>
                )}
                {video.hasCaptions && (
                  <span className={styles.captions}>Subtitle available</span>
                )}
              </div>
            </div>
          </ListItem>
        );

        return onSelectVideo ? (
          <button
            key={video.videoId}
            type="button"
            className={styles.selectResult}
            onClick={() => onSelectVideo(video.videoId)}
            aria-label={`Use ${video.title} as background video`}
          >
            {result}
          </button>
        ) : (
          <Link key={video.videoId} to={`/search/youtube/${video.videoId}`}>
            {result}
          </Link>
        );
      })}
    </List>
  );
};

export default withLoader(YouTubeSearchResults);
