import React, { FormEvent, useState } from "react";
import { HashRouter, Route, Routes } from "react-router";

import Button from "./components/Button";
import ControlBar from "./components/ControlBar";
import NavBar from "./components/NavBar";
import useUserIdentity from "./hooks/useUserIdentity";
import AdhocLyricsPage from "./pages/AdhocLyricsPage";
import ArtistPage from "./pages/ArtistPage";
import ArtistSearchPage from "./pages/ArtistSearchPage";
import HistoryPage from "./pages/HistoryPage";
import HomePage from "./pages/HomePage";
import JoysoundArtistPage from "./pages/JoysoundArtistPage";
import JoysoundArtistSearchPage from "./pages/JoysoundArtistSearchPage";
import JoysoundSongPage from "./pages/JoysoundSongPage";
import JoysoundSongSearchPage from "./pages/JoysoundSongSearchPage";
import NiconicoPage from "./pages/NiconicoPage";
import SongPage from "./pages/SongPage";
import SongSearchPage from "./pages/SongSearchPage";
import YouTubePage from "./pages/YouTubePage";

import * as styles from "./App.module.scss";
import useQueueNotifications from "./hooks/useQueueNotifications";

const App = () => {
  const { deviceId } = useUserIdentity();
  const [nickname, setNickname] = useState(
    () => localStorage.getItem("nickname") || "",
  );
  useQueueNotifications(deviceId);

  const resetNickname = () => {
    localStorage.removeItem("nickname");
    setNickname("");
  };

  if (!nickname) {
    const saveNickname = (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const nextNickname = String(form.get("nickname") || "").trim();
      if (!nextNickname) return;
      localStorage.setItem("nickname", nextNickname);
      setNickname(nextNickname);
    };

    return (
      <main className={`${styles.app} ${styles.joinScreen}`}>
        <form className={styles.joinCard} onSubmit={saveNickname}>
          <p className={styles.joinEyebrow}>Karafriends remote</p>
          <h1 className={styles.joinTitle}>Join karaoke</h1>
          <label className={styles.nicknameLabel} htmlFor="nickname">
            Your nickname
          </label>
          <input
            className={styles.nicknameInput}
            id="nickname"
            name="nickname"
            autoComplete="nickname"
            maxLength={40}
            required={true}
            autoFocus={true}
          />
          <Button full={true} type="submit">
            Join room
          </Button>
        </form>
      </main>
    );
  }

  return (
    <HashRouter>
      <div className={styles.app}>
        <header>
          <NavBar nickname={nickname} onResetNickname={resetNickname} />
        </header>
        <main>
          <Routes>
            <Route path="/song/:id" element={<SongPage />} />
            <Route path="/artist/:id" element={<ArtistPage />} />
            <Route path="/adhocLyrics/:id" element={<AdhocLyricsPage />} />
            <Route path="/joysoundSong/:id" element={<JoysoundSongPage />} />
            <Route
              path="/joysoundSong/:id/:youtubeVideoId"
              element={<JoysoundSongPage />}
            />
            <Route
              path="/joysoundArtist/:id"
              element={<JoysoundArtistPage />}
            />
            <Route path="/search/song/:query?" element={<SongSearchPage />} />
            <Route
              path="/search/artist/:query?"
              element={<ArtistSearchPage />}
            />
            <Route path="/search/youtube/:videoId?" element={<YouTubePage />} />
            <Route
              path="/search/niconico/:videoId?"
              element={<NiconicoPage />}
            />
            <Route
              path="/search/joysoundSong/:query?"
              element={<JoysoundSongSearchPage />}
            />
            <Route
              path="/search/joysoundArtist/:query?"
              element={<JoysoundArtistSearchPage />}
            />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/" element={<HomePage />} />
          </Routes>
        </main>
        <footer>
          <ControlBar />
        </footer>
      </div>
    </HashRouter>
  );
};

export default App;
