import { assertLivePaystackPayment, paystackLiveConfigurationError } from './paystackPaymentSafety.ts';
import { PAYSTACK_PURPOSES } from './paystackOrders.ts';

type Order = { reference:string; userId:string; purpose:string; amount:number; currency:string };

/** Backup for delayed/missed webhooks. Only verifies already-created orders;
 * never initializes a checkout, charges a card, or retries an inference call.
 */
export function createPaystackReconciler(deps:{
  list:()=>Promise<Order[]>;
  verify:(reference:string)=>Promise<any>;
  fulfil:(order:Order,transaction:any)=>Promise<void>;
  checked:(reference:string)=>Promise<void>;
  report:(reference:string,error:unknown)=>void;
}) {
  let running=false;
  return async () => {
    if(running)return;
    running=true;
    try {
      const orders=await deps.list();
      for(const order of orders){
        try {
          if(!PAYSTACK_PURPOSES.includes(order.purpose as typeof PAYSTACK_PURPOSES[number]))continue;
          const transaction=await deps.verify(order.reference);
          if(transaction?.status!=='success')continue;
          assertLivePaystackPayment(transaction);
          if(transaction.reference!==order.reference || transaction.amount!==Math.round(order.amount*100)
            ||transaction.currency?.toUpperCase()!==order.currency?.toUpperCase())
            throw new Error('Payment does not match the saved order');
          await deps.fulfil(order,transaction);
        } catch(error){deps.report(order.reference,error);}
        finally {await deps.checked(order.reference).catch(error=>deps.report(order.reference,error));}
      }
    } catch(error){deps.report('batch',error);}
    finally {running=false;}
  };
}

export function startPaystackReconciliation(run:()=>Promise<void>,environment:string|undefined,key:string|undefined){
  // Preview frequently shares the owner's database. Never run financial
  // background writes there, or with a test-mode key.
  if(environment!=='production'||paystackLiveConfigurationError(key))return ()=>{};
  void run();
  const timer=setInterval(()=>{void run();},20000);
  timer.unref();
  return ()=>clearInterval(timer);
}
