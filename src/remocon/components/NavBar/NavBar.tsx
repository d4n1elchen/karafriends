import React from "react";
// tslint:disable-next-line:no-submodule-imports
import { FaArrowLeft, FaHistory, FaHome, FaUserEdit } from "react-icons/fa";
import { Link, useLocation, useNavigate } from "react-router";
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
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === "/";

  const goBack = () => {
    if (location.key === "default") {
      navigate("/", { replace: true });
    } else {
      navigate(-1);
    }
  };

  return (
    <div className={styles.navBar}>
      <div className={styles.actions}>
        {!isHome && (
          <button
            className={styles.iconButton}
            type="button"
            onClick={goBack}
            aria-label="Go back"
            title="Back"
          >
            <FaArrowLeft />
          </button>
        )}
        <Link to="/" aria-label="Home" title="Home">
          <FaHome />
        </Link>
      </div>
      <img height={40} src={icon} alt="空" />
      <div className={styles.actions}>
        <button
          className={styles.iconButton}
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
