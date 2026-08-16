import React, { FormEvent, useRef, useState } from "react";
// tslint:disable-next-line:no-submodule-imports
import { FaArrowLeft, FaHistory, FaHome, FaUserEdit } from "react-icons/fa";
import { Link, useLocation, useNavigate } from "react-router";
// tslint:disable-next-line:no-submodule-imports no-implicit-dependencies
import icon from "url:../../images/icon.png";

import { enableAdminMode } from "../../../common/adminMode";
import useConfig from "../../hooks/useConfig";
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
  const isAdmin = useConfig()?.isAdmin === true;
  const logoClicks = useRef(0);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);

  const clickLogo = () => {
    logoClicks.current += 1;
    if (logoClicks.current < 5) return;
    logoClicks.current = 0;
    setAdminError("");
    setShowAdminLogin(true);
  };

  const unlockAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = String(
      new FormData(event.currentTarget).get("password") || "",
    );
    setIsUnlocking(true);
    setAdminError("");
    try {
      await enableAdminMode(password);
      window.location.reload();
    } catch (error) {
      setAdminError(
        error instanceof Error ? error.message : "Unable to enable admin mode.",
      );
    } finally {
      setIsUnlocking(false);
    }
  };

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
        <Link to="/" aria-label="Home" title="Home">
          <FaHome />
        </Link>
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
      </div>
      <button
        className={`${styles.logoButton} ${isAdmin ? styles.adminEnabled : ""}`}
        type="button"
        onClick={clickLogo}
        aria-label={isAdmin ? "Admin mode enabled" : "Karafriends"}
        title={isAdmin ? "Admin mode enabled" : "Karafriends"}
      >
        <img height={40} src={icon} alt="空" />
      </button>
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
      {showAdminLogin && (
        <div className={styles.dialogBackdrop} role="presentation">
          <form
            className={styles.adminDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-login-title"
            onSubmit={unlockAdmin}
          >
            <h2 id="admin-login-title">
              {isAdmin ? "Admin mode enabled" : "Enable admin mode"}
            </h2>
            {!isAdmin && (
              <>
                <label htmlFor="admin-password">Admin password</label>
                <input
                  id="admin-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required={true}
                  autoFocus={true}
                />
                {adminError && <p role="alert">{adminError}</p>}
              </>
            )}
            <div className={styles.dialogActions}>
              <button type="button" onClick={() => setShowAdminLogin(false)}>
                {isAdmin ? "Close" : "Cancel"}
              </button>
              {!isAdmin && (
                <button type="submit" disabled={isUnlocking}>
                  {isUnlocking ? "Checking…" : "Enable"}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default NavBar;
