export type AvatarSubject = {
  id?: string; userId?: string; nvId?: string; avatar?: string; avatarRevision?: string;
};
type PhotoRequest = { userId: string; nvId: string; revision: string };
type PhotoJob = PhotoRequest & { controller: AbortController; generation: number };
type CachedPhoto = { revision: string; avatar: string };

/** Memory-only, account-owned photo loading. Call signaling never awaits it. */
export class RealtimeAvatarCache {
  private owner = '';
  private generation = 0;
  private desired = new Map<string, string>();
  private queued = new Map<string, PhotoRequest>();
  private active = new Map<string, PhotoJob>();
  private photos = new Map<string, CachedPhoto>();
  private failures = new Map<string, { revision: string; retryAt: number }>();
  private characters = 0;

  constructor(
    private fetchPhoto: (request: PhotoRequest, signal: AbortSignal) => Promise<string>,
    private loaded: (userId: string, avatar: string, revision: string) => void,
    private failed: (userId: string) => void = () => {},
    private limits = { entries: 32, characters: 4 * 1024 * 1024, concurrent: 2 },
  ) {}

  reset(owner = '') {
    this.generation++;
    for (const job of this.active.values()) job.controller.abort();
    this.owner = owner;
    this.active.clear(); this.queued.clear(); this.desired.clear();
    this.photos.clear(); this.failures.clear(); this.characters = 0;
  }

  prune(users: Set<string>) {
    for (const id of this.desired.keys()) if (!users.has(id)) {
      this.desired.delete(id); this.queued.delete(id); this.failures.delete(id);
      this.active.get(id)?.controller.abort();
    }
  }

  hydrate<T extends AvatarSubject>(person: T, known?: AvatarSubject): T & { avatar?: string } {
    const userId = person.userId || person.id;
    if (!this.owner || !userId) return person;
    const revision = person.avatarRevision;
    if (!revision || !/^[a-f0-9]{64}$/.test(revision)) {
      this.desired.delete(userId); this.queued.delete(userId); this.failures.delete(userId);
      this.active.get(userId)?.controller.abort();
      this.remove(userId);
      return person;
    }
    this.desired.set(userId, revision);
    if (this.queued.get(userId)?.revision !== revision) this.queued.delete(userId);
    const pending = this.active.get(userId);
    if (pending && pending.revision !== revision) pending.controller.abort();
    if (known?.avatarRevision === revision && known.avatar)
      return { ...person, avatar: known.avatar };
    const cached = this.photos.get(userId);
    if (cached?.revision === revision) {
      this.photos.delete(userId); this.photos.set(userId, cached);
      return { ...person, avatar: cached.avatar };
    }
    this.remove(userId);
    const failure = this.failures.get(userId);
    if (person.nvId && (!pending || pending.revision !== revision)
      && !(failure?.revision === revision && failure.retryAt > Date.now())) {
      this.queued.set(userId, { userId, nvId: person.nvId, revision });
      this.drain();
    }
    return { ...person, avatar: undefined };
  }

  private remove(id: string) {
    const previous = this.photos.get(id);
    if (previous) this.characters -= previous.avatar.length;
    this.photos.delete(id);
  }

  private drain() {
    while (this.owner && this.active.size < this.limits.concurrent) {
      const request = [...this.queued.values()].find(item => !this.active.has(item.userId));
      if (!request) return;
      this.queued.delete(request.userId);
      const job: PhotoJob = { ...request, controller: new AbortController(), generation: this.generation };
      this.active.set(job.userId, job);
      let timedOut = false;
      const timeout = setTimeout(() => { timedOut = true; job.controller.abort(); }, 10000);
      let abort!: () => void;
      const cancelled = new Promise<never>((_, reject) => {
        abort = () => reject(new DOMException('Photo load cancelled.', 'AbortError'));
        job.controller.signal.addEventListener('abort', abort, { once: true });
      });
      // Starting in a microtask also isolates a synchronously throwing loader.
      const loading = Promise.resolve().then(() => {
        if (job.controller.signal.aborted) throw new DOMException('Photo load cancelled.', 'AbortError');
        return this.fetchPhoto(request, job.controller.signal);
      });
      void Promise.race([loading, cancelled]).then(avatar => {
        if (job.generation !== this.generation || job.controller.signal.aborted
          || this.desired.get(job.userId) !== job.revision) return;
        this.failures.delete(job.userId);
        this.remove(job.userId);
        if (avatar.length <= this.limits.characters) {
          this.photos.set(job.userId, { avatar, revision: job.revision });
          this.characters += avatar.length;
          while (this.photos.size > this.limits.entries || this.characters > this.limits.characters)
            this.remove(this.photos.keys().next().value!);
        }
        this.loaded(job.userId, avatar, job.revision);
      }).catch(() => {
        if (job.generation !== this.generation || (job.controller.signal.aborted && !timedOut)
          || this.desired.get(job.userId) !== job.revision) return;
        this.failures.set(job.userId, { revision: job.revision, retryAt: Date.now() + 30000 });
        this.failed(job.userId);
      }).finally(() => {
        clearTimeout(timeout);
        job.controller.signal.removeEventListener('abort', abort);
        if (this.active.get(job.userId) === job) this.active.delete(job.userId);
        this.drain();
      });
    }
  }
}

/** Validate a directory response before associating any photo with a socket identity. */
export async function verifiedDirectoryAvatar(body: any, expected: { userId: string; revision: string }) {
  if (body?.success !== true || body.user?.id !== expected.userId || typeof body.user.avatar !== 'string')
    throw new Error('PROFILE_PHOTO_UNAVAILABLE');
  const avatar = body.user.avatar;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(avatar));
  const revision = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (revision !== expected.revision) throw new Error('PROFILE_PHOTO_CHANGED');
  return avatar;
}
