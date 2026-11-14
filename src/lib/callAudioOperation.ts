/** Bound uncancellable SDK work and fence every late result to its owner. */
export async function callAudioOperation<T>(
  operation:()=>Promise<T>,
  current:()=>boolean,
  late?:()=>void,
  timeoutMs=8000,
):Promise<T>{
  let expired=false,timer:ReturnType<typeof setTimeout>|undefined;
  const pending=Promise.resolve().then(()=>{
    if(!current())throw new Error('Call audio operation stopped.');
    return operation();
  }).then(value=>{
    if(expired||!current()){late?.();throw new Error('Call audio operation stopped.');}
    return value;
  });
  try{
    const value=await Promise.race([pending,new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>{expired=true;reject(new Error('Call audio operation timed out.'));},timeoutMs);
    })]);
    if(!current()){late?.();throw new Error('Call audio operation stopped.');}
    return value;
  }finally{if(timer)clearTimeout(timer);}
}
