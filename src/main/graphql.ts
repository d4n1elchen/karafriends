import { randomBytes } from "crypto";
import fs from "fs";
import { createServer, IncomingMessage } from "http";
import path from "path";
import { WebSocketServer } from "ws";

import { ApolloServer } from "@apollo/server"; // tslint:disable-line:no-submodule-imports
import {
  ApolloServerPluginCacheControlDisabled,
  ApolloServerPluginInlineTraceDisabled,
  ApolloServerPluginLandingPageDisabled,
  ApolloServerPluginSchemaReportingDisabled,
  ApolloServerPluginUsageReportingDisabled,
} from "@apollo/server/plugin/disabled"; // tslint:disable-line:no-submodule-imports
// tslint:disable-next-line:no-submodule-imports
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { type FetcherRequestInit } from "@apollo/utils.fetcher";
// tslint:disable-next-line:no-submodule-imports
import { expressMiddleware } from "@as-integrations/express5";
import { makeExecutableSchema } from "@graphql-tools/schema";
import express, { Application, Request } from "express";
import { PubSub } from "graphql-subscriptions";
import { useServer } from "graphql-ws/use/ws"; // tslint:disable-line:no-submodule-imports
import nodeFetch from "node-fetch";
import tunnel from "tunnel";
import { Innertube } from "youtubei.js";

// tslint:disable-next-line:no-submodule-imports no-implicit-dependencies
import rawSchema from "inline-string:../common/schema.graphql";
import {
  REMOCON_ADMIN_LOGIN_PATH,
  REMOCON_ADMIN_TOKEN_HEADER,
} from "../common/adminAuthCore";
import karafriendsConfig from "../common/config";
import { debugError } from "../common/debug";
import { normalizeMediaCacheSuffix } from "../common/mediaCacheCore";
import { getNiconicoMetadata } from "../common/niconicoMetadata";
import { NiconicoSearchResult, searchNiconico } from "../common/niconicoSearch";
import { normalizeRoomId } from "../common/roomIdCore";
import { getYoutubeMetadataWithYtDlp } from "../common/youtubeMetadata";
import { youtubeSearchResultHasCaptions } from "../common/youtubeSearchCore";
import {
  downloadDamVideo,
  downloadJoysoundData,
  downloadNicoVideo,
  downloadYoutubeVideo,
  getVideoDownloadProgress,
  isAnyMediaDownloaded,
  isMediaDownloaded,
  TEMP_FOLDER,
} from "./../common/videoDownloader";
import { DkwebsysAPI, MinseiAPI, MinseiCredentialsProvider } from "./damApi";
import { JoysoundAPI, JoysoundCredentialsProvider } from "./joysoundApi";
import { secureEqual } from "../server/webAuthCore";

import { memoize } from "lodash";
import "regenerator-runtime/runtime"; // tslint:disable-line:no-submodule-imports

export interface IGraphQLContext {
  dataSources: {
    minsei: MinseiAPI;
    joysound: JoysoundAPI;
    dkwebsys: DkwebsysAPI;
    youtube: Innertube;
  };
  room: RoomRuntime;
  isAdmin: boolean;
}

interface JoysoundSongParent {
  readonly id: string;
  readonly name: string;
  readonly artistName: string;
  readonly lyricsPreview?: string | null;
  readonly tieUp?: string | null;
}

interface JoysoundArtistParent {
  readonly id: string;
  readonly name: string;
}

interface SongParent {
  readonly id: string;
  readonly name: string;
  readonly nameYomi: string;
  readonly artistName: string;
  readonly artistNameYomi: string;
  readonly lyricsPreview?: string | null;
  readonly vocalTypes?: string[];
  readonly tieUp?: string | null;
  readonly playtime?: number | null;
}

interface ArtistParent {
  readonly id: string;
  readonly name: string;
  readonly nameYomi: string;
  readonly songCount: number;
}

interface Artist extends ArtistParent {
  readonly songs: Connection<SongParent, string>;
}

interface Connection<NodeType, CursorType> {
  readonly edges: Edge<NodeType, CursorType>[];
  readonly pageInfo: PageInfo<CursorType>;
}

interface Edge<NodeType, CursorType> {
  readonly node: NodeType;
  readonly cursor: CursorType;
}

interface PageInfo<CursorType> {
  readonly hasPreviousPage: boolean;
  readonly hasNextPage: boolean;
  readonly startCursor: CursorType;
  readonly endCursor: CursorType;
}

interface CaptionLanguage {
  code: string;
  name: string;
}

interface VideoInfo {
  readonly author: string;
  readonly channelId: string;
  readonly lengthSeconds: number;
  readonly description: string;
  readonly title: string;
  readonly viewCount: number;
}

interface YoutubeVideoInfo extends VideoInfo {
  readonly __typename: "YoutubeVideoInfo";
  readonly captionLanguages: CaptionLanguage[];
  readonly keywords: string[];
  readonly gainValue: number;
}

interface YoutubeVideoInfoError {
  readonly __typename: "YoutubeVideoInfoError";
  readonly reason: string;
}

type YoutubeVideoInfoResult = YoutubeVideoInfo | YoutubeVideoInfoError;

interface YoutubeSearchResult {
  readonly videoId: string;
  readonly title: string;
  readonly author: string;
  readonly thumbnailUrl: string | null;
  readonly duration: string | null;
  readonly hasCaptions: boolean;
}

interface YoutubeSearchResponse {
  readonly results: YoutubeSearchResult[];
  readonly error: string | null;
}

interface NicoVideoInfo extends VideoInfo {
  readonly __typename: "NicoVideoInfo";
  readonly thumbnailUrl: string;
}

interface NicoVideoInfoError {
  readonly __typename: "NicoVideoInfoError";
  readonly reason: string;
}

type NicoVideoInfoResult = NicoVideoInfo | NicoVideoInfoError;

interface NiconicoSearchResponse {
  readonly results: NiconicoSearchResult[];
  readonly error: string | null;
}

export interface UserIdentity {
  readonly deviceId: string;
  readonly nickname: string;
}

interface QueueItemInterface {
  readonly songId: string;
  readonly name: string;
  readonly artistName: string;
  readonly playtime?: number | null;
  readonly timestamp: string;
  readonly userIdentity: UserIdentity;
}

export interface JoysoundQueueItem extends QueueItemInterface {
  readonly __typename: "JoysoundQueueItem";
  readonly isRomaji: boolean;
  readonly youtubeVideoId: string | null;
}

interface DamQueueItem extends QueueItemInterface {
  readonly __typename: "DamQueueItem";
  readonly streamingUrlIdx: number;
}

