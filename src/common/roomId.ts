import { normalizeRoomId } from "./roomIdCore";

const ROOM_STORAGE_KEY = "karafriends.roomId";
const RECENT_ROOMS_STORAGE_KEY = "karafriends.recentRooms";
const REMOTE_TOKEN_STORAGE_KEY = "karafriends.remoteToken";
const MAX_RECENT_ROOMS = 8;

function rememberRoom(roomId: string): void {
  let recentRooms: string[] = [];
  try {
    const stored = JSON.parse(
      localStorage.getItem(RECENT_ROOMS_STORAGE_KEY) || "[]",
    );
    if (Array.isArray(stored)) {
      recentRooms = stored.filter(
        (value): value is string => typeof value === "string",
      );
    }
  } catch {
    // Replace malformed browser storage with a clean history.
  }

  localStorage.setItem(
    RECENT_ROOMS_STORAGE_KEY,
    JSON.stringify(
      [roomId, ...recentRooms.filter((value) => value !== roomId)].slice(
        0,
        MAX_RECENT_ROOMS,
      ),
    ),
  );
}

export function getRoomId(): string {
  const url = new URL(window.location.href);
  const queryRoom = url.searchParams.get("room");
  const storedRoom = localStorage.getItem(ROOM_STORAGE_KEY);
  const roomId = normalizeRoomId(queryRoom || storedRoom);
  localStorage.setItem(ROOM_STORAGE_KEY, roomId);
  rememberRoom(roomId);

  if (queryRoom !== roomId) {
    url.searchParams.set("room", roomId);
    history.replaceState(history.state, "", url.toString());
  }

  return roomId;
}

export function roomUrl(pathname: string): string {
  const url = new URL(pathname, window.location.origin);
  url.searchParams.set("room", getRoomId());
  return url.toString();
}

export function getRemoteAccessToken(): string | null {
  const url = new URL(window.location.href);
  const queryToken = url.searchParams.get("remoteToken");

  if (queryToken) {
    sessionStorage.setItem(REMOTE_TOKEN_STORAGE_KEY, queryToken);
    url.searchParams.delete("remoteToken");
    history.replaceState(history.state, "", url.toString());
    return queryToken;
  }

  return sessionStorage.getItem(REMOTE_TOKEN_STORAGE_KEY);
}
