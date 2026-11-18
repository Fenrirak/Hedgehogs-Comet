import {mergeState,splitState,normaliseUsername} from './state.mjs';
const SDK='https://www.gstatic.com/firebasejs/11.10.0/';

function sameManifest(current,previous){
  return current&&previous&&current.client===previous.client&&current.revision===previous.revision
    &&current.count===previous.count
    &&(!previous.updatedAt||(current.updatedAt&&previous.updatedAt.isEqual(current.updatedAt)));
}

export function syncPractice(dbSDK,db,uid,local,cached,client){
  const root=dbSDK.doc(db,'users',uid,'state','manifest');
  const chunk=index=>dbSDK.doc(db,'users',uid,'state','chunk-'+index);
  // A unique marker also distinguishes writes if a deleted manifest is recreated.
  const version=client+':'+crypto.randomUUID();
  return dbSDK.runTransaction(db,async tx=>{
    const meta=(await tx.get(root)).data();
    const count=meta?.count??0;
    if(!Number.isInteger(count)||count<0||count>100)throw new Error('Cloud data needs recovery. Export this device’s practice and contact the site owner.');

    let previousParts;
    // Sync clients change the manifest in the same transaction as the chunks.
    if(sameManifest(meta,cached?.manifest)){
      previousParts=cached.parts;
    }else{
      const chunks=await Promise.all(Array.from({length:count},(_,index)=>tx.get(chunk(index))));
      if(chunks.some(doc=>!doc.exists()))throw new Error('Cloud data is incomplete. Your device copy is safe.');
      previousParts=chunks.map(doc=>doc.data().text);
    }

    const remote=count?JSON.parse(previousParts.join('')):{};
    const state=mergeState(local,remote);
    const parts=splitState(state);
    if(parts.length===count&&parts.every((text,index)=>text===previousParts[index])){
      return {state,manifest:meta,parts};
    }

    parts.forEach((text,index)=>{
      if(text!==previousParts[index])tx.set(chunk(index),{text});
    });
    for(let index=parts.length;index<count;index++)tx.delete(chunk(index));
    const manifest={schema:1,count:parts.length,revision:(meta?.revision||0)+1,client:version};
    tx.set(root,{...manifest,updatedAt:dbSDK.serverTimestamp()});
    return {state,manifest,parts};
  });
}

// All Firebase-specific behaviour lives behind this adapter.
export async function createSync({onSession,onState,onStatus}){
  const config=window.KOTOBA_CONFIG?.firebase;
  if(!config?.apiKey||!config?.projectId){onStatus('Saved on this device · accounts coming soon');return null;}
  const [appSDK,authSDK,dbSDK]=await Promise.all([import(SDK+'firebase-app.js'),import(SDK+'firebase-auth.js'),import(SDK+'firebase-firestore.js')]);
  const app=appSDK.initializeApp(config);
  if(window.KOTOBA_CONFIG.appCheckSiteKey){const ac=await import(SDK+'firebase-app-check.js');ac.initializeAppCheck(app,{provider:new ac.ReCaptchaEnterpriseProvider(window.KOTOBA_CONFIG.appCheckSiteKey),isTokenAutoRefreshEnabled:true});}
  const auth=authSDK.getAuth(app),db=dbSDK.getFirestore(app);
  await authSDK.setPersistence(auth,authSDK.browserSessionPersistence);
  let deleting=false,user=null,pending=null,timer,busy=false,unsubscribe,session=0,mergeGuest=false,cached;
  const client=crypto.randomUUID();
  const email=name=>normaliseUsername(name)+'@users.kotoba.invalid';
  async function syncNow(){
    clearTimeout(timer);if(!user||deleting||busy||!pending)return;
    const local=pending,uid=user.uid,epoch=session;pending=null;busy=true;onStatus('Syncing your practice…');
    try{
      const {state,manifest,parts}=await syncPractice(dbSDK,db,uid,local,cached,client);
      if(epoch!==session)return;
      cached={manifest,parts};
      onState(state);onStatus(pending?'Saved on this device · waiting to sync':'All changes synced');return true;
    }catch(error){if(epoch===session){pending=pending?mergeState(pending,local):local;onStatus('Saved on this device · sync paused. Retry when online.');}return false;}
    finally{busy=false;if(pending&&epoch===session&&navigator.onLine)timer=setTimeout(syncNow,15000);}
  }
  authSDK.onAuthStateChanged(auth,async next=>{
    const epoch=++session;
    clearTimeout(timer);unsubscribe?.();pending=null;cached=undefined;user=next;
    while(busy)await new Promise(resolve=>setTimeout(resolve,100));
    if(epoch!==session)return;
    const local=await onSession(next?{uid:next.uid,username:next.email?.split('@')[0]}:null,mergeGuest);mergeGuest=false;
    if(epoch!==session)return;
    if(!next){onStatus('Saved on this device · guest mode');return;}
    pending=local;await syncNow();
    if(epoch!==session)return;
    const root=dbSDK.doc(db,'users',next.uid,'state','manifest');
    unsubscribe=dbSDK.onSnapshot(root,{includeMetadataChanges:true},snapshot=>{
      if(epoch!==session||snapshot.metadata.fromCache||!snapshot.exists())return;
      const meta=snapshot.data();
      if(meta.client?.startsWith(client+':')||sameManifest(meta,cached?.manifest))return;
      const local=onState(null);
      pending=pending?mergeState(pending,local):local;
      clearTimeout(timer);
      timer=setTimeout(syncNow,700);
    },()=>{if(epoch===session)onStatus('Saved on this device · cloud connection unavailable');});
  });
  window.addEventListener('online',()=>syncNow());
  return {
    save(state){if(!user||deleting)return;pending=pending?mergeState(state,pending):state;clearTimeout(timer);timer=setTimeout(syncNow,3000);onStatus('Saved on this device · waiting to sync');},
    async signIn(name,password,create,includeGuest){if(create&&password.length<6)throw new Error('Choose a password with at least 6 characters.');mergeGuest=!!includeGuest;try{return await (create?authSDK.createUserWithEmailAndPassword:authSDK.signInWithEmailAndPassword)(auth,email(name),password);}catch(error){mergeGuest=false;throw error;}},
    async signOut(){await syncNow();await authSDK.signOut(auth);},
    async retry(){
      if(!user)return 'Sync checked. Sign in to sync your practice.';
      if(busy)return 'Sync is already in progress.';
      if(!pending)return 'Sync checked. Nothing new to sync.';
      return await syncNow()?'Sync complete.':'Sync could not finish. Your practice is saved on this device.';
    },
    async changePassword(password,next){if(!user)throw new Error('Sign in first.');if(next.length<6)throw new Error('Choose at least 6 characters.');await authSDK.reauthenticateWithCredential(user,authSDK.EmailAuthProvider.credential(user.email,password));await authSDK.updatePassword(user,next);},
    async deleteAccount(password){if(!user)throw new Error('Sign in first.');await authSDK.reauthenticateWithCredential(user,authSDK.EmailAuthProvider.credential(user.email,password));const uid=user.uid;deleting=true;clearTimeout(timer);try{while(busy)await new Promise(resolve=>setTimeout(resolve,100));const docs=await dbSDK.getDocs(dbSDK.collection(db,'users',uid,'state'));const batch=dbSDK.writeBatch(db);docs.forEach(d=>batch.delete(d.ref));await batch.commit();await authSDK.deleteUser(user);localStorage.removeItem('kotoba-club-user-'+uid);}finally{deleting=false;if(user?.uid===uid&&auth.currentUser){pending=onState(null);timer=setTimeout(syncNow,3000);}}},
  };
}