interface YoutubeQueueItem extends QueueItemInterface {
  readonly __typename: "YoutubeQueueItem";
  readonly hasAdhocLyrics: boolean;
  readonly hasCaptions: boolean;
  readonly captionCode: string | null;
  readonly gainValue: number;
}

interface NicoQueueItem extends QueueItemInterface {
  readonly __typename: "NicoQueueItem";
}

type QueueItem =
  DamQueueItem | JoysoundQueueItem | YoutubeQueueItem | NicoQueueItem;

type QueueSongInfo = {
  readonly __typename: "QueueSongInfo";
  readonly eta: number;
};

interface QueueSongError {
  readonly __typename: "QueueSongError";
  readonly reason: string;
}

export type QueueSongResult = QueueSongInfo | QueueSongError;

type Emote = {
  readonly userIdentity: UserIdentity;
  readonly emote: string;
};

type QueueDamSongInput = {
  readonly songId: string;
  readonly name: string;
  readonly artistName: string;
  readonly playtime?: number | null;
  readonly streamingUrlIdx: number;
  readonly userIdentity: UserIdentity;
};

type QueueJoysoundSongInput = {
  readonly songId: string;
  readonly name: string;
  readonly artistName: string;
  readonly playtime?: number | null;
  readonly userIdentity: UserIdentity;
  readonly isRomaji: boolean;
  readonly youtubeVideoId: string | null;
};

type QueueYoutubeSongInput = {
  readonly songId: string;
  readonly name: string;
  readonly artistName: string;
  readonly playtime?: number | null;
  readonly userIdentity: UserIdentity;
  readonly adhocSongLyrics: string;
  readonly captionCode: string | null;
  readonly gainValue: number;
};

type QueueNicoSongInput = {
  readonly songId: string;
  readonly name: string;
  readonly artistName: string;
  readonly playtime?: number | null;
  readonly userIdentity: UserIdentity;
};

interface SongHistoryItem {
  readonly song: QueueItem;
}

interface SubscriptionQueueChanged {
  readonly currentSong: QueueItem | null;
  readonly newQueue: QueueItem[];
}

enum PlaybackState {
  PAUSED = "PAUSED",
  PLAYING = "PLAYING",
  RESTARTING = "RESTARTING",
  SKIPPING = "SKIPPING",
  WAITING = "WAITING",
}

type PushAdhocLyricsInput = {
  readonly lyric: string;
  readonly lyricIndex: number;
};

type AdhocLyricsEntry = {
  readonly lyric: string;
  readonly lyricIndex: number;
};

export interface DownloadQueueItem {
  downloadType: number;
  userIdentity: UserIdentity;
  songId: string;
  suffix: string | null;
  progress: number;
}

interface VideoDownloadProgress {
  progress: number;
}

export type RoomDatabase = {
  currentSong: QueueItem | null;
  currentSongAdhocLyrics: AdhocLyricsEntry[];
  idToAdhocLyrics: Record<string, string[]>;
  pitchShiftSemis: number;
  playbackState: PlaybackState;
  songQueue: QueueItem[];
  downloadQueue: DownloadQueueItem[];
  songHistory: SongHistoryItem[];
};

enum SubscriptionEvent {
  CurrentSongAdhocLyricsChanged = "CurrentSongAdhocLyricsChanged",
  CurrentSongChanged = "CurrentSongChanged",
  Emote = "Emote",
  MediaDownloadCompleted = "MediaDownloadCompleted",
  PitchShiftSemisChanged = "PitchShiftSemisChanged",
  PlaybackStateChanged = "PlaybackStateChanged",
  QueueAdded = "QueueAdded",
  QueueChanged = "QueueChanged",
}

export interface RoomRuntime {
  id: string;
  db: RoomDatabase;
  dbPath: string;
  pubsub: PubSub;
  remoteToken: string;
}

function publishMediaDownloadCompleted(
  source: "DAM" | "JOYSOUND" | "YOUTUBE" | "NICONICO",
  songId: string,
  suffix: string | null = null,
): void {
  for (const room of rooms.values()) {
    room.pubsub.publish(SubscriptionEvent.MediaDownloadCompleted, {
      mediaDownloadCompleted: { source, songId, suffix },
    });
  }
}

function defaultDatabase(): RoomDatabase {
  return {
    currentSong: null,
    currentSongAdhocLyrics: [],
    idToAdhocLyrics: {},
    pitchShiftSemis: 0,
    playbackState: PlaybackState.WAITING,
    songQueue: [],
    downloadQueue: [],
    songHistory: [],
  };
}

const rooms = new Map<string, RoomRuntime>();
const MAX_ACTIVE_ROOMS = 100;

export function getExistingRoom(roomIdValue: unknown): RoomRuntime | null {
  return rooms.get(normalizeRoomId(roomIdValue)) || null;
}

export function getRoom(roomIdValue: unknown): RoomRuntime {
  const id = normalizeRoomId(roomIdValue);
  const existing = rooms.get(id);
  if (existing) return existing;

  if (rooms.size >= MAX_ACTIVE_ROOMS) {
    throw new Error(
      `Maximum active room limit (${MAX_ACTIVE_ROOMS}) reached; restart the server to clear inactive rooms`,
    );
  }

  const dbPath =
    id === "main"
      ? path.resolve(TEMP_FOLDER, "queue.json")
      : path.resolve(TEMP_FOLDER, "rooms", id, "queue.json");
  const room: RoomRuntime = {
    id,
    db: loadDb(dbPath),
    dbPath,
    pubsub: new PubSub(),
    remoteToken: randomBytes(32).toString("base64url"),
  };
  rooms.set(id, room);
  return room;
}

// TODO: write a db interface and call these from within mutating methods instead of at their call sites
function saveDb(room: RoomRuntime) {
  try {
    fs.mkdirSync(path.dirname(room.dbPath), { recursive: true });
    const serialized = JSON.stringify({
      ...room.db,
      pitchShiftSemis: 0,
      currentSong: null,
      currentSongAdhocLyrics: [],
      songQueue: [room.db.currentSong, ...room.db.songQueue].filter(Boolean),
      downloadQueue: [],
    });
    // Write to a temp file and rename into place so an interrupted write can
    // never leave a half-written queue.json that fails to parse on next launch.
    const tmpPath = `${room.dbPath}.tmp`;
    fs.writeFileSync(tmpPath, serialized, "utf-8");
    fs.renameSync(tmpPath, room.dbPath);
  } catch (err) {
    // A failed persist shouldn't take down the app; the in-memory queue is
    // still intact and will be retried on the next mutation.
    console.error(`Failed to persist room ${room.id} queue:`, err);
  }
}

