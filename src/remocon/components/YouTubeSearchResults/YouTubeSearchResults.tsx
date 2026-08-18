import React from "react";
import { graphql, useLazyLoadQuery } from "react-relay";
import { Link } from "react-router";

import { List, ListItem } from "../List";
import { withLoader } from "../Loader";
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
      }
    }
  }
`;

interface Props {
  query: string;
}

const YouTubeSearchResults = ({ query }: Props) => {
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
      {data.youtubeSearch.results.map((video) => (
        <Link key={video.videoId} to={`/search/youtube/${video.videoId}`}>
          <ListItem>
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
              </div>
            </div>
          </ListItem>
        </Link>
      ))}
    </List>
  );
};

export default withLoader(YouTubeSearchResults);
