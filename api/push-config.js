/* Public Web Push capability check. Never returns private credentials. */
export function getPushConfiguration(env=process.env){
 const publicKey=String(env.HABITARC_VAPID_PUBLIC_KEY||'');
 const privateReady=Boolean(env.HABITARC_VAPID_PRIVATE_KEY);
 const adminReady=Boolean(env.FIREBASE_SERVICE_ACCOUNT_JSON||env.FIREBASE_SERVICE_ACCOUNT_BASE64);
 const cronReady=Boolean(env.CRON_SECRET);
 return {available:/^[A-Za-z0-9_-]{80,120}$/.test(publicKey)&&privateReady&&adminReady&&cronReady,
   publicKey:/^[A-Za-z0-9_-]{80,120}$/.test(publicKey)?publicKey:'',
   reason:adminReady?'':'Firebase Admin service account must be configured before closed-app delivery is available.',
   cadence:'One background digest daily around 08:30–09:30 IST, subject to browser/Vercel delivery delays.'};
}
export default function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method-not-allowed'});}
 const config=getPushConfiguration();
 return res.status(200).json(config);
}
