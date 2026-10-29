import { PalabraError } from './palabraSpeech.ts';

// Shared by the legacy phrase endpoint and continuous streams. This is process
// capacity, not a replacement for distributed provider quota/account budgeting.
const users=new Set<string>();
export function reservePalabraCapacity(userId:string){
  if(users.has(userId)||users.size>=8)throw new PalabraError(429,'Live translation is busy. Stop the current translation or try again later.');
  users.add(userId);let released=false;
  return ()=>{if(!released){released=true;users.delete(userId);}};
}
