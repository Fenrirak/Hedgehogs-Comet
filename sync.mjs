import {mergeState,splitState,normaliseUsername} from './state.mjs';
const SDK='https://www.gstatic.com/firebasejs/11.10.0/';
// All Firebase-specific behaviour lives behind this adapter.
export async function createSync({onSession,onState,onStatus}){
  const config=window.KOTOBA_CONFIG?.firebase;
  if(!config?.apiKey||!config?.projectId){onStatus('Saved on this device · accounts coming soon');return null;}
  const [appSDK,authSDK,dbSDK]=await Promise.all([import(SDK+'firebase-app.js'),import(SDK+'firebase-auth.js'),import(SDK+'firebase-firestore.js')]);
  const app=appSDK.initializeApp(config);
  if(window.KOTOBA_CONFIG.appCheckSiteKey){const ac=await import(SDK+'firebase-app-check.js');ac.initializeAppCheck(app,{provider:new ac.ReCaptchaEnterpriseProvider(window.KOTOBA_CONFIG.appCheckSiteKey),isTokenAutoRefreshEnabled:true});}
  const auth=authSDK.getAuth(app),db=dbSDK.getFirestore(app);
  await authSDK.setPersistence(auth,authSDK.browserSessionPersistence);
  let user=null,pending=null,timer,busy=false,unsubscribe,session=0,mergeGuest=false;
  const client=crypto.randomUUID();
  const email=name=>normaliseUsername(name)+'@users.kotoba.invalid';
  async function syncNow(){
    clearTimeout(timer);if(!user||busy||!pending)return;
    const local=pending,uid=user.uid,epoch=session;pending=null;busy=true;onStatus('Syncing your practice…');
    try{
      const root=dbSDK.doc(db,'users',uid,'state','manifest');
      const merged=await dbSDK.runTransaction(db,async tx=>{
        const manifest=await tx.get(root);const meta=manifest.data();const count=meta?.count||0;
        if(!Number.isInteger(count)||count<0||count>100)throw new Error('Cloud data needs recovery. Export this device’s practice and contact the site owner.');
        const refs=Array.from({length:count},(_,i)=>dbSDK.doc(db,'users',uid,'state','chunk-'+i));
        const chunks=await Promise.all(refs.map(ref=>tx.get(ref)));
        if(chunks.some(doc=>!doc.exists()))throw new Error('Cloud data is incomplete. Your device copy is safe.');
        const remote=count?JSON.parse(chunks.map(doc=>doc.data().text).join('')):{};
        const result=mergeState(local,remote),parts=splitState(result);
        parts.forEach((text,i)=>tx.set(dbSDK.doc(db,'users',uid,'state','chunk-'+i),{text}));
        for(let i=parts.length;i<count;i++)tx.delete(refs[i]);
        tx.set(root,{schema:1,count:parts.length,revision:(meta?.revision||0)+1,client,updatedAt:dbSDK.serverTimestamp()});
        return result;
      });
      if(epoch!==session)return;
      onState(merged);onStatus('All changes synced');
    }catch(error){if(epoch===session){pending=pending?mergeState(pending,local):local;onStatus('Saved on this device · sync paused. Retry when online.');}}
    finally{busy=false;if(pending&&epoch===session&&navigator.onLine)timer=setTimeout(syncNow,15000);}
  }
  authSDK.onAuthStateChanged(auth,async next=>{
    session++;clearTimeout(timer);unsubscribe?.();pending=null;user=next;
    while(busy)await new Promise(resolve=>setTimeout(resolve,100));
    const local=await onSession(next?{uid:next.uid,username:next.email?.split('@')[0]}:null,mergeGuest);mergeGuest=false;
    if(!next){onStatus('Saved on this device · guest mode');return;}
    pending=local;await syncNow();
    if(user?.uid!==next.uid)return;
    unsubscribe=dbSDK.onSnapshot(dbSDK.doc(db,'users',next.uid,'state','manifest'),snapshot=>{if(snapshot.exists()&&snapshot.data().client!==client){pending=pending?mergeState(pending,onState(null)):onState(null);timer=setTimeout(syncNow,700);}},()=>onStatus('Saved on this device · cloud connection unavailable'));
  });
  window.addEventListener('online',()=>syncNow());
  return {
    save(state){if(!user)return;pending=pending?mergeState(state,pending):state;clearTimeout(timer);timer=setTimeout(syncNow,3000);onStatus('Saved on this device · waiting to sync');},
    async signIn(name,password,create,includeGuest){mergeGuest=!!includeGuest;if(create&&password.length<12)throw new Error('Choose a password with at least 12 characters.');try{return await (create?authSDK.createUserWithEmailAndPassword:authSDK.signInWithEmailAndPassword)(auth,email(name),password);}catch(error){mergeGuest=false;throw error;}},
    async signOut(){await syncNow();await authSDK.signOut(auth);},
    retry:syncNow,
    async changePassword(password,next){if(!user)throw new Error('Sign in first.');if(next.length<12)throw new Error('Choose at least 12 characters.');await authSDK.reauthenticateWithCredential(user,authSDK.EmailAuthProvider.credential(user.email,password));await authSDK.updatePassword(user,next);},
    async deleteAccount(password){if(!user)throw new Error('Sign in first.');await authSDK.reauthenticateWithCredential(user,authSDK.EmailAuthProvider.credential(user.email,password));const uid=user.uid;clearTimeout(timer);unsubscribe?.();session++;pending=null;while(busy)await new Promise(resolve=>setTimeout(resolve,100));const docs=await dbSDK.getDocs(dbSDK.collection(db,'users',uid,'state'));const batch=dbSDK.writeBatch(db);docs.forEach(d=>batch.delete(d.ref));await batch.commit();await authSDK.deleteUser(user);localStorage.removeItem('kotoba-club-user-'+uid);},
  };
}
