export const DEFAULT_ROOM_ID = "main";

export function normalizeRoomId(value: unknown): string {
  const roomId =
    typeof value === "string" ? value.toLowerCase() : DEFAULT_ROOM_ID;
  return /^[a-z0-9-]{1,32}$/.test(roomId) ? roomId : DEFAULT_ROOM_ID;
}
