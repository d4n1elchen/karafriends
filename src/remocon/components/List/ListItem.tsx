import React from "react";

import * as styles from "./List.module.scss";

interface Props {
  children: React.ReactNode;
  cornerAccessory?: React.ReactNode;
}

const ListItem = ({ children, cornerAccessory }: Props) => (
  <div
    className={`${styles.listItem}${cornerAccessory ? ` ${styles.hasCornerAccessory}` : ""}`}
  >
    {cornerAccessory && (
      <div className={styles.cornerAccessory}>{cornerAccessory}</div>
    )}
    {children}
  </div>
);

export default ListItem;
