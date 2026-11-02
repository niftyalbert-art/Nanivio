/** A bounded tombstone list prevents delayed signaling from reviving ended calls. */
export class CallLifecycle {
  private ended = new Set<string>();
  end(id: string) {
    if (!id) return;
    this.ended.add(id);
    if (this.ended.size > 64) this.ended.delete(this.ended.values().next().value!);
  }
  hasEnded(id: string) { return this.ended.has(id); }
}
