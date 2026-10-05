import crypto from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { NanivioUser, PersonalSignUpData, ExpertSignUpData, BusinessSignUpData, DriverSignUpData, AuthSession, ExpertApplication, BusinessApplication, DriverVerificationApplication } from '../types/auth';

function serverDb(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Persistent authentication requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  return createClient(url, key, { auth: { persistSession: false } });
}
function publicDb(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Persistent authentication requires SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY).');
  return createClient(url, key, { auth: { persistSession: false } });
}
function cleanPhone(v=''){ return v.trim().replace(/[^0-9+]/g,''); }
function initials(first:string,last:string){ return (first?.[0]||'N').concat(last?.[0]||'V').toUpperCase(); }
async function uniqueNvId(db:SupabaseClient){
  for(let i=0;i<50;i++){
    const nvId = `0486${crypto.randomInt(100000,1000000)}`;
    const {data,error}=await db.from('nanivio_users').select('id').eq('nv_id',nvId).maybeSingle();
    if(error) throw new Error(`Unable to allocate Nanivio number: ${error.message}`);
    if(!data) return nvId;
  }
  throw new Error('Unable to allocate a unique Nanivio number.');
}
function rowToUser(r:any):NanivioUser{
  return { id:r.id, nvId:r.nv_id, role:r.role, adminSubRole:r.admin_sub_role||undefined, firstName:r.first_name, lastName:r.last_name, displayName:r.display_name, username:r.username||undefined, statusMessage:r.status_message||undefined, email:r.email||'', phoneNumber:r.phone||'', country:r.country||'', state:r.state||undefined, city:r.city||undefined, constituency:r.constituency||undefined, districtOrMunicipality:r.district_or_municipality||undefined, callingCode:r.calling_code||'', preferredLanguage:r.my_language||'en', avatar:r.avatar||'', onlineVisibility:r.online_visibility||'everyone', profilePhotoVisibility:r.profile_photo_visibility||'everyone', lastSeenVisibility:r.last_seen_visibility||'everyone', readReceiptsEnabled:r.read_receipts_enabled ?? true, accountStatus:r.status||'ACTIVE', verificationStatus:r.verification_status||'UNVERIFIED', createdAt:new Date(r.created_at).getTime(), updatedAt:new Date(r.updated_at).getTime(), lastLoginAt:r.last_login_at?new Date(r.last_login_at).getTime():undefined, expertProfileId:r.expert_profile_id||undefined, businessProfileId:r.business_profile_id||undefined, driverProfileId:r.driver_profile_id||undefined };
}
async function profileByAuthId(authId:string){ const {data,error}=await serverDb().from('nanivio_users').select('*').eq('auth_user_id',authId).maybeSingle(); if(error) throw new Error(error.message); return data?rowToUser(data):null; }

export async function persistentAuthConfigured(){ return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && (process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_ANON_KEY)); }

