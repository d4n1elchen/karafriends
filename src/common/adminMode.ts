import {
  REMOCON_ADMIN_LOGIN_PATH,
  REMOCON_ADMIN_TOKEN_HEADER,
} from "./adminAuthCore";
import { getRemoteAccessToken } from "./roomId";

const ADMIN_TOKEN_STORAGE_KEY = "karafriends.adminToken";

export function getAdminAccessToken(): string | null {
  return sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
}

export async function enableAdminMode(password: string): Promise<void> {
  const remoteToken = getRemoteAccessToken();
  const response = await fetch(REMOCON_ADMIN_LOGIN_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(remoteToken ? { "X-Karafriends-Remote-Token": remoteToken } : {}),
    },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? "Incorrect admin password."
        : `Unable to enable admin mode (HTTP ${response.status}).`,
    );
  }

  const payload = (await response.json()) as { adminToken?: unknown };
  if (typeof payload.adminToken !== "string" || !payload.adminToken) {
    throw new Error("The server returned an invalid admin session.");
  }

  sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, payload.adminToken);
}

export function adminRequestHeaders(): Record<string, string> {
  const adminToken = getAdminAccessToken();
  return adminToken ? { [REMOCON_ADMIN_TOKEN_HEADER]: adminToken } : {};
}
