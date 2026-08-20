import Hls from "hls.js";

import React, { useEffect, useRef, useState } from "react";
import { commitMutation, fetchQuery, graphql } from "react-relay";
import { PlayerPopSongMutation } from "./__generated__/PlayerPopSongMutation.graphql";

import environment from "../common/graphqlEnvironment";
import usePitchShiftSemis from "../common/hooks/usePitchShiftSemis";
import usePlaybackState from "../common/hooks/usePlaybackState";
import { KuroshiroSingleton } from "../common/joysoundParser";
import AdhocLyrics from "./AdhocLyrics";
import JoysoundRenderer from "./JoysoundRenderer";
import mediaUrl from "./mediaUrl";
import { InputDevice } from "./nativeAudio";
import PianoRoll from "./PianoRoll";
import "./Player.css";
import KarafriendsAudio from "./webAudio";
import YouTubeCaptionRenderer from "./YouTubeCaptionRenderer";

const popSongMutation = graphql`
  mutation PlayerPopSongMutation {
    popSong {
      ... on DamQueueItem {
        __typename
        songId
        streamingUrls {
          url
        }
        scoringData
        timestamp
        streamingUrlIdx
        name
        artistName
      }
      ... on JoysoundQueueItem {
        __typename
        songId
        timestamp
        name
        artistName
        isRomaji
        youtubeVideoId
      }
      ... on YoutubeQueueItem {
        __typename
        songId
        timestamp
        hasAdhocLyrics
        hasCaptions
        gainValue
        name
      }
      ... on NicoQueueItem {
        __typename
        songId
        timestamp
        name
      }
    }
  }
`;

const POLL_INTERVAL_MS = 5 * 1000;
// XXX: Another idea is to add some gain to the DAM videos?
const DAM_GAIN = 1.0;
const NON_DAM_GAIN = 0.8;

function updateMediaSessionMetadata(metadata: MediaMetadataInit) {
  if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined")
    return;

  try {
    navigator.mediaSession.metadata = new MediaMetadata(metadata);
  } catch (error) {
    console.warn("Unable to update media session metadata", error);
  }
}

