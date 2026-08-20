import React from "react";
// tslint:disable-next-line:no-submodule-imports
import { BsClockFill, BsEyeFill } from "react-icons/bs";

import * as styles from "./VideoMetadata.module.scss";

interface Props {
  titleAccessory?: React.ReactNode;
  videoSource: "youtube" | "niconico";
  videoInfo: {
    author: string;
    channelId: string;
    lengthSeconds: number;
    title: string;
    viewCount: number;
  };
}

const VideoMetadata = ({ titleAccessory, videoSource, videoInfo }: Props) => {
  const channelUrl =
    videoSource === "youtube"
      ? `https://www.youtube.com/channel/${videoInfo.channelId}`
      : `https://www.nicovideo.jp/user/${videoInfo.channelId}`;

  return (
    <div>
      <a className={styles.channel} href={channelUrl} target="_blank">
        {videoInfo.author}
      </a>
      <div className={styles.titleRow}>
        <div className={styles.title}>{videoInfo.title}</div>
        {titleAccessory}
      </div>
      <div className={styles.numbers}>
        <span>
          <BsEyeFill /> {videoInfo.viewCount}
        </span>
        <span>
          <BsClockFill /> {videoInfo.lengthSeconds}
        </span>
      </div>
    </div>
  );
};

export default VideoMetadata;
