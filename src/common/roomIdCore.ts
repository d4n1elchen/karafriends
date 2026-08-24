export const DEFAULT_ROOM_ID = "main";
export const ROOM_ID_PATTERN = /^[a-z0-9-]{1,32}$/;

export function isValidRoomId(value: unknown): value is string {
  return typeof value === "string" && ROOM_ID_PATTERN.test(value.toLowerCase());
}

export function normalizeRoomId(value: unknown): string {
  const roomId =
    typeof value === "string" ? value.toLowerCase() : DEFAULT_ROOM_ID;
  return isValidRoomId(roomId) ? roomId : DEFAULT_ROOM_ID;
}
