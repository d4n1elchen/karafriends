import { detectPitch, PitchSample } from "./pitchDetection";

export type { PitchSample } from "./pitchDetection";

export interface InputDeviceOption {
  id: string;
  name: string;
  channelCount: number;
}

function microphoneDebug(message: string, detail?: unknown): void {
  if (detail === undefined) {
    console.info(`[microphone:debug] ${message}`);
  } else {
    console.info(`[microphone:debug] ${message}`, detail);
  }
}

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
  private monitorCompressor: DynamicsCompressorNode | null = null;
  private samples: Float32Array<ArrayBuffer> | null = null;
  private debugLevelTimer: number | null = null;

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

    microphoneDebug("checking browser microphones", {
      origin: window.location.origin,
      secureContext: window.isSecureContext,
      requestPermission,
      userAgent: navigator.userAgent,
    });

    let grantedDevice: InputDeviceOption | undefined;
    if (requestPermission) {
      const permissionStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      const grantedTrack = permissionStream.getAudioTracks()[0];
      microphoneDebug("permission stream opened", {
        audioTrackCount: permissionStream.getAudioTracks().length,
        label: grantedTrack?.label || "",
        settings: grantedTrack?.getSettings(),
      });
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
    microphoneDebug(
      "enumerateDevices completed",
      devices.map((device) => ({
        kind: device.kind,
        label: device.label,
        hasDeviceId: Boolean(device.deviceId),
      })),
    );
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

    const audioContext = new AudioContext({ latencyHint: "interactive" });
    microphoneDebug("prepared AudioContext", {
      state: audioContext.state,
      sampleRate: audioContext.sampleRate,
    });
    // This must happen synchronously inside the click handler. Waiting for a
    // permission prompt first can consume the browser's user activation and
    // leave the monitoring context suspended on a new HTTPS origin.
    void audioContext.resume().then(
      () =>
        microphoneDebug("prepared AudioContext resume completed", {
          state: audioContext.state,
        }),
      (reason) =>
        console.error(
          "[microphone:debug] prepared AudioContext resume failed",
          reason,
        ),
    );
    return audioContext;
  }

  private async startBrowserInput(
    browserDeviceId: string,
    preparedAudioContext?: AudioContext,
  ): Promise<void> {
    microphoneDebug("requesting selected microphone", {
      hasDeviceId: Boolean(browserDeviceId),
      channelSelection: this.channelSelection,
      preparedAudioContextState: preparedAudioContext?.state,
    });
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: false,
        channelCount: { ideal: this.channelSelection + 1 },
        deviceId: browserDeviceId ? { exact: browserDeviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
      },
      video: false,
    });
    const track = this.stream.getAudioTracks()[0];
    microphoneDebug("selected microphone stream opened", {
      audioTrackCount: this.stream.getAudioTracks().length,
      label: track?.label || "",
      enabled: track?.enabled,
      muted: track?.muted,
      readyState: track?.readyState,
      settings: track?.getSettings(),
    });
    if (track) {
      track.addEventListener("mute", () =>
        microphoneDebug("microphone track muted"),
      );
      track.addEventListener("unmute", () =>
        microphoneDebug("microphone track unmuted"),
      );
      track.addEventListener("ended", () =>
        microphoneDebug("microphone track ended"),
      );
    }
    this.audioContext =
      preparedAudioContext || new AudioContext({ latencyHint: "interactive" });
    await this.audioContext.resume();
    microphoneDebug("monitoring AudioContext resumed", {
      state: this.audioContext.state,
      sampleRate: this.audioContext.sampleRate,
      baseLatency: this.audioContext.baseLatency,
      outputLatency: this.audioContext.outputLatency,
    });
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
    this.monitorCompressor = this.audioContext.createDynamicsCompressor();
    this.monitorCompressor.threshold.value = -12;
    this.monitorCompressor.knee.value = 12;
    this.monitorCompressor.ratio.value = 4;
    this.monitorCompressor.attack.value = 0.003;
    this.monitorCompressor.release.value = 0.25;
    this.samples = new Float32Array(this.analyser.fftSize);
    this.source.connect(this.splitter);
    this.splitter.connect(this.analyser, this.channelSelection);
    this.splitter.connect(this.monitorGain, this.channelSelection, 0);
    this.monitorGain.connect(this.monitorCompressor);
    this.monitorCompressor.connect(this.audioContext.destination);
    microphoneDebug("microphone monitoring graph connected");
    this.debugLevelTimer = window.setInterval(() => {
      if (!this.analyser || !this.samples) return;
      this.analyser.getFloatTimeDomainData(this.samples);
      const meanSquare =
        this.samples.reduce((sum, sample) => sum + sample * sample, 0) /
        this.samples.length;
      microphoneDebug("input level", {
        rms: Number(Math.sqrt(meanSquare).toFixed(4)),
        contextState: this.audioContext?.state,
        trackMuted: track?.muted,
        trackReadyState: track?.readyState,
      });
    }, 1000);
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
    this.monitorCompressor?.disconnect();
    if (this.debugLevelTimer !== null) {
      window.clearInterval(this.debugLevelTimer);
      this.debugLevelTimer = null;
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.audioContext?.close();
    this.stream = null;
    this.audioContext = null;
    this.source = null;
    this.splitter = null;
    this.analyser = null;
    this.monitorGain = null;
    this.monitorCompressor = null;
    this.samples = null;
    microphoneDebug("microphone stopped");
  }
}
