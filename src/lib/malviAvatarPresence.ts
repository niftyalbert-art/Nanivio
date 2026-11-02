/**
 * Keep the renderer connected while the separate Nanivio brain owns speech.
 * This never renews an app deadline, reserves usage or opens another session.
 */
export function startMalviAvatarPresence(options:{
  isAuthorized:()=>boolean;
  keepAlive:()=>Promise<void>;
  onFailure?:()=>void;
  schedule?:(tick:()=>Promise<void>,milliseconds:number)=>()=>void;
}) {
  let stopped=false,pending=false;
  const tick=async()=>{
    if(stopped||pending||!options.isAuthorized())return;
    pending=true;
    try { await options.keepAlive(); }
    catch { if(!stopped&&options.isAuthorized())options.onFailure?.(); }
    finally { pending=false; }
  };
  const schedule=options.schedule??((callback:()=>Promise<void>,milliseconds:number)=>{
    const timer=setInterval(callback,milliseconds);
    return ()=>clearInterval(timer);
  });
  const cancel=schedule(tick,20_000);
  return ()=>{if(!stopped){stopped=true;cancel();}};
}
