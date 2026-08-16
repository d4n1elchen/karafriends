import { detectPitch, PitchSample } from "./pitchDetection";

export type { PitchSample } from "./pitchDetection";

export interface InputDeviceOption {
  id: string;
  name: string;
  channelCount: number;
}

type LowLatencyMediaTrackConstraints = MediaTrackConstraints & {
  latency?: number | { ideal?: number };
};

const registry = new FinalizationRegistry<number>((deviceId) => {
  window.karafriends.nativeAudio.inputDevice_delete(deviceId);
});

export class InputDevice {
  deviceId: number | string;
  name: string;
  channelSelection: number;

  private nativeDeviceId: number | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private splitter: ChannelSplitterNode | null = null;
  private analyser: AnalyserNode | null = null;
  private monitorGain: GainNode | null = null;
  private samples: Float32Array<ArrayBuffer> | null = null;

  private constructor(option: InputDeviceOption, channelSelection: number) {
    this.deviceId = option.id;
    this.name = option.name;
    this.channelSelection = channelSelection;
  }

  static async available(
    requestPermission = false,
  ): Promise<InputDeviceOption[]> {
    if (window.karafriends.isDesktop) {
      return window.karafriends.nativeAudio
        .inputDevices()
        .map(([name, channelCount]) => ({ id: name, name, channelCount }));
    }

    if (
      !navigator.mediaDevices?.enumerateDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      throw new Error(
        window.isSecureContext
          ? "Microphone access is not supported by this browser."
          : "Microphone access requires HTTPS or localhost.",
      );
    }

    let grantedDevice: InputDeviceOption | undefined;
    if (requestPermission) {
      const permissionStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      const grantedTrack = permissionStream.getAudioTracks()[0];
      if (grantedTrack) {
        const settings = grantedTrack.getSettings();
        grantedDevice = {
          // An empty id intentionally asks getUserMedia for the browser's
          // already-authorized default input. Some TV/mobile browsers grant a
          // stream but still return no entries from enumerateDevices().
          id: "",
          name: grantedTrack.label || "Default microphone",
          channelCount: Math.max(settings.channelCount || 1, 1),
        };
      }
      permissionStream.getTracks().forEach((track) => track.stop());
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputDevices = devices
      .filter((device) => device.kind === "audioinput")
      .map((device, index) => ({
        id: device.deviceId,
        name: device.label || `Microphone ${index + 1}`,
        // Browsers generally expose a mixed mono input. The actual stream
        // settings are inspected after opening it, but one selectable channel
        // is the only portable pre-permission representation.
        channelCount: 1,
      }));
    return inputDevices.length > 0
      ? inputDevices
      : grantedDevice
        ? [grantedDevice]
        : [];
  }

  static async create(
    option: InputDeviceOption,
    channelSelection: number,
    preparedAudioContext?: AudioContext,
  ): Promise<InputDevice> {
    const device = new InputDevice(option, channelSelection);
    if (window.karafriends.isDesktop) {
      device.nativeDeviceId = window.karafriends.nativeAudio.inputDevice_new(
        option.name,
        channelSelection,
      );
      device.deviceId = device.nativeDeviceId;
      registry.register(device, device.nativeDeviceId);
      return device;
    }

    await device.startBrowserInput(option.id, preparedAudioContext);
    return device;
  }

  static prepareBrowserAudio(): AudioContext | undefined {
    if (window.karafriends.isDesktop) return undefined;

    const audioContext = new AudioContext({ latencyHint: 0.01 });
    // This must happen synchronously inside the click handler. Waiting for a
    // permission prompt first can consume the browser's user activation and
    // leave the monitoring context suspended on a new HTTPS origin.
    void audioContext.resume().catch(() => {
      // startBrowserInput retries and reports the error after permission.
    });
    return audioContext;
  }

  private async startBrowserInput(
    browserDeviceId: string,
    preparedAudioContext?: AudioContext,
  ): Promise<void> {
    const audioConstraints: LowLatencyMediaTrackConstraints = {
      autoGainControl: false,
      channelCount: { ideal: this.channelSelection + 1 },
      deviceId: browserDeviceId ? { exact: browserDeviceId } : undefined,
      echoCancellation: false,
      latency: { ideal: 0 },
      noiseSuppression: false,
    };
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
      video: false,
    });
    this.audioContext =
      preparedAudioContext || new AudioContext({ latencyHint: 0.01 });
    await this.audioContext.resume();
    if (this.audioContext.state !== "running") {
      throw new Error(
        "The browser blocked microphone playback. Tap Enable microphone again.",
      );
    }
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.splitter = this.audioContext.createChannelSplitter(
      Math.max(this.channelSelection + 1, 1),
    );
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0;
    this.monitorGain = this.audioContext.createGain();
    this.monitorGain.gain.value = 1;
    this.samples = new Float32Array(this.analyser.fftSize);
    this.source.connect(this.splitter);
    this.splitter.connect(this.analyser, this.channelSelection);
    this.splitter.connect(this.monitorGain, this.channelSelection, 0);
    this.monitorGain.connect(this.audioContext.destination);
  }

  getPitch(): PitchSample {
    if (this.nativeDeviceId !== null) {
      return window.karafriends.nativeAudio.inputDevice_getPitch(
        this.nativeDeviceId,
      );
    }
    if (!this.analyser || !this.samples || !this.audioContext) {
      return { midiNumber: 0, confidence: 0 };
    }

    this.analyser.getFloatTimeDomainData(this.samples);
    return detectPitch(this.samples, this.audioContext.sampleRate);
  }

  stop(): void {
    if (this.nativeDeviceId !== null) {
      window.karafriends.nativeAudio.inputDevice_stop(this.nativeDeviceId);
      return;
    }
    this.source?.disconnect();
    this.splitter?.disconnect();
    this.analyser?.disconnect();
    this.monitorGain?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.audioContext?.close();
    this.stream = null;
    this.audioContext = null;
    this.source = null;
    this.splitter = null;
    this.analyser = null;
    this.monitorGain = null;
    this.samples = null;
  }
}