async function createProfile(authUserId:string, input:any, role:any, application?:any){
  const db=serverDb(); const nvId=await uniqueNvId(db); const id=authUserId;
  const now=new Date().toISOString();
  const row={id,auth_user_id:authUserId,nv_id:nvId,name:input.displayName||`${input.firstName} ${input.lastName}`,role,first_name:input.firstName,last_name:input.lastName,display_name:input.displayName||`${input.firstName} ${input.lastName}`,email:input.email.trim().toLowerCase(),phone:cleanPhone(input.phoneNumber),country:input.country||'',state:input.state||null,city:input.city||null,constituency:input.constituency||null,district_or_municipality:input.districtOrMunicipality||null,calling_code:input.callingCode||'',my_language:input.preferredLanguage||'en',app_language:input.preferredLanguage||'en',avatar:input.avatar||'',status:'ACTIVE',verification_status:role==='PERSONAL'?'UNVERIFIED':'PENDING',created_at:now,updated_at:now};
  const {data,error}=await db.from('nanivio_users').insert(row).select('*').single();
  if(error) throw new Error(`Unable to persist Nanivio profile: ${error.message}`);
  if(application){ const a={id:application.id||crypto.randomUUID(),user_id:id,application_type:role,payload:application,status:'PENDING',created_at:now,updated_at:now}; const ar=await db.from('nanivio_user_applications').insert(a); if(ar.error) throw new Error(`Unable to persist application: ${ar.error.message}`); }
  return rowToUser(data);
}
async function issueSession(email:string,password:string,user:NanivioUser):Promise<AuthSession>{
  const {data,error}=await publicDb().auth.signInWithPassword({email,password});
  if(error||!data.session) throw new Error(error?.message||'Account was created, but a session could not be established. Please sign in.');
  await serverDb().from('nanivio_users').update({last_login_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',user.id);
  return {token:data.session.access_token,user,expiresAt:Date.now()+data.session.expires_in*1000};
}
async function createAccount(input:any,role:any,application?:any){
  const email=input.email.trim().toLowerCase(); if(!email||!input.password) throw new Error('Email and password are required.');
  const db=serverDb();
  const existing=await db.from('nanivio_users').select('id').eq('email',email).maybeSingle(); if(existing.error) throw new Error(existing.error.message); if(existing.data) throw new Error(`An account with email ${email} already exists. Please sign in instead.`);
  const {data,error}=await db.auth.admin.createUser({email,password:input.password,email_confirm:true,user_metadata:{first_name:input.firstName,last_name:input.lastName,role}});
  if(error||!data.user) throw new Error(error?.message||'Unable to create authentication account.');
  try { const user=await createProfile(data.user.id,input,role,application); const session=await issueSession(email,input.password,user); return {user,session}; }
  catch(e){ await db.auth.admin.deleteUser(data.user.id).catch(()=>{}); throw e; }
}

export async function registerPersonal(input:PersonalSignUpData){ return createAccount(input,'PERSONAL'); }
export async function registerExpert(input:ExpertSignUpData){ const application={...input,id:crypto.randomUUID()}; const r=await createAccount(input.personal,'EXPERT',application); return {...r,expertApp:{...application,userId:r.user.id,nvId:r.user.nvId,status:'PENDING',submittedAt:Date.now()}}; }
export async function registerBusiness(input:BusinessSignUpData){ const application={...input,id:crypto.randomUUID()}; const r=await createAccount(input.personal,'BUSINESS',application); const businessNvId=`NV-BIZ-${crypto.randomBytes(5).toString('hex').toUpperCase()}`; return {...r,businessApp:{...application,userId:r.user.id,nvId:r.user.nvId,businessNvId,status:'PENDING',submittedAt:Date.now()}}; }
export async function registerDriver(input:DriverSignUpData){ const application={...input,id:crypto.randomUUID()}; const r=await createAccount(input.personal,'DRIVER',application); return {...r,driverApp:{...application,userId:r.user.id,nvId:r.user.nvId,status:'PENDING',submittedAt:Date.now()}}; }

export async function signIn(identifier:string,password:string){
  const db=serverDb(); const id=identifier.trim(); let q=db.from('nanivio_users').select('*').limit(1);
  if(/^0486\d{6}$/.test(id.replace(/[^0-9]/g,''))) q=q.eq('nv_id',id.replace(/[^0-9]/g,''));
  else if(id.includes('@')) q=q.eq('email',id.toLowerCase());
  else q=q.eq('phone',cleanPhone(id));
  const {data,error}=await q.maybeSingle(); if(error) throw new Error(error.message); if(!data) throw new Error('No account found with this identifier.');
  if(data.status==='SUSPENDED') throw new Error('This account has been suspended.');
  const session=await issueSession(data.email,password,rowToUser(data)); return {user:session.user,session};
}
export async function userFromToken(token:string){ if(!token) return null; const pub=publicDb(); const {data,error}=await pub.auth.getUser(token); if(error||!data.user) return null; return profileByAuthId(data.user.id); }
export async function updateProfile(userId:string,updates:any){ const db=serverDb(); const patch:any={updated_at:new Date().toISOString()}; const map:any={firstName:'first_name',lastName:'last_name',displayName:'display_name',phoneNumber:'phone',country:'country',state:'state',city:'city',callingCode:'calling_code',preferredLanguage:'my_language',avatar:'avatar',statusMessage:'status_message'}; for(const [k,v] of Object.entries(updates||{})){ if(map[k]&&typeof v!=='undefined') patch[map[k]]=v; } const {data,error}=await db.from('nanivio_users').update(patch).eq('id',userId).select('*').single(); if(error) throw new Error(error.message); return rowToUser(data); }
export async function deleteAccount(userId:string){ const db=serverDb(); const {error}=await db.from('nanivio_users').update({status:'DEACTIVATED',updated_at:new Date().toISOString()}).eq('id',userId); if(error) throw new Error(error.message); }
export async function findByNvId(nvId:string){ const {data,error}=await serverDb().from('nanivio_users').select('*').eq('nv_id',nvId.replace(/[^0-9]/g,'')).maybeSingle(); if(error) throw new Error(error.message); return data?rowToUser(data):null; }
export async function findById(id:string){ const {data,error}=await serverDb().from('nanivio_users').select('*').eq('id',id).maybeSingle(); if(error) throw new Error(error.message); return data?rowToUser(data):null; }
export async function findByIdentifier(identifier:string){ const id=identifier.trim(); const db=serverDb(); let q=db.from('nanivio_users').select('*').limit(1); if(id.includes('@'))q=q.eq('email',id.toLowerCase()); else if(/^0486\d{6}$/.test(id.replace(/[^0-9]/g,'')))q=q.eq('nv_id',id.replace(/[^0-9]/g,'')); else q=q.eq('phone',cleanPhone(id)); const {data,error}=await q.maybeSingle(); if(error)throw new Error(error.message); return data?rowToUser(data):null; }
export async function requestPasswordRecovery(identifier:string){
  const user=await findByIdentifier(identifier); if(!user) return {message:'If the account exists, a password reset email has been sent.',maskedEmail:''};
  const email=user.email; const {error}=await publicDb().auth.resetPasswordForEmail(email,{redirectTo:process.env.PUBLIC_APP_URL?`${process.env.PUBLIC_APP_URL.replace(/\/$/,'')}/reset-password` : undefined}); if(error) throw new Error(error.message);
  const masked=email.replace(/^(.{2}).*(@.*)$/,'$1••••$2'); return {message:'Password reset instructions have been sent to the email address on the account.',maskedEmail:masked};
}
export async function resetPasswordWithAccessToken(accessToken:string,newPassword:string){
  if(!accessToken||newPassword.length<8) throw new Error('A valid recovery session and a password of at least 8 characters are required.');
  const pub=publicDb(); const {data,error}=await pub.auth.getUser(accessToken); if(error||!data.user) throw new Error('Recovery session is invalid or expired.');
  const {error:updateError}=await serverDb().auth.admin.updateUserById(data.user.id,{password:newPassword}); if(updateError) throw new Error(updateError.message);
  return true;
}

export function createAdminSession(masterKey:string):AuthSession{
  const configured=process.env.ADMIN_MASTER_KEY; if(!configured||!masterKey||masterKey!==configured) throw new Error('Invalid administrative master authorization key.');
  const user:any={id:'admin-master',nvId:process.env.NANIVIO_BOOTSTRAP_ADMIN_NVID||'0486000001',role:'ADMIN',adminSubRole:'SUPER_ADMIN',firstName:'Nanivio',lastName:'Administrator',displayName:'Nanivio Administrator',email:process.env.NANIVIO_BOOTSTRAP_ADMIN_EMAIL||'',phoneNumber:process.env.NANIVIO_BOOTSTRAP_ADMIN_PHONE||'',country:'',callingCode:'',preferredLanguage:'en',avatar:'',accountStatus:'ACTIVE',verificationStatus:'VERIFIED',createdAt:Date.now(),updatedAt:Date.now()};
  const payload=Buffer.from(JSON.stringify({uid:user.id,exp:Date.now()+8*60*60*1000})).toString('base64url');
  const sig=crypto.createHmac('sha256',configured).update(payload).digest('base64url');
  return {token:`nvadmin.${payload}.${sig}`,user,expiresAt:Date.now()+8*60*60*1000};
}
export function adminFromToken(token:string){
  const key=process.env.ADMIN_MASTER_KEY; if(!key||!token.startsWith('nvadmin.')) return null; const parts=token.split('.'); if(parts.length!==3) return null; const [_,payload,sig]=parts; const expected=crypto.createHmac('sha256',key).update(payload).digest('base64url'); if(!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))) return null; let d:any; try{d=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));}catch{return null;} if(!d?.uid||Date.now()>Number(d.exp||0)) return null; return createAdminSession(key).user;
}
export async function listUsers(q?:string,role?:string,status?:string){ const db=serverDb(); let query=db.from('nanivio_users').select('*').order('created_at',{ascending:false}).limit(500); if(role)query=query.eq('role',role); if(status)query=query.eq('status',status); if(q)query=query.or(`email.ilike.%${q}%,display_name.ilike.%${q}%,nv_id.ilike.%${q}%,phone.ilike.%${q}%`); const {data,error}=await query;if(error)throw new Error(error.message);return(data||[]).map(rowToUser); }
export async function updateUserStatus(userId:string,status:string){ const {data,error}=await serverDb().from('nanivio_users').update({status,updated_at:new Date().toISOString()}).eq('id',userId).select('*').single();if(error)throw new Error(error.message);return rowToUser(data); }
export async function listApplications(type:'EXPERT'|'BUSINESS'|'DRIVER',status?:string){ let q=serverDb().from('nanivio_user_applications').select('*').eq('application_type',type).order('created_at',{ascending:false}).limit(500);if(status)q=q.eq('status',status);const {data,error}=await q;if(error)throw new Error(error.message);return(data||[]).map((r:any)=>({...r.payload,id:r.id,userId:r.user_id,status:r.status,submittedAt:new Date(r.created_at).getTime(),applicationRecordId:r.id})); }
export async function reviewApplication(applicationId:string,action:string,notes?:string){ const statusMap:any={APPROVE:'VERIFIED',REJECT:'REJECTED',REQUEST_INFO:'UNDER_REVIEW',SUSPEND:'SUSPENDED'};const status=statusMap[action];if(!status)throw new Error('Unsupported review action.');const db=serverDb();const {data,error}=await db.from('nanivio_user_applications').update({status,updated_at:new Date().toISOString()}).eq('id',applicationId).select('*').single();if(error)throw new Error(error.message);const payload={...(data.payload||{}),status,adminNotes:notes||undefined,reviewedAt:Date.now()};await db.from('nanivio_user_applications').update({payload}).eq('id',applicationId);if(data.user_id)await db.from('nanivio_users').update({verification_status:status==='VERIFIED'?'VERIFIED':status==='SUSPENDED'?'SUSPENDED':'PENDING',updated_at:new Date().toISOString()}).eq('id',data.user_id);return {...payload,id:data.id,userId:data.user_id,status,submittedAt:new Date(data.created_at).getTime()}; }
export async function listContacts(userId:string){ const {data,error}=await serverDb().from('nanivio_contacts').select('*').eq('user_id',userId).order('created_at',{ascending:false});if(error)throw new Error(error.message);return(data||[]).map((r:any)=>r.payload); }
export async function saveContact(userId:string,contact:any){ const id=contact.id||crypto.randomUUID(); const createdAt=contact.createdAt||Date.now(); const nv=String(contact.nvId||contact.nanivioNumber||'').trim();if(!nv)throw new Error('A Nanivio number is required.');const {data,error}=await serverDb().from('nanivio_contacts').upsert({id,user_id:userId,contact_nv_id:nv,payload:{...contact,id,createdAt},updated_at:new Date().toISOString()},{onConflict:'user_id,contact_nv_id'}).select('*').single();if(error)throw new Error(error.message);return data.payload; }
export async function updateContact(userId:string,id:string,updates:any){ const {data:old,error:oe}=await serverDb().from('nanivio_contacts').select('payload').eq('id',id).eq('user_id',userId).single();if(oe)throw new Error(oe.message);const payload={...(old.payload||{}),...updates,id};const {data,error}=await serverDb().from('nanivio_contacts').update({payload,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',userId).select('*').single();if(error)throw new Error(error.message);return data.payload; }
export async function deleteContact(userId:string,id:string){ const {error}=await serverDb().from('nanivio_contacts').delete().eq('id',id).eq('user_id',userId);if(error)throw new Error(error.message); }
export async function getSettings(userId:string){ const {data,error}=await serverDb().from('nanivio_user_settings').select('settings').eq('user_id',userId).maybeSingle();if(error)throw new Error(error.message);return data?.settings||null; }
export async function saveSettings(userId:string,settings:any){ const {data,error}=await serverDb().from('nanivio_user_settings').upsert({user_id:userId,settings,updated_at:new Date().toISOString()},{onConflict:'user_id'}).select('settings').single();if(error)throw new Error(error.message);return data.settings; }
export async function listNotifications(userId:string){const {data,error}=await serverDb().from('nanivio_notifications').select('*').eq('user_id',userId).order('created_at',{ascending:false}).limit(100);if(error)throw new Error(error.message);return data||[];}
