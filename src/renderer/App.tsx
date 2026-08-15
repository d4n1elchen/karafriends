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

    // Browsers may initially suspend Web Audio. Try immediately so normal
    // room navigation starts without an extra screen, then use the first
    // interaction anywhere in the player to satisfy stricter autoplay rules.
    const unlockAudio = () => {
      void props.audio
        .resume()
        .then(() => {
          if (props.audio.audioContext.state === "running") {
            window.removeEventListener("pointerdown", unlockAudio, true);
            window.removeEventListener("keydown", unlockAudio, true);
          }
        })
        .catch(() => {
          // Keep the listeners installed so a later user gesture can retry.
        });
    };
    unlockAudio();
    window.addEventListener("pointerdown", unlockAudio, true);
    window.addEventListener("keydown", unlockAudio, true);

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
      window.removeEventListener("pointerdown", unlockAudio, true);
      window.removeEventListener("keydown", unlockAudio, true);
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
    <div className="appMainContainer black row">
      <div
        className={`appPlayer col ${
          sidebarVisible ? "s11" : "s12"
        } valign-wrapper`}
      >
        <Player mics={mics} kuroshiro={props.kuroshiro} audio={props.audio} />
        <Effects />
      </div>
      {sidebarVisible && (
        <div className="appSidebar col s1 grey lighten-3">
          <QRCode hostname={hostname} />
          <nav className="center-align">Settings</nav>
          <div className="section center-align">
            <HostnameSetting hostname={hostname} onChange={setHostname} />
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
          <nav className="center-align">Queue</nav>
          <Queue />
        </div>
      )}
    </div>
  );
}

export default App;
