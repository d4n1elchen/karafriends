import { normalizeRoomId } from "./roomIdCore";

const ROOM_STORAGE_KEY = "karafriends.roomId";

export function getRoomId(): string {
  const queryRoom = new URLSearchParams(window.location.search).get("room");
  const storedRoom = localStorage.getItem(ROOM_STORAGE_KEY);
  const roomId = normalizeRoomId(queryRoom || storedRoom);
  localStorage.setItem(ROOM_STORAGE_KEY, roomId);
  return roomId;
}

export function roomUrl(pathname: string): string {
  const url = new URL(pathname, window.location.origin);
  url.searchParams.set("room", getRoomId());
  return url.toString();
}
