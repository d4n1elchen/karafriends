import type { KarafriendsConfig } from "../common/config";

const browserConfig: KarafriendsConfig = {
  useLowBitrateUrl: false,
  paxSongQueueLimit: 1,
  devPort:
    Number(window.location.port) ||
    (window.location.protocol === "https:" ? 443 : 80),
  remoconPort:
    Number(window.location.port) ||
    (window.location.protocol === "https:" ? 443 : 80),
  damUsername: "",
  damPassword: "",
  joysoundEmail: "",
  joysoundPassword: "",
  adminNicks: [],
  adminDeviceIds: [],
  supervisedMode: false,
  proxyEnable: false,
  proxyHost: "",
  proxyPort: 0,
  proxyUser: "",
  proxyPass: "",
};

// The desktop preload exposes this bridge synchronously. A normal browser has
// no native device API, so provide the same shape with safe, empty fallbacks;
// browser microphone support can then be layered on with getUserMedia without
// making the rest of the player Electron-aware.
if (window.karafriends === undefined) {
  window.karafriends = {
    isDesktop: false,
    ipAddresses: () => [],
    karafriendsConfig: () => browserConfig,
    nativeAudio: {
      inputDevices: () => [],
      outputDevices: () => [],
      inputDevice_new: () => {
        throw new Error("Native microphones are unavailable in a web browser");
      },
      inputDevice_delete: () => undefined,
      inputDevice_getPitch: () => ({ midiNumber: 0, confidence: 0 }),
      inputDevice_stop: () => undefined,
    },
  };
}
