import React, { ReactNode } from "react";

import * as styles from "./SongTitle.module.scss";

interface Props {
  children?: ReactNode;
  title: string;
}

const SongTitle = ({ children, title }: Props) => (
  <div className={styles.row}>
    <h2>{title}</h2>
    {children}
  </div>
);

export default SongTitle;
