import { getServerSupabase } from './supabaseServer';

export interface AccountLease {
  allowed(mediaFrame?: boolean): Promise<boolean>;
  dispose(): void;
}
type ReadActive = (owners: string[]) => Promise<Set<string>>;
// Account-level checks cover browser and native sockets independently of how
// their login token was issued. This is not revocation of third-party RTC grants.
export class AccountAccessAuthority {
  private watches = new Map<string,Set<{ ended:boolean; checked:number; close:()=>void }>>();
  private timer?: ReturnType<typeof setInterval>;
  private refreshing = false;
  constructor(private read: ReadActive, private intervalMs=1000) {}
  private end(owner: string) {
    for(const lease of this.watches.get(owner)||[])if(!lease.ended) {
      lease.ended=true;
      try {lease.close();} catch {/* One failed callback must not preserve other leases. */}
    }
  }
  async refresh() {
    if(this.refreshing||!this.watches.size)return;
    this.refreshing=true;
    const owners=[...this.watches.keys()];
    try {
      const active=await this.read(owners);
      for(const owner of owners) {
        if(!active.has(owner))this.end(owner);
        else for(const lease of this.watches.get(owner)||[])if(!lease.ended)lease.checked=Date.now();
      }
    } catch {for(const owner of owners)this.end(owner);}
    finally {this.refreshing=false;}
  }
  watch(owner: string,close:()=>void): AccountLease {
    const state={ended:false,checked:0,close};
    const group=this.watches.get(owner)||new Set<typeof state>();
    group.add(state);this.watches.set(owner,group);
    if(!this.timer) {
      this.timer=setInterval(()=>void this.refresh(),this.intervalMs);
      this.timer.unref?.();
    }
    return {
      allowed:async(mediaFrame=false)=>{
        if(state.ended)return false;
        if(mediaFrame&&state.checked>Date.now()-1000)return true;
        try {
          if(!(await this.read([owner])).has(owner)){this.end(owner);return false;}
          state.checked=Date.now();
          return !state.ended;
        } catch {this.end(owner);return false;}
      },
      dispose:()=>{
        state.ended=true;group.delete(state);
        if(!group.size)this.watches.delete(owner);
        if(!this.watches.size&&this.timer){clearInterval(this.timer);this.timer=undefined;}
      },
    };
  }
}
export const accountAccessAuthority=new AccountAccessAuthority(async owners=>{
  const db=getServerSupabase();
  if(!db)throw Error('Account authority unavailable');
  const active=new Set<string>();
  for(let index=0;index<owners.length;index+=200) {
    const {data,error}=await db.from('nanivio_users').select('id')
      .in('id',owners.slice(index,index+200)).eq('status','ACTIVE')
      .abortSignal(AbortSignal.timeout(4000));
    if(error)throw Error('Account authority unavailable');
    for(const row of data||[])active.add(row.id);
  }
  return active;
});
