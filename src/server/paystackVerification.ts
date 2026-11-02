import {paystackLiveConfigurationError} from './paystackPaymentSafety.ts';

type VerificationCode = 'CONFIGURATION_ERROR' | 'INVALID_REFERENCE' | 'AUTHORIZATION_REJECTED'
  | 'REFERENCE_NOT_FOUND' | 'RATE_LIMITED' | 'PROVIDER_UNAVAILABLE' | 'VERIFICATION_REJECTED'
  | 'INVALID_RESPONSE' | 'REQUEST_TIMEOUT' | 'TRANSPORT_ERROR';
const messages:Record<VerificationCode,string> = {
  CONFIGURATION_ERROR:'Live payment verification is not configured.',
  INVALID_REFERENCE:'The saved payment reference is invalid.',
  AUTHORIZATION_REJECTED:'Paystack rejected the server authorization. Check the live merchant account configuration.',
  REFERENCE_NOT_FOUND:'Paystack could not find this reference in the configured merchant account.',
  RATE_LIMITED:'Paystack temporarily limited verification requests.',
  PROVIDER_UNAVAILABLE:'Paystack verification is temporarily unavailable.',
  VERIFICATION_REJECTED:'Paystack rejected the verification request.',
  INVALID_RESPONSE:'Paystack did not return valid verification details.',
  REQUEST_TIMEOUT:'Paystack verification timed out.',
  TRANSPORT_ERROR:'The server could not complete its connection to Paystack.',
};
export class PaystackVerificationError extends Error {
  constructor(public code:VerificationCode, public upstreamHttpStatus?:number) {
    super(messages[code]);
    this.name='PaystackVerificationError';
  }
}
/** Only fixed codes and HTTP status; never provider text, credentials or payment metadata. */
export function paystackVerificationDiagnostic(error:unknown) {
  return error instanceof PaystackVerificationError
    ? {verificationCode:error.code, ...(error.upstreamHttpStatus ? {upstreamHttpStatus:error.upstreamHttpStatus} : {})}
    : {};
}
function httpFailure(status:number):VerificationCode {
  return status===401||status===403 ? 'AUTHORIZATION_REJECTED'
    : status===404 ? 'REFERENCE_NOT_FOUND' : status===429 ? 'RATE_LIMITED'
    : status>=500 ? 'PROVIDER_UNAVAILABLE' : 'VERIFICATION_REJECTED';
}

/** Read-only GET, one attempt. Confirmation/amount/ownership checks remain with fulfillment. */
export async function verifyPaystackTransaction(reference:string, key:string|undefined,
  options:{fetcher?:typeof fetch;timeoutMs?:number}={},
):Promise<any> {
  if(paystackLiveConfigurationError(key))throw new PaystackVerificationError('CONFIGURATION_ERROR');
  if(!/^[A-Za-z0-9_.=-]{1,120}$/.test(reference))throw new PaystackVerificationError('INVALID_REFERENCE');
  const signal=AbortSignal.timeout(Math.min(15_000,Math.max(1,options.timeoutMs??15_000)));
  let response:Response;
  try {
    response=await (options.fetcher??fetch)(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,{
      method:'GET',redirect:'error',signal,headers:{Authorization:`Bearer ${key}`},
    });
  } catch(error) {
    throw new PaystackVerificationError(signal.aborted || error instanceof Error &&
      ['TimeoutError','AbortError'].includes(error.name) ? 'REQUEST_TIMEOUT' : 'TRANSPORT_ERROR');
  }
  if(!response.ok && response.status!==400) {
    void response.body?.cancel().catch(()=>{});
    throw new PaystackVerificationError(httpFailure(response.status),response.status);
  }
  if(!response.body)throw new PaystackVerificationError('INVALID_RESPONSE',response.status);
  const reader=response.body.getReader(), chunks:Uint8Array[]=[];
  let size=0, abort!:()=>void;
  const stopped=new Promise<never>((_,reject)=>{
    abort=()=>{reject(new PaystackVerificationError('REQUEST_TIMEOUT',response.status));void reader.cancel().catch(()=>{});};
    signal.addEventListener('abort',abort,{once:true});
  });
  let payload:any;
  try {
    if(signal.aborted)abort();
    while(true) {
      const {value,done}=await Promise.race([reader.read(),stopped]);
      if(done)break;
      size+=value.length;
      if(size>128*1024)throw new PaystackVerificationError('INVALID_RESPONSE',response.status);
      chunks.push(value);
    }
    payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch(error) {
    if(error instanceof PaystackVerificationError)throw error;
    throw new PaystackVerificationError(signal.aborted?'REQUEST_TIMEOUT':response.ok?'INVALID_RESPONSE':httpFailure(response.status),response.status);
  } finally {
    signal.removeEventListener('abort',abort);
    void reader.cancel().catch(()=>{});
  }
  if(!response.ok || payload?.status!==true) {
    const missingReference=typeof payload?.message==='string' &&
      /^transaction (?:reference )?not found[.!]?$/i.test(payload.message.trim());
    throw new PaystackVerificationError(missingReference?'REFERENCE_NOT_FOUND':httpFailure(response.status),response.status);
  }
  if(!payload.data || typeof payload.data!=='object' || Array.isArray(payload.data))
    throw new PaystackVerificationError('INVALID_RESPONSE',response.status);
  return payload.data;
}
