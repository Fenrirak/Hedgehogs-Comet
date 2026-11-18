import {createSync} from './sync.mjs';
import {mergeState} from './state.mjs';
export async function startEnhancements(hooks){
  const byId=id=>document.getElementById(id);let adapter=null;
  const handwriting=byId('handwritingMode');
  handwriting.disabled=true;
  function updateHandwriting(signedIn){
    const enabled=!!window.KOTOBA_CONFIG?.handwritingEnabled;
    handwriting.disabled=!enabled||!signedIn;
    if(handwriting.disabled)handwriting.checked=false;
    byId('handwritingHelp').textContent=!enabled?'Cloud handwriting is unavailable on this site. Printed-text OCR works locally.':signedIn?'Enabling this sends selected images to Google Cloud Vision. Printed-text OCR stays local.':'Sign in to use cloud handwriting recognition. Printed-text OCR works locally.';
  }
  updateHandwriting(false);
  const status=message=>{byId('syncStatus').textContent=message;};
  byId('accountOpen').onclick=()=>{if(document.getElementById('importDialog').open)return;byId('accountDialog').showModal();};byId('accountClose').onclick=()=>byId('accountDialog').close();
  const passwordToggles=document.querySelectorAll('[data-password-toggle]');
  function showPassword(button,visible){
    byId(button.getAttribute('aria-controls')).type=visible?'text':'password';
    button.setAttribute('aria-label',(visible?'Hide ':'Show ')+button.dataset.passwordToggle);
  }
  for(const button of passwordToggles){
    button.onclick=()=>showPassword(button,byId(button.getAttribute('aria-controls')).type==='password');
  }
  byId('accountDialog').addEventListener('close',()=>{
    for(const button of passwordToggles){showPassword(button,false);byId(button.getAttribute('aria-controls')).value='';}
    byId('deleteConfirmation').value='';byId('mergeGuest').checked=false;
  });
  const createAccount=byId('createAccount'),consent=byId('acceptAccountTerms');
  function updateAccountForm(){
    byId('accountConsent').hidden=!createAccount.checked;
    consent.required=createAccount.checked;
    if(!createAccount.checked)consent.checked=false;
    byId('password').autocomplete=createAccount.checked?'new-password':'current-password';
  }
  createAccount.onchange=updateAccountForm;
  updateAccountForm();
  byId('accountForm').onsubmit=async e=>{
    e.preventDefault();
    if(createAccount.checked&&!consent.checked){consent.reportValidity();return;}
    if(!adapter)return;byId('accountSubmit').disabled=true;byId('accountMessage').textContent='';
    try{await adapter.signIn(byId('username').value,byId('password').value,createAccount.checked,byId('mergeGuest').checked);byId('password').value='';createAccount.checked=false;updateAccountForm();byId('accountDialog').close();}
    catch(error){byId('accountMessage').textContent=error.code?'Could not sign in or create that account. Check your username/password, or choose another username.':error.message;}
    finally{byId('accountSubmit').disabled=false;}
  };
  byId('signOut').onclick=async()=>{try{await adapter.signOut();byId('accountDialog').close();}catch{byId('accountMessage').textContent='Sign out could not finish. Your device copy is safe. Try again.';}};
  byId('retrySync').onclick=async()=>{
    const button=byId('retrySync'),message=byId('syncRetryMessage');
    button.disabled=true;
    message.textContent='Checking sync…';
    try{
      message.textContent=adapter?await adapter.retry():'Sync checked. Cloud sync is unavailable.';
    }catch{
      message.textContent='Sync could not run. Try again when online.';
    }finally{button.disabled=false;}
  };
  byId('accountExport').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({format:'kotoba-club-account-v1',state:hooks.snapshot()},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='hedgehogs-comet-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  byId('accountRestore').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>40000000)throw new Error('This backup is too large.');const data=JSON.parse(await file.text());if(data?.format!=='kotoba-club-account-v1'||!Array.isArray(data.state?.materials)||data.state.materials.some(m=>typeof m?.id!=='string'||typeof m.name!=='string'||typeof m.text!=='string'||m.text.length>200000)|| (data.state.swaps!=null&&!Array.isArray(data.state.swaps)))throw new Error('Choose a Hedgehog’s Comet account backup.');hooks.apply(mergeState(data.state,hooks.snapshot()));hooks.save();byId('accountMessage').textContent='Backup merged with this practice.';}catch(error){byId('accountMessage').textContent=error.message;}finally{e.target.value='';}};
  byId('changePassword').onclick=async()=>{
    const current=byId('currentPassword'),next=byId('newPassword'),message=byId('accountMessage');
    if(next.value.length<6){message.textContent='Use at least 6 characters for the new password.';next.focus();return;}
    try{await adapter.changePassword(current.value,next.value);current.value=next.value='';message.textContent='Password changed.';}
    catch{message.textContent='Check your current password and try again.';}
  };
  byId('deleteAccount').onclick=async()=>{if(byId('deleteConfirmation').value!=='DELETE'){byId('accountMessage').textContent='Type DELETE to confirm deletion of this account and its cloud practice.';return;}try{await adapter.deleteAccount(byId('currentPassword').value);byId('currentPassword').value='';byId('accountMessage').textContent='Account and cloud practice deleted.';}catch{byId('accountMessage').textContent='Deletion could not finish. Check your current password and retry.';}};
  try{
    adapter=await createSync({
      onStatus:status,
      onState:state=>{if(!state)return hooks.snapshot();hooks.apply(mergeState(hooks.snapshot(),state));return hooks.snapshot();},
      onSession:async(user,includeGuest)=>{
        const before=hooks.snapshot();updateHandwriting(!!user);
        const next=hooks.changeAccount(user?.uid||null);
        hooks.apply(user&&includeGuest?mergeState(next,before):next);
        byId('signedOutControls').classList.toggle('hidden',!!user);byId('signedInControls').classList.toggle('hidden',!user);byId('accountOpen').textContent=user?user.username+' · account':'Free account';byId('accountTitle').textContent=user?`Your account · ${user.username}`:'Your practice, everywhere';
        return hooks.snapshot();
      }
    });
    byId('accountSubmit').disabled=!adapter;byId('accountSetupNotice').classList.toggle('hidden',!!adapter);return adapter;
  }catch(error){status('Saved on this device · accounts unavailable');byId('accountSetupNotice').textContent='Cloud sign-in could not start. Your local practice is still available. The site owner may need to finish Firebase setup.';byId('accountSubmit').disabled=true;return null;}
}