function loadDb(dbPath: string): RoomDatabase {
  const defaults = defaultDatabase();
  if (!fs.existsSync(dbPath)) {
    return defaults;
  }
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(dbPath, "utf-8")) };
  } catch (err) {
    // A corrupt or partially-written queue.json (e.g. an interrupted save or a
    // power loss mid-party) previously threw here at startup, bricking every
    // launch. Preserve the bad file for debugging and start from a clean state.
    console.error(
      `Failed to load saved queue from ${dbPath}; ignoring it:`,
      err,
    );
    try {
      fs.renameSync(dbPath, `${dbPath}.corrupt`);
    } catch (renameErr) {
      console.error("Failed to back up corrupt queue file:", renameErr);
    }
    return defaults;
  }
}

function hasMaxSongsInQueue(
  room: RoomRuntime,
  userIdentity: UserIdentity,
  isAdmin: boolean,
): boolean {
  // Not very efficient, but surely the queue won't ever get so big that this would be considered expensive
  const songsQueuedByUser: number = room.db.songQueue.filter(
    (x) => x.userIdentity.deviceId === userIdentity.deviceId,
  ).length;

  const songsDownloadingByUser: number = room.db.downloadQueue.filter(
    (x) => x.userIdentity.deviceId === userIdentity.deviceId,
  ).length;

  console.log(
    `hasMaxSongsInQueue: user ${userIdentity.nickname} has ${songsQueuedByUser}, ${songsDownloadingByUser} downloading`,
  );
  return (
    !isAdmin &&
    karafriendsConfig.paxSongQueueLimit > 0 &&
    songsQueuedByUser + songsDownloadingByUser >=
      karafriendsConfig.paxSongQueueLimit
  );
}

function pushSongToQueue(
  room: RoomRuntime,
  queueItem: QueueItem,
  pushToHead: boolean = false,
): QueueSongResult {
  const eta =
    (room.db.currentSong?.playtime || 0) +
    room.db.songQueue.reduce((acc, cur) => acc + (cur.playtime || 0), 0);

  console.log(
    `pushSongToQueue: pushing ${JSON.stringify(
      queueItem,
    )} with an eta of ${eta}; pushToHead=${pushToHead}`,
  );

  if (pushToHead === true) {
    // To give things time to download, we don't actually push to the front, but the second.
    // Due to :js:, this is OK regardless of the size of db.songQueue
    room.db.songQueue.splice(1, 0, queueItem);
  } else {
    room.db.songQueue.push(queueItem);
  }

  room.pubsub.publish(SubscriptionEvent.QueueChanged, {
    queueChanged: {
      currentSong: room.db.currentSong,
      newQueue: room.db.songQueue,
    },
  });

  room.pubsub.publish(SubscriptionEvent.QueueAdded, {
    queueAdded: queueItem,
  });

  saveDb(room);

  return {
    __typename: "QueueSongInfo",
    eta,
  };
}

function cleanupAdhocSongLyrics(lyrics: string): string[] {
  return lyrics.split("\n").filter((entry) => entry.trim() !== "");
}

