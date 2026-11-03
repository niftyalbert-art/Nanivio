import type { Express, RequestHandler } from 'express';
import { communicationAccess, communicationCommand, CommunicationAccessError, type CommunicationPolicy } from './communicationAccess.ts';

const editable = ['priceMonthlyUSD','priceMonthlyGHS','priceAnnualUSD','priceAnnualGHS','includedVoiceMinutes','includedLangpretationMinutes'] as const;
export function applyCommunicationCatalogue(config: CommunicationPolicy, plans: any[]) {
  for (const plan of plans) {
    const override = config.plans?.find(entry => entry.id === plan.id);
    if (override) for (const key of editable) if (typeof override[key] === 'number') plan[key] = override[key];
    if (plan.tier === 'free') {
      plan.includedLangpretationMinutes = 0; plan.includedVoiceMinutes = 0;
      plan.features = ['Free ordinary chat and original voice notes', `${config.callTrialDays}-day calling trial from the first connected call`,
        `${config.liveTrialMinutes}-minute one-time live Langpretation trial`, 'Receiving ordinary calls is free'];
      plan.description = 'Free chat, an introductory calling period and a one-time live Langpretation trial';
    } else {
      const other=(plan.features||[]).filter((feature:string)=>!/\bminutes?\b|\bcharacters?\b|Langpretation|translated/i.test(feature));
      plan.features=[...other,`${plan.includedVoiceMinutes} shared ordinary audio/video minutes per purchased term`,
        `${plan.includedLangpretationMinutes} shared voice-note/live Langpretation minutes per purchased term`,
        `${config.paidTextCharacters.toLocaleString('en-US')} text Langpretation characters per purchased term`];
    }
  }
  return plans;
}
export function registerCommunicationRoutes(app: Express, auth: RequestHandler, admin: RequestHandler, getPlans: () => any[]) {
  const reply = (res: any, error: unknown) => res.status(error instanceof CommunicationAccessError ? error.status : 503)
    .json({success:false,error:error instanceof CommunicationAccessError ? error.message : 'Communication settings could not be loaded or saved.'});
  app.get('/api/communication/access',auth,async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    try {res.json({success:true,...await communicationAccess.access((req as any).authUser.id)});}
    catch(error){reply(res,error);}
  });
  app.get('/api/admin/communication-policy',admin,async(_req,res)=>{
    res.setHeader('Cache-Control','no-store');
    try {
      const config=await communicationAccess.policy();
      res.json({success:true,policy:config,plans:applyCommunicationCatalogue(config,getPlans())});
    } catch(error){reply(res,error);}
  });
  app.get('/api/admin/communication-policy/users/:userId',admin,async(req,res)=>{
    try {
      if(!req.params.userId||req.params.userId.length>128)throw new CommunicationAccessError(400,'Enter a valid account ID.');
      res.json({success:true,...await communicationAccess.access(req.params.userId)});
    }catch(error){reply(res,error);}
  });
  app.post('/api/admin/communication-policy/adjust',admin,async(req,res)=>{
    try {
      const {userId,resource,delta,reason,requestId}=req.body||{};
      if(typeof userId!=='string'||!userId.trim()||userId.length>128
        ||!['call','live','text'].includes(resource)||typeof delta!=='number'||!Number.isFinite(delta)||delta===0||Math.abs(delta)>10000000
        ||typeof reason!=='string'||reason.trim().length<3||reason.length>500
        ||typeof requestId!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(requestId))
        throw new CommunicationAccessError(400,'Enter a valid account, signed adjustment, reason and request ID.');
      res.json(await communicationCommand('ADMIN_ADJUST',{userId:userId.trim(),actorId:(req as any).authUser.id,resource,delta,reason:reason.trim(),requestId}));
    }catch(error){reply(res,error);}
  });
  app.put('/api/admin/communication-policy',admin,async(req,res)=>{
    try {
      const plans=getPlans();
      const input=req.body?.policy, proposed=req.body?.plans;
      if (!input || !Array.isArray(proposed) || proposed.length>100) throw new CommunicationAccessError(400,'Enter a complete policy and valid plan list.');
      const config: any={plans:[]};
      for(const [key,min,max] of [['callTrialDays',0,365],['liveTrialMinutes',0,10000],['paidTextCharacters',0,10000000],['warningSeconds',1,600]] as const){
        const value=input[key];
        if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||!Number.isInteger(value))throw new CommunicationAccessError(400,`Enter a whole number from ${min} to ${max} for ${key}.`);
        config[key]=value;
      }
      const ids=new Set<string>();
      for(const row of proposed){
        const original=plans.find(plan=>plan.id===row.id);
        if(!original||ids.has(row.id))throw new CommunicationAccessError(400,'The plan list contains an unknown or duplicate plan.');
        ids.add(row.id);
        const saved:any={id:original.id};
        for(const key of editable){
          const value=row[key];
          if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>10000000||(key.startsWith('price')&&original.tier!=='free'&&value<=0))
            throw new CommunicationAccessError(400,`Enter a valid ${key} for ${original.name}.`);
          saved[key]=original.tier==='free'?0:value;
        }
        config.plans.push(saved);
      }
      if(ids.size!==plans.length)throw new CommunicationAccessError(400,'Save the complete plan list so existing plans are not dropped.');
      await communicationCommand('SAVE_POLICY',{userId:(req as any).authUser.id,config});
      res.json({success:true,policy:config,plans:applyCommunicationCatalogue(config,plans)});
    } catch(error){reply(res,error);}
  });
}