function Player(props: {
  mics: InputDevice[];
  kuroshiro: KuroshiroSingleton;
  audio: KarafriendsAudio;
  youtubeKaraokeCaptions: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLTrackElement>(null);
  const [scoringData, setScoringData] = useState<readonly number[]>([]);

  const [joysoundTelop, setJoysoundTelop] = useState<ArrayBuffer | null>(null);
  const [shouldShowJoysound, setShouldShowJoysound] = useState<boolean>(false);
  const [joysoundIsRomaji, setJoysoundIsRomaji] = useState<boolean>(false);

  const [shouldShowPianoRoll, setShouldShowPianoRoll] = useState<boolean>(true);
  const [shouldShowAdhocLyrics, setShouldShowAdhocLyrics] =
    useState<boolean>(false);
  const [youtubeCaptionUrl, setYoutubeCaptionUrl] = useState<string | null>(
    null,
  );
  const [youtubeJson3CaptionUrl, setYoutubeJson3CaptionUrl] = useState<
    string | null
  >(null);
  const [customCaptionFailed, setCustomCaptionFailed] = useState(false);
  const { playbackState, setPlaybackState } = usePlaybackState();
  const { pitchShiftSemis, setPitchShiftSemis } = usePitchShiftSemis();
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const audioCtx = useRef<AudioContext | null>(null);
  const videoAudioSrc = useRef<MediaElementAudioSourceNode | null>(null);

  let hls: Hls | null = null;

  useEffect(() => {
    if (!videoRef.current) return;

    const pollQueue = () =>
      commitMutation<PlayerPopSongMutation>(environment, {
        mutation: popSongMutation,
        variables: {},
        onCompleted: ({ popSong }) => {
          if (!videoRef.current) return;

          if (popSong) {
            // Only reset caption/pitch state when we actually have a song to
            // play; doing it on every empty poll would spam the pitch-shift
            // mutation while idle.
            if (trackRef?.current) {
              trackRef.current.default = false;
              trackRef.current.src = "";
            }
            setYoutubeCaptionUrl(null);
            setYoutubeJson3CaptionUrl(null);

            setPitchShiftSemis(0);

            if (hls) hls.destroy();

            switch (popSong.__typename) {
              case "DamQueueItem":
                setShouldShowPianoRoll(true);
                setShouldShowJoysound(false);
                setShouldShowAdhocLyrics(false);
                setScoringData(popSong.scoringData);

                // If caching is on this means we'll be serving almost everything through /static
                // which seems kind of stupid, but whatever
                const fileUrl = mediaUrl(
                  `${popSong.songId}-${popSong.streamingUrlIdx}.mp4`,
                );

                const loadRemote = () => {
                  if (!videoRef.current) return;

                  hls = new Hls({ maxBufferLength: 90 /* seconds */ });
                  hls.attachMedia(videoRef.current);
                  hls.loadSource(
                    popSong.streamingUrls[popSong.streamingUrlIdx].url,
                  );
                };

                fetch(fileUrl, { method: "HEAD" })
                  .then((response) => {
                    // I can guarantee this does not happen
                    if (!videoRef.current) return;

                    if (response.ok) {
                      console.log(`Using local file for ${popSong.songId}`);
                      // This throws a random DOMException about load requests but it's probably fine
                      videoRef.current.src = fileUrl;
                    } else {
                      // Maybe it's not done downloading yet, or predownload is disabled
                      console.log(
                        `Local file for ${popSong.songId} doesn't seem available, using remote`,
                      );
                      loadRemote();
                    }
                    props.audio.gain(DAM_GAIN);

                    updateMediaSessionMetadata({
                      title: popSong.name,
                      artist: popSong.artistName,
                    });

                    videoRef.current.play();
                  })
                  .catch((error) => {
                    // This throws if the file doesn't exist (as karafriends:// is a file:// passthrough protocol)
                    console.log(
                      `Local file for ${popSong.songId} doesn't seem available, using remote`,
                    );
                    console.error(error);

                    // I can guarantee this does not happen
                    if (!videoRef.current) return;

                    // Pretend nothing happened.
                    loadRemote();

                    props.audio.gain(DAM_GAIN);

                    updateMediaSessionMetadata({
                      title: popSong.name,
                      artist: popSong.artistName,
                    });

                    videoRef.current.play();
                  });
                break;
              case "JoysoundQueueItem":
                setShouldShowPianoRoll(false);
                setShouldShowJoysound(true);
                setShouldShowAdhocLyrics(false);
                setJoysoundTelop(null);

                const filenameSuffix = popSong.youtubeVideoId
                  ? popSong.youtubeVideoId
                  : "default";

                const joysoundVideoUrl = mediaUrl(
                  `joysound-${popSong.songId}-${filenameSuffix}.mp4`,
                );
                const joysoundTelopUrl = mediaUrl(
                  `joysound-${popSong.songId}.joy_02`,
                );

                updateMediaSessionMetadata({
                  title: popSong.name,
                  artist: popSong.artistName,
                });

                const startJoysoundVideo = () => {
                  if (!videoRef.current) return;

                  videoRef.current.src = joysoundVideoUrl;
                  // Older Android WebViews return void from play() instead of
                  // a Promise, so normalize the result before handling errors.
                  void Promise.resolve(videoRef.current.play()).catch(
                    (error) => {
                      console.error("Failed to start Joysound video", error);
                    },
                  );
                };

                let joysoundTelopLoaded = false;
                const loadJoysoundTelop = (url: string) =>
                  fetch(url)
                    .then((resp) => {
                      if (!resp.ok) {
                        throw new Error(
                          `Joysound telop request failed with HTTP ${resp.status}`,
                        );
                      }

                      return resp.arrayBuffer();
                    })
                    .then((data) => {
                      joysoundTelopLoaded = true;
                      setJoysoundTelop(data);
                      setJoysoundIsRomaji(popSong.isRomaji);
                    });

                // Start playback independently. Some Android WebViews can
                // leave the first concurrent telop fetch pending, so retry it
                // with a cache-busting query without ever blocking the video.
                startJoysoundVideo();
                void loadJoysoundTelop(joysoundTelopUrl).catch((error) => {
                  console.error(
                    `Initial Joysound subtitle request failed for ${popSong.songId}`,
                    error,
                  );
                });
                window.setTimeout(() => {
                  if (joysoundTelopLoaded) return;

                  const separator = joysoundTelopUrl.includes("?") ? "&" : "?";
                  void loadJoysoundTelop(
                    `${joysoundTelopUrl}${separator}retry=${Date.now()}`,
                  ).catch((error) => {
                    console.error(
                      `Joysound subtitle retry failed for ${popSong.songId}`,
                      error,
                    );
                  });
                }, 2_000);

                break;
              case "YoutubeQueueItem":
                setShouldShowPianoRoll(false);
                setShouldShowJoysound(false);
                setShouldShowAdhocLyrics(popSong.hasAdhocLyrics);

                videoRef.current.src = mediaUrl(`yt-${popSong.songId}.mp4`);

                if (popSong.hasCaptions) {
                  setYoutubeCaptionUrl(mediaUrl(`yt-${popSong.songId}.vtt`));
                  setYoutubeJson3CaptionUrl(
                    mediaUrl(`yt-${popSong.songId}.json3`),
                  );
                }

                console.log(
                  `Using ${popSong.gainValue} for gain on Youtube queue item`,
                );
                props.audio.gain(popSong.gainValue);

                updateMediaSessionMetadata({
                  title: popSong.name,
                });

                videoRef.current.play();
                break;
              case "NicoQueueItem":
                setShouldShowPianoRoll(false);
                setShouldShowJoysound(false);
                setShouldShowAdhocLyrics(false);

                videoRef.current.src = mediaUrl(`nico-${popSong.songId}.mp4`);

                props.audio.gain(NON_DAM_GAIN);

                updateMediaSessionMetadata({
                  title: popSong.name,
                });

                videoRef.current.play();
                break;
            }
            setPlaybackState("PLAYING");
          } else {
            setPlaybackState("WAITING");
            pollTimeoutRef.current = setTimeout(pollQueue, POLL_INTERVAL_MS);
          }
        },
      });

    videoRef.current.onended = pollQueue;

    if (playbackState === "WAITING" && pollTimeoutRef.current === null) {
      pollTimeoutRef.current = setTimeout(pollQueue, POLL_INTERVAL_MS);
    }

    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);

        pollTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!videoRef.current) return;

    switch (playbackState) {
      case "PAUSED":
        videoRef.current.pause();
        break;
      case "PLAYING":
        videoRef.current.play();
        break;
      case "RESTARTING":
        videoRef.current.currentTime = 0;
        setPlaybackState("PLAYING");
        break;
      case "SKIPPING":
        if (isFinite(videoRef.current.duration))
          videoRef.current.currentTime = videoRef.current.duration;
        videoRef.current.play();
        break;
    }
  }, [playbackState]);

  useEffect(() => {
    props.audio.pitchShift(pitchShiftSemis);
  }, [props.audio, pitchShiftSemis]);

  useEffect(() => {
    setCustomCaptionFailed(false);
  }, [props.youtubeKaraokeCaptions, youtubeCaptionUrl]);

  const shouldUseCustomCaptions =
    props.youtubeKaraokeCaptions &&
    youtubeCaptionUrl !== null &&
    !customCaptionFailed;

  useEffect(() => {
    if (!trackRef.current) return;

    const shouldUseNativeCaptions =
      youtubeCaptionUrl !== null && !shouldUseCustomCaptions;
    trackRef.current.default = shouldUseNativeCaptions;
    trackRef.current.track.mode = shouldUseNativeCaptions
      ? "showing"
      : "disabled";
  }, [shouldUseCustomCaptions, youtubeCaptionUrl]);

  useEffect(() => {
    if (!videoRef.current) return;

    if (audioCtx.current !== props.audio.audioContext) {
      if (videoAudioSrc.current) {
        videoAudioSrc.current.disconnect();
      }

      audioCtx.current = props.audio.audioContext;
      videoAudioSrc.current = audioCtx.current.createMediaElementSource(
        videoRef.current,
      );
      videoAudioSrc.current.connect(props.audio.sink());
    }
  }, [props.audio, videoRef.current]);

  return (
    <div className="karaVidContainer">
      {shouldShowJoysound && joysoundTelop !== null ? (
        <JoysoundRenderer
          telop={joysoundTelop}
          isRomaji={joysoundIsRomaji}
          kuroshiro={props.kuroshiro}
          videoRef={videoRef}
        />
      ) : null}
      {shouldShowPianoRoll ? (
        <PianoRoll
          scoringData={scoringData}
          videoRef={videoRef}
          mics={props.mics}
          pitchShiftSemis={pitchShiftSemis}
        />
      ) : null}
      {shouldUseCustomCaptions &&
      youtubeCaptionUrl &&
      youtubeJson3CaptionUrl ? (
        <YouTubeCaptionRenderer
          json3Src={youtubeJson3CaptionUrl}
          videoRef={videoRef}
          vttSrc={youtubeCaptionUrl}
          onError={(error) => {
            console.error(
              "Custom YouTube caption renderer failed; using native captions",
              error,
            );
            setCustomCaptionFailed(true);
          }}
        />
      ) : null}
      <video
        className="karaVid"
        ref={videoRef}
        crossOrigin="anonymous"
        controls
        controlsList="nodownload noplaybackrate"
        disablePictureInPicture
      >
        <track ref={trackRef} kind="subtitles" src={youtubeCaptionUrl || ""} />
      </video>
      {shouldShowAdhocLyrics ? <AdhocLyrics /> : null}
    </div>
  );
}

export default Player;