const resolvers = {
  JoysoundSong: {
    id(parent: JoysoundSongParent) {
      return parent.id;
    },
    name(parent: JoysoundSongParent) {
      return parent.name;
    },
    artistName(parent: JoysoundSongParent) {
      return parent.artistName;
    },
    downloaded(parent: JoysoundSongParent) {
      return isAnyMediaDownloaded("JOYSOUND", parent.id);
    },
  },

  Song: {
    id(parent: SongParent) {
      return parent.id;
    },
    downloaded(parent: SongParent) {
      return isAnyMediaDownloaded("DAM", parent.id);
    },
    name(parent: SongParent) {
      return parent.name;
    },
    nameYomi(parent: SongParent) {
      return parent.nameYomi;
    },
    artistName(parent: SongParent) {
      return parent.artistName;
    },
    artistNameYomi(parent: SongParent) {
      return parent.artistNameYomi;
    },
    lyricsPreview(parent: SongParent) {
      return parent.lyricsPreview || null;
    },
    vocalTypes(parent: SongParent) {
      return parent.vocalTypes || [];
    },
    tieUp(parent: SongParent) {
      return parent.tieUp || null;
    },
    playtime(parent: SongParent) {
      return parent.playtime || null;
    },
    streamingUrls(
      parent: SongParent,
      _: any,
      { dataSources }: IGraphQLContext,
    ) {
      return dataSources.minsei.getMusicStreamingUrls(parent.id).then((data) =>
        data.list.map((info) => ({
          url: karafriendsConfig.useLowBitrateUrl
            ? info.lowBitrateUrl
            : info.highBitrateUrl,
        })),
      );
    },
    scoringData(parent: SongParent, _: any, { dataSources }: IGraphQLContext) {
      return dataSources.minsei
        .getScoringData(parent.id)
        .then((data) => Array.from(new Uint8Array(data)));
    },
  },

  YoutubeSearchResult: {
    downloaded(parent: { videoId: string }) {
      return isAnyMediaDownloaded("YOUTUBE", parent.videoId);
    },
  },

  NiconicoSearchResult: {
    downloaded(parent: { videoId: string }) {
      return isAnyMediaDownloaded("NICONICO", parent.videoId);
    },
  },
  Artist: {
    id(parent: ArtistParent) {
      return parent.id;
    },
    name(parent: ArtistParent) {
      return parent.name;
    },
    nameYomi(parent: ArtistParent) {
      return parent.nameYomi;
    },
    songCount(parent: ArtistParent) {
      return parent.songCount;
    },
    songs(
      parent: ArtistParent,
      args: { first: number | null; after: string | null },
      { dataSources }: IGraphQLContext,
    ) {
      const firstInt = args.first || 0;
      const afterInt = args.after ? parseInt(args.after, 10) : 0;

      return dataSources.dkwebsys
        .getMusicListByArtist(parent.id, firstInt, afterInt)
        .then((result) => ({
          edges: result.list.map((song, i) => ({
            node: {
              id: song.requestNo,
              name: song.title,
              nameYomi: song.titleYomi,
              artistName: song.artist,
              artistNameYomi: song.artistYomi,
            },
            cursor: (firstInt + 1).toString(),
          })),
          pageInfo: {
            hasPreviousPage: false,
            hasNextPage: firstInt + afterInt < result.data.totalCount,
            startCursor: "0",
            endCursor: (firstInt + afterInt).toString(),
          },
        }));
    },
  },
  DamQueueItem: {
    streamingUrls(
      parent: DamQueueItem,
      _: any,
      { dataSources }: IGraphQLContext,
    ) {
      return dataSources.minsei
        .getMusicStreamingUrls(parent.songId)
        .then((data) =>
          data.list.map((info) => ({
            url: karafriendsConfig.useLowBitrateUrl
              ? info.lowBitrateUrl
              : info.highBitrateUrl,
          })),
        );
    },
    scoringData(
      parent: DamQueueItem,
      _: any,
      { dataSources }: IGraphQLContext,
    ) {
      return dataSources.minsei
        .getScoringData(parent.songId)
        .then((data) => Array.from(new Uint8Array(data)));
    },
  },
  Query: {
    adhocLyrics(
      _: any,
      args: { id: string },
      { room }: IGraphQLContext,
    ): string[] {
      return room.db.idToAdhocLyrics[args.id];
    },
    joysoundSongDetail: (
      _: any,
      args: { id: string },
      { dataSources }: IGraphQLContext,
    ): Promise<JoysoundSongParent> => {
      return dataSources.joysound.getSongDetail(args.id).then((data) => ({
        id: args.id,
        ...data,
      }));
    },
    joysoundSongsByArtist: (
      _: any,
      args: { artistId: string; first: number | null; after: string | null },
      { dataSources }: IGraphQLContext,
    ): Promise<Connection<JoysoundSongParent, string>> => {
      const firstInt = args.first || 100;
      const afterInt = args.after ? parseInt(args.after, 10) : 1;

      return dataSources.joysound
        .getSongListByArtist(args.artistId, afterInt, firstInt)
        .then((result) => ({
          edges: result.map((song, i) => ({
            node: {
              id: song.selSongNo,
              name: song.songName,
              artistName: song.artistName,
            },
            cursor: (firstInt + i).toString(),
          })),
          pageInfo: {
            hasPreviousPage: false,
            hasNextPage: result.length === firstInt,
            startCursor: "1",
            endCursor: (firstInt + afterInt).toString(),
          },
        }));
    },
    joysoundSongsByKeyword: (
      _: any,
      args: { keyword: string; first: number | null; after: string | null },
      { dataSources }: IGraphQLContext,
    ): Promise<Connection<JoysoundSongParent, string>> => {
      const firstInt = args.first || 100;
      const afterInt = args.after ? parseInt(args.after, 10) : 1;

      return dataSources.joysound
        .getSongListByKeyword(args.keyword, afterInt, firstInt)
        .then((result) => ({
          edges: result.map((song, i) => ({
            node: {
              id: song.selSongNo,
              name: song.songName,
              artistName: song.artistName,
            },
            cursor: (firstInt + i).toString(),
          })),
          pageInfo: {
            hasPreviousPage: false,
            hasNextPage: result.length === firstInt,
            startCursor: "1",
            endCursor: (firstInt + afterInt).toString(),
          },
        }));
    },
    joysoundArtistsByKeyword: (
      _: any,
      args: { keyword: string; first: number | null; after: string | null },
      { dataSources }: IGraphQLContext,
    ): Promise<Connection<JoysoundArtistParent, string>> => {
      const firstInt = args.first || 100;
      const afterInt = args.after ? parseInt(args.after, 10) : 1;

      return dataSources.joysound
        .getArtistListByKeyword(args.keyword, afterInt, firstInt)
        .then((result) => ({
          edges: result.map((artist, i) => ({
            node: {
              id: artist.artistId_digi,
              name: artist.artistName,
            },
            cursor: (firstInt + i).toString(),
          })),
          pageInfo: {
            hasPreviousPage: false,
            hasNextPage: result.length === firstInt,
            startCursor: "1",
            endCursor: (firstInt + afterInt).toString(),
          },
        }));
    },
    songsByName: (
      _: any,
      args: { name: string; first: number | null; after: string | null },
      { dataSources }: IGraphQLContext,
    ): Promise<Connection<SongParent, string>> => {
      const firstInt = args.first || 0;
      const afterInt = args.after ? parseInt(args.after, 10) : 0;

      return dataSources.dkwebsys
        .getMusicByKeyword(args.name, firstInt, afterInt)
        .then((result) => ({
          edges: result.list.map((song, i) => ({
            node: {
              id: song.requestNo,
              name: song.title,
              nameYomi: song.titleYomi,
              artistName: song.artist,
              artistNameYomi: song.artistYomi,
            },
            cursor: (firstInt + i).toString(),
          })),
          pageInfo: {
            hasPreviousPage: false, // We can always do this because we don't support backward pagination
            hasNextPage: firstInt + afterInt < result.data.totalCount,
            startCursor: "0",
            endCursor: (firstInt + afterInt).toString(),
          },
        }));
    },
    songById: (
      _: any,
      args: { id: string },
      { dataSources }: IGraphQLContext,
    ): Promise<SongParent> =>
      dataSources.dkwebsys.getMusicDetailsInfo(args.id).then((data) => ({
        id: args.id,
        name: data.data.title,
        nameYomi: data.data.titleYomi_Kana,
        artistName: data.data.artist,
        artistNameYomi: "",
        lyricsPreview: data.data.firstLine,
        vocalTypes: data.list[0].mModelMusicInfoList[0].guideVocal
          .split(",")
          .map((vocalType) => {
            switch (vocalType) {
              case "0":
                return "NORMAL";
              case "1":
                return "GUIDE_MALE";
              case "2":
                return "GUIDE_FEMALE";
              default:
                console.warn(`unknown vocal type ${vocalType}`);
                return "UNKNOWN";
            }
          }),
        tieUp: data.list[0].mModelMusicInfoList[0].highlightTieUp,
        playtime: parseInt(data.list[0].mModelMusicInfoList[0].playtime, 10),
      })),
    artistsByName: (
      _: any,
      args: { name: string; first: number | null; after: string | null },
      { dataSources }: IGraphQLContext,
    ): Promise<Connection<ArtistParent, string>> => {
      const firstInt = args.first || 0;
      const afterInt = args.after ? parseInt(args.after, 10) : 0;

      return dataSources.dkwebsys
        .getArtistByKeyword(args.name, firstInt, afterInt)
        .then((result) => ({
          edges: result.list.map((artist, i) => ({
            node: {
              id: artist.artistCode.toString(),
              name: artist.artist,
              nameYomi: artist.artistYomi,
              songCount: artist.holdMusicCount,
            },
            cursor: (firstInt + i).toString(),
          })),
          pageInfo: {
            hasPreviousPage: false, // We can always do this because we don't support backward pagination
            hasNextPage: firstInt + afterInt < result.data.totalCount,
            startCursor: "0",
            endCursor: (firstInt + afterInt).toString(),
          },
        }));
    },
    artistById: (
      _: any,
      args: { id: string; first: number | null; after: string | null },
      { dataSources }: IGraphQLContext,
    ): Promise<ArtistParent> => {
      const firstInt = args.first || 0;
      const afterInt = args.after ? parseInt(args.after, 10) : 0;

      return dataSources.dkwebsys
        .getMusicListByArtist(args.id, firstInt, afterInt)
        .then((data) => ({
          id: args.id,
          name: data.data.artist,
          nameYomi: data.data.artistYomi_Kana,
          songCount: data.data.totalCount,
        }));
    },
    currentSong: (_: any, __: any, { room }: IGraphQLContext) => {
      return room.db.currentSong;
    },
    queue: (_: any, __: any, { room }: IGraphQLContext) => {
      if (!room.db.songQueue.length) return [];
      return room.db.songQueue;
    },
    config: (_: any, __: any, { isAdmin }: IGraphQLContext) => {
      return {
        isAdmin,
        supervisedMode: karafriendsConfig.supervisedMode,
        __typename: "KarafriendsConfig",
      };
    },
    songHistory: (
      _: any,
      args: { first: number | null; after: string | null },
      { room }: IGraphQLContext,
    ): Connection<SongHistoryItem, string> => {
      const firstInt = args.first || 0;
      const afterInt = args.after ? parseInt(args.after, 10) : 0;

      return {
        edges: room.db.songHistory
          .slice(afterInt, firstInt)
          .map((songHistoryItem, i) => ({
            node: songHistoryItem,
            cursor: (firstInt + i).toString(),
          })),
        pageInfo: {
          hasPreviousPage: false,
          hasNextPage: firstInt + afterInt < room.db.songHistory.length,
          startCursor: "0",
          endCursor: (firstInt + afterInt).toString(),
        },
      };
    },
    youtubeVideoInfo: async (
      _: any,
      args: { videoId: string },
      { dataSources }: IGraphQLContext,
    ): Promise<YoutubeVideoInfoResult> => {
      let youtubeJsReason = "Unknown";
      try {
        // youtubei.js's response is loosely/partially typed and its shape
        // shifts between versions, so treat it as untyped here.
        const data: any = await dataSources.youtube.getBasicInfo(args.videoId);
        if (data.playability_status?.status === "OK") {
          const captionTracks = data.captions?.caption_tracks || [];
          const captionLanguages: CaptionLanguage[] = captionTracks
            .filter((captionTrack: any) => !captionTrack.vss_id.startsWith("a"))
            .map((captionTrack: any) => ({
              code: captionTrack.language_code,
              name: captionTrack.name.text ?? "",
            }));

          const loudnessDb =
            data.player_config?.audio_config?.loudness_db || 0.0;

          return {
            __typename: "YoutubeVideoInfo",
            author: data.basic_info.author,
            captionLanguages,
            channelId: data.basic_info.channel_id,
            keywords: data.basic_info.keywords,
            lengthSeconds: data.basic_info.duration,
            description: data.basic_info.short_description,
            title: data.basic_info.title,
            viewCount: data.basic_info.view_count,
            gainValue: 10 ** ((-1 * loudnessDb) / 20),
          };
        }

        youtubeJsReason = data.playability_status?.reason ?? "Unknown";
        debugError(
          "youtube",
          `YouTube.js could not resolve ${args.videoId}; trying yt-dlp`,
          youtubeJsReason,
        );
      } catch (error) {
        youtubeJsReason =
          error instanceof Error ? error.message : "Unknown YouTube error";
        debugError(
          "youtube",
          `YouTube.js failed for ${args.videoId}; trying yt-dlp`,
          error,
        );
      }

      try {
        const metadata = await getYoutubeMetadataWithYtDlp(args.videoId);
        return {
          __typename: "YoutubeVideoInfo",
          ...metadata,
        };
      } catch (error) {
        debugError(
          "youtube",
          `yt-dlp metadata fallback failed for ${args.videoId}`,
          error,
        );
        return {
          __typename: "YoutubeVideoInfoError",
          reason: youtubeJsReason,
        };
      }
    },
    youtubeSearch: async (
      _: any,
      args: { query: string },
      { dataSources }: IGraphQLContext,
    ): Promise<YoutubeSearchResponse> => {
      const query = args.query.trim();
      if (!query) return { results: [], error: null };

      try {
        // Search result node types vary between youtubei.js releases. The
        // video filter normally returns Video nodes, but only depend on the
        // stable fields needed by the remocon here.
        const search: any = await dataSources.youtube.search(query, {
          type: "video",
        });
        const results = (search.results || [])
          .filter((result: any) => result.video_id && result.title)
          .slice(0, 20)
          .map((result: any): YoutubeSearchResult => ({
            videoId: result.video_id,
            title: result.title.text ?? result.title.toString(),
            author:
              result.author?.name ?? result.author?.toString?.() ?? "Unknown",
            thumbnailUrl:
              result.best_thumbnail?.url ??
              result.thumbnails?.[result.thumbnails.length - 1]?.url ??
              null,
            duration: result.length_text?.text ?? result.duration?.text ?? null,
            hasCaptions: youtubeSearchResultHasCaptions(result),
          }));

        return { results, error: null };
      } catch (error) {
        debugError("youtube", `YouTube search failed for ${query}`, error);
        return {
          results: [],
          error:
            error instanceof Error ? error.message : "YouTube search failed",
        };
      }
    },
    nicoVideoInfo: async (
      _: any,
      args: { videoId: string },
    ): Promise<NicoVideoInfoResult> => {
      try {
        const metadata = await getNiconicoMetadata(args.videoId);
        return {
          __typename: "NicoVideoInfo",
          ...metadata,
        };
      } catch (error) {
        debugError(
          "niconico",
          `Failed to get Niconico metadata for ${args.videoId}`,
          error,
        );
        return {
          __typename: "NicoVideoInfoError",
          reason:
            "Niconico could not load this video. It may be private, deleted, or unavailable.",
        };
      }
    },
    niconicoSearch: async (
      _: any,
      args: { query: string },
    ): Promise<NiconicoSearchResponse> => {
      const query = args.query.trim();
      if (!query) return { results: [], error: null };

      try {
        return { results: await searchNiconico(query), error: null };
      } catch (error) {
        debugError("niconico", `Niconico search failed for ${query}`, error);
        return {
          results: [],
          error:
            error instanceof Error ? error.message : "Niconico search failed",
        };
      }
    },
    pitchShiftSemis: (_: any, __: any, { room }: IGraphQLContext) =>
      room.db.pitchShiftSemis,
    playbackState: (_: any, __: any, { room }: IGraphQLContext) =>
      room.db.playbackState,
    mediaDownloaded: (
      _: any,
      args: {
        source: "DAM" | "JOYSOUND" | "YOUTUBE" | "NICONICO";
        songId: string;
        suffix: string | null;
      },
    ): boolean => isMediaDownloaded(args.source, args.songId, args.suffix),
    videoDownloadProgress: (
      _: any,
      args: {
        videoDownloadType: number;
        songId: string;
        suffix: string | null;
      },
      { room }: IGraphQLContext,
    ): VideoDownloadProgress => {
      const progress = getVideoDownloadProgress(
        room.db.downloadQueue,
        args.videoDownloadType,
        args.songId,
        args.suffix,
      );

      return { progress };
    },
  },
  Mutation: {
    sendEmote: (
      _: any,
      args: { emote: Emote },
      { room }: IGraphQLContext,
    ): boolean => {
      room.pubsub.publish(SubscriptionEvent.Emote, { emote: args.emote });
      return true;
    },
    queueJoysoundSong: (
      _: any,
      args: { input: QueueJoysoundSongInput; tryHeadOfQueue: boolean },
      { dataSources, room, isAdmin }: IGraphQLContext,
    ): QueueSongResult => {
      const queueItem: JoysoundQueueItem = {
        __typename: "JoysoundQueueItem",
        timestamp: Date.now().toString(),
        ...args.input,
      };

      if (hasMaxSongsInQueue(room, queueItem.userIdentity, isAdmin)) {
        return {
          __typename: "QueueSongError",
          reason: `${queueItem.userIdentity.nickname} already has ${karafriendsConfig.paxSongQueueLimit} song(s) in the queue or downloading`,
        };
      }

      const pushToHead = args.tryHeadOfQueue && isAdmin;
      console.log(`queueJoysoundSong: pushToHead=${pushToHead}`);

      downloadJoysoundData(
        room.db.downloadQueue,
        queueItem.userIdentity,
        dataSources.joysound,
        queueItem,
        pushToHead,
        (completedItem, completedPushToHead) => {
          const result = pushSongToQueue(
            room,
            completedItem,
            completedPushToHead,
          );
          publishMediaDownloadCompleted(
            "JOYSOUND",
            completedItem.songId,
            completedItem.youtubeVideoId,
          );
          return result;
        },
      );

      return {
        __typename: "QueueSongInfo",
        eta: room.db.songQueue.reduce(
          (acc, cur) => acc + (cur.playtime || 0),
          0,
        ),
      };
    },
    queueDamSong: (
      _: any,
      args: { input: QueueDamSongInput; tryHeadOfQueue: boolean },
      { dataSources, room, isAdmin }: IGraphQLContext,
    ): QueueSongResult => {
      const queueItem: DamQueueItem = {
        timestamp: Date.now().toString(),
        ...args.input,
        __typename: "DamQueueItem",
      };

      if (hasMaxSongsInQueue(room, queueItem.userIdentity, isAdmin)) {
        return {
          __typename: "QueueSongError",
          reason: `${queueItem.userIdentity.nickname} already has ${karafriendsConfig.paxSongQueueLimit} song(s) in the queue or downloading`,
        };
      }

      const pushToHead = args.tryHeadOfQueue && isAdmin;
      console.log(`queueDamSong: pushToHead=${pushToHead}`);

      console.log(`Starting offline download of ${queueItem.songId}`);
      dataSources.minsei
        .getMusicStreamingUrls(queueItem.songId)
        .then((data) => {
          const selectedIndex = data.list[queueItem.streamingUrlIdx];
          // Media filenames and GraphQL cache arguments use a string suffix.
          // Normalize the Int input once so the completion event updates the
          // exact Relay field displayed for this DAM vocal variant.
          const mediaSuffix = normalizeMediaCacheSuffix(
            queueItem.streamingUrlIdx,
          );
          if (mediaSuffix === null) {
            throw new Error("DAM streaming URL index is missing");
          }
          const url = karafriendsConfig.useLowBitrateUrl
            ? selectedIndex.lowBitrateUrl
            : selectedIndex.highBitrateUrl;
          downloadDamVideo(url, queueItem.songId, mediaSuffix, () =>
            publishMediaDownloadCompleted("DAM", queueItem.songId, mediaSuffix),
          );
        });

      return pushSongToQueue(room, queueItem, pushToHead);
    },
    queueYoutubeSong: (
      _: any,
      args: { input: QueueYoutubeSongInput; tryHeadOfQueue: boolean },
      { room, isAdmin }: IGraphQLContext,
    ): QueueSongResult => {
      const queueItem: YoutubeQueueItem = {
        timestamp: Date.now().toString(),
        ...args.input,
        hasAdhocLyrics: args.input.adhocSongLyrics ? true : false,
        hasCaptions: args.input.captionCode ? true : false,
        gainValue: args.input.gainValue,
        __typename: "YoutubeQueueItem",
      };

      if (hasMaxSongsInQueue(room, queueItem.userIdentity, isAdmin)) {
        return {
          __typename: "QueueSongError",
          reason: `${queueItem.userIdentity.nickname} already has ${karafriendsConfig.paxSongQueueLimit} song(s) in the queue or downloading`,
        };
      }

      const pushToHead = args.tryHeadOfQueue && isAdmin;
      console.log(`queueDamSong: pushToHead=${pushToHead}`);

      if (args.input.adhocSongLyrics) {
        room.db.idToAdhocLyrics[args.input.songId] = cleanupAdhocSongLyrics(
          args.input.adhocSongLyrics,
        );
      }

      downloadYoutubeVideo(
        room.db.downloadQueue,
        queueItem.userIdentity,
        args.input.songId,
        args.input.captionCode,
        () => {
          const result = pushSongToQueue(room, queueItem, pushToHead);
          publishMediaDownloadCompleted("YOUTUBE", queueItem.songId);
          return result;
        },
      );

      // The song likely hasn't actually been added to the queue yet since it needs to download,
      // but let's optimistically return the eta assuming it will successfully queue
      return {
        __typename: "QueueSongInfo",
        eta:
          room.db.songQueue.reduce((acc, cur) => acc + (cur.playtime || 0), 0) +
          (args.input.playtime || 0),
      };
    },
    queueNicoSong: (
      _: any,
      args: { input: QueueNicoSongInput; tryHeadOfQueue: boolean },
      { room, isAdmin }: IGraphQLContext,
    ): QueueSongResult => {
      const queueItem: NicoQueueItem = {
        timestamp: Date.now().toString(),
        ...args.input,
        __typename: "NicoQueueItem",
      };

      if (hasMaxSongsInQueue(room, queueItem.userIdentity, isAdmin)) {
        return {
          __typename: "QueueSongError",
          reason: `${queueItem.userIdentity.nickname} already has ${karafriendsConfig.paxSongQueueLimit} song(s) in the queue or downloading`,
        };
      }

      const pushToHead = args.tryHeadOfQueue && isAdmin;
      console.log(`queueDamSong: pushToHead=${pushToHead}`);

      downloadNicoVideo(
        room.db.downloadQueue,
        queueItem.userIdentity,
        args.input.songId,
        () => {
          const result = pushSongToQueue(room, queueItem, pushToHead);
          publishMediaDownloadCompleted("NICONICO", queueItem.songId);
          return result;
        },
      );
      // The song likely hasn't actually been added to the queue yet since it needs to download,
      // but let's optimistically return the eta assuming it will successfully queue
      return {
        __typename: "QueueSongInfo",
        eta:
          room.db.songQueue.reduce((acc, cur) => acc + (cur.playtime || 0), 0) +
          (args.input.playtime || 0),
      };
    },
    pushAdhocLyrics: (
      _: any,
      args: { input: PushAdhocLyricsInput },
      { room }: IGraphQLContext,
    ): boolean => {
      room.db.currentSongAdhocLyrics.push({
        lyric: args.input.lyric,
        lyricIndex: args.input.lyricIndex,
      });
      room.pubsub.publish(SubscriptionEvent.CurrentSongAdhocLyricsChanged, {
        currentSongAdhocLyricsChanged: room.db.currentSongAdhocLyrics,
      });
      saveDb(room);
      return true;
    },
    popSong: (
      _: any,
      args: {},
      { room }: IGraphQLContext,
    ): QueueItem | null => {
      const newSong = room.db.songQueue.shift() || null;

      room.db.currentSongAdhocLyrics = [];

      if (
        room.db.currentSong &&
        room.db.currentSong.__typename === "YoutubeQueueItem" &&
        room.db.currentSong.hasAdhocLyrics
      ) {
        delete room.db.idToAdhocLyrics[room.db.currentSong.songId];
      }

      room.pubsub.publish(SubscriptionEvent.CurrentSongAdhocLyricsChanged, {
        currentSongAdhocLyricsChanged: room.db.currentSongAdhocLyrics,
      });

      room.db.currentSong = newSong;
      room.pubsub.publish(SubscriptionEvent.CurrentSongChanged, {
        currentSongChanged: room.db.currentSong,
      });

      room.pubsub.publish(SubscriptionEvent.QueueChanged, {
        queueChanged: {
          currentSong: room.db.currentSong,
          newQueue: room.db.songQueue,
        },
      });

      if (room.db.currentSong) {
        const prevSong: QueueItem | null = room.db.songHistory[0]?.song || null;

        if (
          !prevSong ||
          room.db.currentSong.__typename !== prevSong.__typename ||
          room.db.currentSong.songId !== prevSong.songId ||
          room.db.currentSong.timestamp !== prevSong.timestamp
        ) {
          room.db.songHistory.unshift({ song: room.db.currentSong });
        }
      }

      saveDb(room);
      return newSong;
    },
    removeSong: (
      _: any,
      args: { songId: string; timestamp: string },
      { room }: IGraphQLContext,
    ): boolean => {
      const songIdx = room.db.songQueue.findIndex(
        (item) =>
          item.songId === args.songId && item.timestamp === args.timestamp,
      );
      if (songIdx < 0) return false;
      room.db.songQueue.splice(songIdx, 1);
      room.pubsub.publish(SubscriptionEvent.QueueChanged, {
        queueChanged: {
          currentSong: room.db.currentSong,
          newQueue: room.db.songQueue,
        },
      });
      saveDb(room);
      return true;
    },
    setPitchShiftSemis: (
      _: any,
      args: { semis: number },
      { room }: IGraphQLContext,
    ): boolean => {
      room.db.pitchShiftSemis = args.semis;
      room.pubsub.publish(SubscriptionEvent.PitchShiftSemisChanged, {
        pitchShiftSemisChanged: args.semis,
      });
      return true;
    },
    setPlaybackState: (
      _: any,
      args: { playbackState: PlaybackState },
      { room }: IGraphQLContext,
    ): boolean => {
      room.db.playbackState = args.playbackState;
      room.pubsub.publish(SubscriptionEvent.PlaybackStateChanged, {
        playbackStateChanged: args.playbackState,
      });
      saveDb(room);
      return true;
    },
  },
  Subscription: {
    currentSongAdhocLyricsChanged: {
      subscribe: (_: any, __: any, { room }: IGraphQLContext) =>
        room.pubsub.asyncIterableIterator([
          SubscriptionEvent.CurrentSongAdhocLyricsChanged,
        ]),
    },
    currentSongChanged: {
      subscribe: (_: any, __: any, { room }: IGraphQLContext) =>
        room.pubsub.asyncIterableIterator([
          SubscriptionEvent.CurrentSongChanged,
        ]),
    },
    emote: {
      subscribe: (_: any, __: any, { room }: IGraphQLContext) =>
        room.pubsub.asyncIterableIterator([SubscriptionEvent.Emote]),
    },
    mediaDownloadCompleted: {
      subscribe: (_: any, __: any, { room }: IGraphQLContext) =>
        room.pubsub.asyncIterableIterator([
          SubscriptionEvent.MediaDownloadCompleted,
        ]),
    },
    pitchShiftSemisChanged: {
      subscribe: (_: any, __: any, { room }: IGraphQLContext) =>
        room.pubsub.asyncIterableIterator([
          SubscriptionEvent.PitchShiftSemisChanged,
        ]),
    },
    playbackStateChanged: {
      subscribe: (_: any, __: any, { room }: IGraphQLContext) =>
        room.pubsub.asyncIterableIterator([
          SubscriptionEvent.PlaybackStateChanged,
        ]),
    },
    queueAdded: {
      subscribe: (_: any, __: any, { room }: IGraphQLContext) =>
        room.pubsub.asyncIterableIterator([SubscriptionEvent.QueueAdded]),
    },
    queueChanged: {
      subscribe: (_: any, __: any, { room }: IGraphQLContext) =>
        room.pubsub.asyncIterableIterator([SubscriptionEvent.QueueChanged]),
    },
  },
};

