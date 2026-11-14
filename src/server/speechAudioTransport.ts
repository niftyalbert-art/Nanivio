/**
 * One bounded HTTPS request for Khaya audio. No redirects, retries or fallback.
 * Keep this separate from the text/recognition transports.
 */
export async function requestSpeechAudio(
  url:URL,headers:Record<string,string>,body:string,signal:AbortSignal,
):Promise<Response>{
  if(url.protocol!=='https:')throw new Error('Speech transport requires HTTPS.');
  if(signal.aborted)throw new Error('Speech request cancelled.');
  const {request}=await import('node:https');
  if(signal.aborted)throw new Error('Speech request cancelled.');
  return new Promise<Response>((resolve,reject)=>{
    const max=8*1024*1024;
    let settled=false;
    const finish=(error?:Error,response?:Response)=>{
      if(settled)return;
      settled=true;
      signal.removeEventListener('abort',abort);
      if(error)reject(error);else resolve(response!);
    };
    const req=request(url,{method:'POST',headers:{...headers,
      'Content-Length':Buffer.byteLength(body),'Accept-Encoding':'identity'}},res=>{
      const chunks:Buffer[]=[];let size=0;
      const fail=()=>{
        finish(new Error('Speech audio download was interrupted.'));
        res.destroy();req.destroy();
      };
      res.on('error',fail);
      res.on('aborted',fail);
      res.on('data',(chunk:Buffer)=>{
        if(settled)return;
        size+=chunk.length;
        if(size>max){fail();return;}
        chunks.push(chunk);
      });
      res.on('end',()=>{
        if(settled)return;
        if(signal.aborted||!res.complete){fail();return;}
        const length=res.headers['content-length'];
        if(typeof length==='string'&&/^\d+$/.test(length)&&Number(length)!==size){fail();return;}
        const responseHeaders=new Headers();
        for(const [key,value] of Object.entries(res.headers)){
          if(value!==undefined)responseHeaders.set(key,Array.isArray(value)?value.join(', '):value);
        }
        try{
          const status=res.statusCode||502;
          const bytes=Buffer.concat(chunks);
          finish(undefined,new Response([204,205,304].includes(status)?null:new Uint8Array(bytes),
            {status,headers:responseHeaders}));
        }catch{fail();}
      });
      res.on('close',()=>{if(!res.complete&&!settled)fail();});
    });
    const abort=()=>{
      finish(new Error('Speech request cancelled.'));
      req.destroy();
    };
    req.on('error',()=>finish(new Error('Speech audio transport failed.')));
    signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted){abort();return;}
    req.end(body);
  });
}
