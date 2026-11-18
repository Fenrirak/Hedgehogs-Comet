import {createSync} from './sync.mjs';
import {mergeState} from './state.mjs';
import {toEnglish,toRomaji} from './language.mjs';
export async function startEnhancements(hooks){
  const byId=id=>document.getElementById(id);let adapter=null,account=null,languageEpoch=0;
  const status=message=>{byId('syncStatus').textContent=message;};
  byId('accountOpen').onclick=()=>{if(document.getElementById('importDialog').open)return;byId('accountDialog').showModal();};byId('accountClose').onclick=()=>byId('accountDialog').close();
  byId('accountForm').onsubmit=async e=>{
    e.preventDefault();if(!adapter)return;byId('accountSubmit').disabled=true;byId('accountMessage').textContent='';
    try{await adapter.signIn(byId('username').value,byId('password').value,byId('createAccount').checked,byId('mergeGuest').checked);byId('password').value='';byId('accountDialog').close();}
    catch(error){byId('accountMessage').textContent=error.code?'Could not sign in or create that account. Check your username/password, or choose another username.':error.message;}
    finally{byId('accountSubmit').disabled=false;}
  };
  byId('signOut').onclick=async()=>{try{await adapter.signOut();byId('accountDialog').close();}catch{byId('accountMessage').textContent='Sign out could not finish. Your device copy is safe. Try again.';}};
  byId('retrySync').onclick=()=>adapter?.retry();
  byId('accountExport').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({format:'kotoba-club-account-v1',state:hooks.snapshot()},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='hedgehogs-comet-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  byId('accountRestore').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>40000000)throw new Error('This backup is too large.');const data=JSON.parse(await file.text());if(data.format!=='kotoba-club-account-v1'||!Array.isArray(data.state?.materials))throw new Error('Choose a Hedgehog’s Comet account backup.');hooks.apply(mergeState(data.state,hooks.snapshot()));hooks.save();byId('accountMessage').textContent='Backup merged with this practice.';}catch(error){byId('accountMessage').textContent=error.message;}};
  byId('changePassword').onclick=async()=>{try{await adapter.changePassword(byId('currentPassword').value,byId('newPassword').value);byId('currentPassword').value=byId('newPassword').value='';byId('accountMessage').textContent='Password changed.';}catch{byId('accountMessage').textContent='Check your current password and use at least 12 characters for the new one.';}};
  byId('deleteAccount').onclick=async()=>{if(byId('deleteConfirmation').value!=='DELETE'){byId('accountMessage').textContent='Type DELETE to confirm deletion of this account and its cloud practice.';return;}try{await adapter.deleteAccount(byId('currentPassword').value);byId('currentPassword').value='';byId('accountMessage').textContent='Account and cloud practice deleted.';}catch{byId('accountMessage').textContent='Deletion could not finish. Check your current password and retry.';}};
  try{
    adapter=await createSync({
      onStatus:status,
      onState:state=>{if(!state)return hooks.snapshot();hooks.apply(mergeState(hooks.snapshot(),state));return hooks.snapshot();},
      onSession:async(user,includeGuest)=>{
        languageEpoch++;const before=hooks.snapshot();account=user;
        const next=hooks.changeAccount(user?.uid||null);
        hooks.apply(user&&includeGuest?mergeState(next,before):next);
        byId('signedOutControls').classList.toggle('hidden',!!user);byId('signedInControls').classList.toggle('hidden',!user);byId('accountOpen').textContent=user?user.username+' · account':'Free account';byId('accountTitle').textContent=user?`Your account · ${user.username}`:'Your practice, everywhere';
        return hooks.snapshot();
      }
    });
    byId('accountSubmit').disabled=!adapter;byId('accountSetupNotice').classList.toggle('hidden',!!adapter);return adapter;
  }catch(error){status('Saved on this device · accounts unavailable');byId('accountSetupNotice').textContent='Cloud sign-in could not start. Your local practice is still available. The site owner may need to finish Firebase setup.';byId('accountSubmit').disabled=true;return null;}
}