const schema = makeExecutableSchema({
  typeDefs: rawSchema,
  resolvers,
});

export const minseiCredentialsProvider = memoize(async () => {
  const { damUsername, damPassword } = karafriendsConfig;
  const minseiLoginResult = await MinseiAPI.login(damUsername, damPassword);
  return {
    userCode: damUsername,
    authToken: minseiLoginResult.data.authToken,
  };
});

export const joysoundCredentialsProvider = memoize(async () => {
  const joysoundEmail = encodeURIComponent(karafriendsConfig.joysoundEmail);
  const joysoundPassword = encodeURIComponent(
    karafriendsConfig.joysoundPassword,
  );
  return JoysoundAPI.login(joysoundEmail, joysoundPassword);
});

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() =>
    clearTimeout(timer),
  ) as Promise<T>;
}

// Every GraphQL request awaits this to build its context, so if
// Innertube.create() hangs (YouTube unreachable) it would stall the entire
// API. memoize would also cache a rejected promise forever, permanently
// killing the backend until restart. Use a manual singleton that times out and
// clears itself on failure so the next request retries.
let innertubePromise: Promise<Innertube> | null = null;
function innertubeApiProvider(): Promise<Innertube> {
  if (!innertubePromise) {
    innertubePromise = withTimeout(
      Innertube.create(),
      30000,
      "Innertube.create",
    ).catch((err) => {
      innertubePromise = null;
      throw err;
    });
  }
  return innertubePromise;
}

