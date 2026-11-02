/** Provider transcript turns, never microphone-volume fluctuations, own text. */
export class MalviUserTurnTranscript {
  private text = '';
  private nextTurn = true;
  assistantReply() { this.nextTurn = true; }
  append(text: string) {
    this.text = Array.from((this.nextTurn ? '' : this.text) + text).slice(-1200).join('');
    this.nextTurn = false;
    return this.text;
  }
  reset() { this.text = ''; this.nextTurn = true; }
}
