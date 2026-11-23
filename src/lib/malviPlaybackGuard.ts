/**
 * Invalidates asynchronous work from a cancelled response. The websocket keeps
 * server events ordered, but a browser play()/resume() promise may settle later.
 */
export class MalviPlaybackGuard {
  private generation = 0;
  private awaitingAcknowledgement = false;
  get blocked() { return this.awaitingAcknowledgement; }
  checkpoint() {
    const generation = this.generation;
    return () => generation === this.generation && !this.awaitingAcknowledgement;
  }
  cancel(waitForAcknowledgement = false) {
    this.generation++;
    this.awaitingAcknowledgement = waitForAcknowledgement;
  }
  acknowledge() { this.awaitingAcknowledgement = false; }
}
