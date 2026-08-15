import React from "react";
// tslint:disable-next-line:no-submodule-imports
import { FaHistory, FaHome, FaUserEdit } from "react-icons/fa";
import { Link } from "react-router";
// tslint:disable-next-line:no-submodule-imports no-implicit-dependencies
import icon from "url:../../images/icon.png";

import * as styles from "./NavBar.module.scss";

const NavBar = ({
  nickname,
  onResetNickname,
}: {
  nickname: string;
  onResetNickname: () => void;
}) => {
  return (
    <div className={styles.navBar}>
      <Link to="/">
        <FaHome />
      </Link>
      <img height={40} src={icon} alt="空" />
      <div className={styles.actions}>
        <button
          className={styles.nicknameButton}
          type="button"
          onClick={onResetNickname}
          aria-label={`Change nickname. Current nickname: ${nickname}`}
          title={`Change nickname (${nickname})`}
        >
          <FaUserEdit />
        </button>
        <Link to="/history" aria-label="Song history" title="Song history">
          <FaHistory />
        </Link>
      </div>
    </div>
  );
};

export default NavBar;
