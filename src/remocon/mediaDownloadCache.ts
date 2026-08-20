import environment from "../common/graphqlEnvironment";

export type MediaSource = "DAM" | "JOYSOUND" | "YOUTUBE" | "NICONICO";

export function markMediaDownloaded(
  source: MediaSource,
  songId: string,
  suffix: string | null = null,
): void {
  environment.commitUpdate((store) => {
    const root = store.getRoot();
    root.setValue(true, "mediaDownloaded", { source, songId, suffix });

    // Search results from every provider contain computed filesystem state.
    // Mark cached queries stale so returning to a result list checks it again.
    root.invalidateRecord();
  });
}