export interface GraphQLServerOptions {
  host?: string;
  port?: number;
  onFatalError?: (title: string, error: Error) => void;
  authorizeWebSocket?: (
    request: IncomingMessage,
    connectionParams: Readonly<Record<string, unknown>> | undefined,
  ) => boolean;
}

export function applyGraphQLMiddleware(
  app: Application,
  options: GraphQLServerOptions = {},
) {
  const httpServer = createServer(app);
  const port = options.port ?? karafriendsConfig.remoconPort;
  const host = options.host;
  const remoconAdminToken = randomBytes(32).toString("base64url");

  app.post(REMOCON_ADMIN_LOGIN_PATH, express.json(), (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!secureEqual(req.body?.password, karafriendsConfig.adminPassword)) {
      res.status(401).json({ error: "Incorrect admin password" });
      return;
    }

    res.json({ adminToken: remoconAdminToken });
  });

  const wsServer = new WebSocketServer({
    server: httpServer,
    path: "/graphql",
  });

  // These servers are EventEmitters: an unhandled "error" event (most commonly
  // the remocon port already being in use) would otherwise crash the whole app
  // with a bare stack trace. Fail loudly with a clear message and quit cleanly.
  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      const portError = new Error(
        `Port ${port} is already in use. Is karafriends already running? ` +
          "Close the other instance or choose another port.",
      );
      console.error(portError.message);
      options.onFatalError?.("karafriends: port already in use", portError);
    } else {
      console.error("HTTP server error:", err);
      options.onFatalError?.("karafriends: HTTP server error", err);
    }
  });
  wsServer.on("error", (err) => {
    console.error("WebSocket server error:", err);
  });

  const serverCleanup = useServer(
    {
      schema,
      onConnect: (ctx) =>
        options.authorizeWebSocket?.(ctx.extra.request, ctx.connectionParams) ??
        true,
      context: (ctx) => ({
        dataSources: undefined as unknown as IGraphQLContext["dataSources"],
        room: getRoom(ctx.connectionParams?.roomId),
        isAdmin: secureEqual(
          ctx.connectionParams?.adminToken,
          remoconAdminToken,
        ),
      }),
    },
    wsServer,
  );

  const server = new ApolloServer<IGraphQLContext>({
    schema,
    formatError: (formattedError, error) => {
      const path = formattedError.path?.join(".") || "unknown";
      debugError(
        "graphql",
        `${formattedError.message}; path=${path}; code=${
          formattedError.extensions?.code || "unknown"
        }`,
        error,
      );
      return formattedError;
    },
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      ApolloServerPluginCacheControlDisabled(),
      ApolloServerPluginInlineTraceDisabled(),
      ApolloServerPluginLandingPageDisabled(),
      ApolloServerPluginSchemaReportingDisabled(),
      ApolloServerPluginUsageReportingDisabled(),
    ],
  });

  if (process.env.NODE_ENV !== "production") {
    app.use("/graphql", (req, res, next) => {
      res.append("Access-Control-Allow-Origin", "*");
      res.append("Access-Control-Allow-Headers", "*");
      if (req.method === "OPTIONS") {
        res.sendStatus(200);
        return;
      }
      next();
    });
  }

  const tunnelAgent = karafriendsConfig.proxyEnable
    ? tunnel.httpsOverHttp({
        proxy: {
          host: karafriendsConfig.proxyHost,
          port: karafriendsConfig.proxyPort,
          proxyAuth: `${karafriendsConfig.proxyUser}:${karafriendsConfig.proxyPass}`,
        },
      })
    : undefined;

  const fetcher = async (url: string, init?: FetcherRequestInit) => {
    // Without a timeout, a hung upstream (DAM/Joysound) stalls the resolver —
    // and the client request — indefinitely. Abort after 30s so it surfaces as
    // an error (and the promise-retry wrappers can retry) instead of hanging.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      return await nodeFetch(url, {
        ...init,
        agent: tunnelAgent,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  server
    .start()
    .then(() => {
      app.use(
        "/graphql",
        express.json(),
        expressMiddleware(server, {
          context: async ({ req }: { req: Request }) => {
            const innertubeApiInstance = await innertubeApiProvider();
            const roomHeader = req.headers["x-karafriends-room"];
            const adminHeader = req.headers[REMOCON_ADMIN_TOKEN_HEADER];

            return {
              room: getRoom(
                Array.isArray(roomHeader) ? roomHeader[0] : roomHeader,
              ),
              isAdmin: secureEqual(
                Array.isArray(adminHeader) ? adminHeader[0] : adminHeader,
                remoconAdminToken,
              ),
              dataSources: {
                minsei: new MinseiAPI(minseiCredentialsProvider, {
                  cache: server.cache,
                  fetch: fetcher,
                }),
                joysound: new JoysoundAPI(joysoundCredentialsProvider, {
                  cache: server.cache,
                  fetch: fetcher,
                }),
                dkwebsys: new DkwebsysAPI({
                  cache: server.cache,
                  fetch: fetcher,
                }),
                youtube: innertubeApiInstance,
              },
            };
          },
        }),
      );
      httpServer.listen(port, host, () => {
        console.log(
          `Server is now running on http://${host || "localhost"}:${port}`,
        );
      });
    })
    .catch((err) => {
      // server.start() rejecting leaves the app with no GraphQL backend, so there
      // is nothing useful to keep running — surface it and quit cleanly.
      console.error("Failed to start the GraphQL server:", err);
      options.onFatalError?.(
        "karafriends: failed to start",
        err instanceof Error ? err : new Error(String(err)),
      );
    });

  return httpServer;
}
