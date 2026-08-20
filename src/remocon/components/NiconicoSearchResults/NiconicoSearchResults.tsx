import React from "react";
import { graphql, useLazyLoadQuery } from "react-relay";
import { Link } from "react-router";

import { List, ListItem } from "../List";
import { withLoader } from "../Loader";
import { DownloadBadge } from "../MediaDownloadStatus";
import * as styles from "./NiconicoSearchResults.module.scss";
import { NiconicoSearchResultsQuery } from "./__generated__/NiconicoSearchResultsQuery.graphql";

const niconicoSearchResultsQuery = graphql`
  query NiconicoSearchResultsQuery($query: String!) {
    niconicoSearch(query: $query) {
      error
      results {
        videoId
        title
        thumbnailUrl
        lengthSeconds
        viewCount
        downloaded
      }
    }
  }
`;

interface Props {
  query: string;
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const NiconicoSearchResults = ({ query }: Props) => {
  const data = useLazyLoadQuery<NiconicoSearchResultsQuery>(
    niconicoSearchResultsQuery,
    { query },
  );

  if (data.niconicoSearch.error) {
    return (
      <div className={styles.error}>
        Unable to search Niconico: {data.niconicoSearch.error}
      </div>
    );
  }

  if (data.niconicoSearch.results.length === 0) {
    return <span>No results found</span>;
  }

  return (
    <List>
      {data.niconicoSearch.results.map((video) => (
        <Link key={video.videoId} to={`/search/niconico/${video.videoId}`}>
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
                <span className={styles.numbers}>
                  {formatDuration(video.lengthSeconds)} · {video.viewCount}{" "}
                  views
                </span>
              </div>
            </div>
          </ListItem>
        </Link>
      ))}
    </List>
  );
};

export default withLoader(NiconicoSearchResults);
