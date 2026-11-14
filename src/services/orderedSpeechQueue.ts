/** Capture keeps running while one phrase is processed. Never silently discard
 * captured speech, overlap paid requests, or build an unbounded delayed backlog.
 */
export class OrderedSpeechQueue {
  private waiting:{seconds:number;run:()=>Promise<void>}[]=[];
  private waitingSeconds=0;
  private running=false;
  private stopped=false;
  constructor(
    private signal:AbortSignal,
    private onError:(error:Error)=>void,
    private onBacklog?:(seconds:number)=>void,
    private maxWaitingSeconds=10,
  ){
    signal.addEventListener('abort',()=>this.clear(),{once:true});
  }
  enqueue(seconds:number,run:()=>Promise<void>){
    if(this.stopped||this.signal.aborted)return false;
    if(!Number.isFinite(seconds)||seconds<=0||this.waitingSeconds+seconds>this.maxWaitingSeconds){
      this.fail(new Error('Langpretation is falling behind your speech. Translation has paused; your call is still connected. Restart Langpretation after a short pause.'));
      return false;
    }
    this.waiting.push({seconds,run});this.waitingSeconds+=seconds;
    this.onBacklog?.(this.waitingSeconds);
    void this.drain();
    return true;
  }
  private clear(){this.stopped=true;this.waiting=[];this.waitingSeconds=0;}
  private fail(error:Error){
    if(this.stopped||this.signal.aborted)return;
    this.clear();this.onError(error);
  }
  private async drain(){
    if(this.running||this.stopped||this.signal.aborted)return;
    this.running=true;
    try{
      while(this.waiting.length&&!this.stopped&&!this.signal.aborted){
        const next=this.waiting.shift()!;
        this.waitingSeconds=Math.max(0,this.waitingSeconds-next.seconds);
        this.onBacklog?.(this.waitingSeconds);
        try{await next.run();}
        catch(error){this.fail(error instanceof Error?error:new Error('Speech processing failed.'));break;}
      }
    }finally{this.running=false;}
  }
}
