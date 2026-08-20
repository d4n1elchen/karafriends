export interface SharedProgressItem<TIdentity> {
  downloadType: number;
  userIdentity: TIdentity;
  songId: string;
  suffix: string | null;
  progress: number;
}

interface Waiter<TIdentity> {
  queue: SharedProgressItem<TIdentity>[];
  item: SharedProgressItem<TIdentity>;
  onComplete: (result: unknown) => void;
}

interface Job<TIdentity> {
  key: string;
  progress: number;
  waiters: Waiter<TIdentity>[];
}

export class SharedDownloadCoordinator<TIdentity> {
  private readonly jobs = new Map<string, Job<TIdentity>>();
  private readonly jobsByItem = new WeakMap<
    SharedProgressItem<TIdentity>,
    Job<TIdentity>
  >();

  begin(
    key: string,
    queue: SharedProgressItem<TIdentity>[],
    itemData: Omit<SharedProgressItem<TIdentity>, "progress">,
    onComplete: (result: unknown) => void,
  ): { isOwner: boolean; item: SharedProgressItem<TIdentity> } {
    let job = this.jobs.get(key);
    const isOwner = !job;
    if (!job) {
      job = { key, progress: 0, waiters: [] };
      this.jobs.set(key, job);
    }

    const item = { ...itemData, progress: 0 } as SharedProgressItem<TIdentity>;
    Object.defineProperty(item, "progress", {
      enumerable: true,
      get: () => job!.progress,
      set: (value: number) => {
        job!.progress = value;
      },
    });

    job.waiters.push({ queue, item, onComplete });
    this.jobsByItem.set(item, job);
    queue.push(item);
    return { isOwner, item };
  }

  has(item: SharedProgressItem<TIdentity>): boolean {
    return this.jobsByItem.has(item);
  }

  complete(item: SharedProgressItem<TIdentity>, result?: unknown): void {
    this.settle(item, true, result);
  }

  fail(item: SharedProgressItem<TIdentity>): void {
    this.settle(item, false);
  }

  private settle(
    item: SharedProgressItem<TIdentity>,
    succeeded: boolean,
    result?: unknown,
  ): void {
    const job = this.jobsByItem.get(item);
    if (!job || this.jobs.get(job.key) !== job) return;

    this.jobs.delete(job.key);
    for (const waiter of job.waiters) {
      this.jobsByItem.delete(waiter.item);
      const index = waiter.queue.indexOf(waiter.item);
      if (index >= 0) waiter.queue.splice(index, 1);
      if (succeeded) {
        try {
          waiter.onComplete(result);
        } catch (error) {
          // One room's completion handler must not prevent other waiters from
          // being released.
          console.error(
            `Shared download completion failed for ${job.key}:`,
            error,
          );
        }
      }
    }
  }
}
