import { useEffect } from "react";
import { graphql, requestSubscription } from "react-relay";

import environment from "../../common/graphqlEnvironment";
import { markMediaDownloaded } from "../mediaDownloadCache";
import { useMediaDownloadUpdatesSubscription } from "./__generated__/useMediaDownloadUpdatesSubscription.graphql";

const mediaDownloadUpdatesSubscription = graphql`
  subscription useMediaDownloadUpdatesSubscription {
    mediaDownloadCompleted {
      source
      songId
      suffix
    }
  }
`;

export default function useMediaDownloadUpdates(): void {
  useEffect(() => {
    const subscription =
      requestSubscription<useMediaDownloadUpdatesSubscription>(environment, {
        subscription: mediaDownloadUpdatesSubscription,
        variables: {},
        onNext: (response) => {
          const completed = response?.mediaDownloadCompleted;
          if (!completed || completed.source === "%future added value") return;

          markMediaDownloaded(
            completed.source,
            completed.songId,
            completed.suffix,
          );
        },
      });

    return () => subscription.dispose();
  }, []);
}
