import M from "materialize-css";
import "materialize-css/dist/css/materialize.css"; // tslint:disable-line:no-submodule-imports
import React, { useEffect, useMemo, useRef, useState } from "react";
import { graphql, useSubscription } from "react-relay";

import { HOSTNAME } from "../common/constants";
import { KuroshiroSingleton } from "../common/joysoundParser";
import "./App.css";
import Effects from "./Effects";
import HostnameSetting from "./HostnameSetting";
import MicrophoneSetting from "./MicrophoneSetting";
import { InputDevice } from "./nativeAudio";
import Player from "./Player";
import QRCode from "./QRCode";
import Queue from "./Queue";
import KarafriendsAudio from "./webAudio";
import { AppQueueAddedSubscription } from "./__generated__/AppQueueAddedSubscription.graphql";

interface SavedMic {
  name: string;
  channel: number;
}

const songAddedSubscription = graphql`
  subscription AppQueueAddedSubscription {
    queueAdded {
      ... on QueueItemInterface {
        name
        artistName
      }
    }
  }
`;

function App(props: {
  kuroshiro: KuroshiroSingleton;
  audio: KarafriendsAudio;
}) {
  const [mics, _setMics] = useState<InputDevice[]>([]);
  const [hostname, setHostname] = useState(
    window.karafriends.isDesktop ? HOSTNAME : window.location.host,
  );
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [started, setStarted] = useState(window.karafriends.isDesktop);
  const [youtubeKaraokeCaptions, _setYoutubeKaraokeCaptions] = useState(
    () => localStorage.getItem("youtubeKaraokeCaptions") === "true",
  );

  const setYoutubeKaraokeCaptions = (enabled: boolean) => {
    localStorage.setItem("youtubeKaraokeCaptions", enabled.toString());
    _setYoutubeKaraokeCaptions(enabled);
  };

  const setMics = (newMics: InputDevice[]) => {
    const micsToSave = newMics.map((mic) => ({
      name: mic.name,
      channel: mic.channelSelection,
    }));
    localStorage.setItem("mics", JSON.stringify(micsToSave));
    _setMics(newMics);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "q" || event.key === "Q") {
      setSidebarVisible((visible) => !visible);
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);

    const savedMicInfo = JSON.parse(localStorage.getItem("mics") || "[]");
    if (window.karafriends.isDesktop) {
      void InputDevice.available().then((inputDevices) => {
        const devicesByName = new Map(
          inputDevices.map((device) => [device.name, device]),
        );
        return Promise.all(
          savedMicInfo
            .filter(({ name, channel }: SavedMic) => {
              const device = devicesByName.get(name);
              return device !== undefined && channel < device.channelCount;
            })
            .map(({ name, channel }: SavedMic) =>
              InputDevice.create(devicesByName.get(name)!, channel),
            ),
        ).then(setMics);
      });
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useSubscription<AppQueueAddedSubscription>(
    useMemo(
      () => ({
        variables: {},
        subscription: songAddedSubscription,
        onNext: (response) => {
          if (response)
            M.toast({
              html: `<h3>${response.queueAdded.name} - ${response.queueAdded.artistName}</h3>`,
            });
        },
      }),
      [songAddedSubscription],
    ),
  );

  const onChangeMic = (index: number, newMic: InputDevice) => {
    const updatedMics = [...mics];
    const oldMic = updatedMics.splice(index, 1, newMic)[0];
    if (oldMic) oldMic.stop();
    setMics(updatedMics);
  };

  const clearMics = () => {
    mics.forEach((mic) => mic.stop());
    setMics([]);
  };

  return (
    <div className="appMainContainer black">
      <div className="appPlayer valign-wrapper">
        {started ? (
          <Player
            mics={mics}
            kuroshiro={props.kuroshiro}
            audio={props.audio}
            youtubeKaraokeCaptions={youtubeKaraokeCaptions}
          />
        ) : (
          <div className="browserStart center-align white-text">
            <h1>Karafriends</h1>
            <p>Start the player to enable browser audio.</p>
            <button
              className="btn-large"
              onClick={() => {
                void props.audio.resume().then(() => setStarted(true));
              }}
            >
              Start karaoke
            </button>
          </div>
        )}
        <Effects />
      </div>
      {sidebarVisible && (
        <aside
          className={`appSidebar grey lighten-3 ${
            settingsExpanded ? "appSidebarSettingsExpanded" : ""
          }`}
        >
          <QRCode hostname={hostname} />
          <button
            className="appSidebarSectionToggle"
            type="button"
            aria-controls="player-settings"
            aria-expanded={settingsExpanded}
            onClick={() => setSettingsExpanded((expanded) => !expanded)}
          >
            <span>Settings</span>
            <span
              className={`appSidebarChevron ${
                settingsExpanded ? "appSidebarChevronExpanded" : ""
              }`}
              aria-hidden="true"
            >
              &#9662;
            </span>
          </button>
          {settingsExpanded && (
            <div
              id="player-settings"
              className="appSettings section center-align"
            >
              <HostnameSetting hostname={hostname} onChange={setHostname} />
              <button
                className={`youtubeCaptionModeSetting ${
                  youtubeKaraokeCaptions
                    ? "youtubeCaptionModeSettingEnabled"
                    : ""
                }`}
                type="button"
                role="switch"
                aria-checked={youtubeKaraokeCaptions}
                onClick={() =>
                  setYoutubeKaraokeCaptions(!youtubeKaraokeCaptions)
                }
              >
                <span
                  className="youtubeCaptionModeIndicator"
                  aria-hidden="true"
                />
                <span>
                  Karaoke YouTube captions
                  <small>Experimental</small>
                </span>
              </button>
              {mics.map((mic, i) => (
                <MicrophoneSetting
                  key={mic.deviceId}
                  onChange={onChangeMic.bind(null, i)}
                  mic={mic}
                />
              ))}
              <MicrophoneSetting
                onChange={onChangeMic.bind(null, mics.length)}
                mic={null}
              />
              <button className="btn" onClick={clearMics}>
                Clear mics
              </button>
            </div>
          )}
          <nav className="center-align">Queue</nav>
          <Queue />
        </aside>
      )}
    </div>
  );
}

export default App;
