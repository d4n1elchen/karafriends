import React, { useEffect, useState } from "react";

import "./global";
import { InputDevice, InputDeviceOption } from "./nativeAudio";

const MicrophoneSettingOption = ({
  deviceId,
  name,
  channel,
}: {
  deviceId: string;
  name: string;
  channel: number;
}) => (
  <option
    data-device-id={deviceId}
    data-name={name}
    data-channel={channel}
    value={`${deviceId}_${channel}`}
  >
    {`${name} (Channel ${channel})`}
  </option>
);

interface Props {
  mic: InputDevice | null;
  onChange: (mic: InputDevice) => void;
}

export default function MicrophoneSetting({ mic, onChange }: Props) {
  const [devices, setDevices] = useState<InputDeviceOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshDevices = async (requestPermission: boolean) => {
    setLoading(true);
    setError(null);
    try {
      setDevices(await InputDevice.available(requestPermission));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Microphone access failed",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (window.karafriends.isDesktop || mic !== null) {
      void refreshDevices(false);
    }
  }, []);

  const enableBrowserMicrophone = async () => {
    setLoading(true);
    setError(null);
    try {
      const availableDevices = await InputDevice.available(true);
      setDevices(availableDevices);
      const defaultDevice =
        availableDevices.find((device) => device.id === "default") ||
        availableDevices[0];
      if (!defaultDevice) {
        throw new Error("No microphone was found by this browser.");
      }
      onChange(await InputDevice.create(defaultDevice, 0));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Microphone access failed",
      );
    } finally {
      setLoading(false);
    }
  };

  if (!window.karafriends.isDesktop && devices.length === 0) {
    return (
      <div>
        <button
          className="btn"
          disabled={loading}
          onClick={() => void enableBrowserMicrophone()}
        >
          {loading ? "Requesting microphone…" : "Enable microphone"}
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <div className="microphoneSetting">
      <label
        className="microphoneSettingLabel"
        htmlFor={`mic-${mic?.deviceId || "new"}`}
      >
        Microphone
      </label>
      <select
        id={`mic-${mic?.deviceId || "new"}`}
        className="browser-default microphoneSettingSelect"
        value={mic ? `${mic.deviceId}_${mic.channelSelection}` : ""}
        onChange={(e) => {
          const dataset = e.target.options[e.target.selectedIndex].dataset;
          const option = devices.find(
            (candidate) => candidate.id === dataset.deviceId,
          );
          if (!option) return;
          setLoading(true);
          setError(null);
          InputDevice.create(option, parseInt(dataset.channel!, 10))
            .then(onChange)
            .catch((reason) =>
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Microphone access failed",
              ),
            )
            .finally(() => setLoading(false));
        }}
        disabled={loading}
      >
        <option value="" disabled={true}>
          Select a microphone
        </option>
        {devices.map(({ id, name, channelCount }) =>
          [...Array(channelCount)].map((_, i) => (
            <MicrophoneSettingOption
              key={`${name}_${i}`}
              name={name}
              channel={i}
              deviceId={id}
            />
          )),
        )}
      </select>
      {mic && <span className="microphoneSettingStatus">Mic active</span>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
