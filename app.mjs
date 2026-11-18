import {toEnglish,toRomaji} from './language.mjs';
import {startEnhancements} from './enhancements.mjs';
import {packs,parseVocabulary,parseSentences,chooseNext,reviewRating,createVariations,clamp,hasJapanese} from './core.mjs';
import {importFile} from './importer.mjs';
import {isMaterialLink,makeMaterialLink,readMaterialLink} from './sharing.mjs';
const $=id=>document.getElementById(id), KEY='kotoba-club-v1';
const node=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;};
let activeSwap=0;
let activeStorageKey=KEY,syncAdapter=null,restoring=false;
let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{}
let snapshotTime=Number(saved.updatedAt)||0,deleted=saved.deleted||{},lastPersistJson='';
const materials=Array.isArray(saved.materials)?saved.materials.filter(x=>typeof x.id==='string'&&typeof x.name==='string'&&typeof x.text==='string').slice(0,50):[];
let ratings=saved.ratings&&typeof saved.ratings==='object'&&!Array.isArray(saved.ratings)?saved.ratings:{};
let source=packs.find(x=>x.id===saved.source)||materials.find(x=>x.id===saved.source)||packs[0];
let sharedSource=null;
let mode='vocab',items=[],current=0,turn=0,running=false,paused=false,generation=0,cancelPending=null,sessionReads=0,view='vocab';
let feedbackState='',respondToRating=null;
let voices=[],previewRatings={},importBusy=false,editingId=null,attached=[],importedRatings=null,toastTimer;
const settings=saved.settings||{};
const settingsFields={speed:[.5,1.25,.85],delay:[0,20,3],gap:[0,20,3],repeats:[1,10,2]};
for(const [id,[min,max,def]] of Object.entries(settingsFields))$(id).value=clamp(settings[id]??def,min,max,def);
for(const id of ['loop','hints'])$(id).checked=settings[id]!==false;
$('paragraph').value=typeof saved.paragraph==='string'?saved.paragraph:$('paragraph').value;
$('wordBank').value=typeof saved.wordBank==='string'?saved.wordBank:$('wordBank').value;
let selectedVoice=typeof settings.voice==='string'?settings.voice:'';
function currentSettings(){return {...Object.fromEntries(Object.keys(settingsFields).map(id=>[id,Number($(id).value)])),loop:$('loop').checked,hints:$('hints').checked,englishHints:$('englishHints').checked,voice:voices[Number($('voice').value)]?.voiceURI||selectedVoice};}
function snapshot(){return structuredClone({materials,ratings,source:source.id,settings:currentSettings(),paragraph:$('paragraph').value,wordBank:$('wordBank').value,mode,current,deleted,updatedAt:snapshotTime,swaps:[...$('swapRows').children].map(row=>({from:row.children[0].value,to:row.children[1].value,kind:row.children[2].value})),referenceId:$('referencePicker').value,draft:{name:$('materialTitle').value,text:$('materialText').value},speechItems:mode==='speech'?items:null,language:{text:$('languageInput').value,romaji:$('romajiResult').textContent,english:$('englishResult').textContent}});}
function persist(){if(restoring)return;const state=snapshot();const comparable=JSON.stringify({...state,updatedAt:0});if(comparable!==lastPersistJson){snapshotTime=Date.now();state.updatedAt=snapshotTime;lastPersistJson=comparable;}try{localStorage.setItem(activeStorageKey,JSON.stringify(state));syncAdapter?.save(state);}catch{toast('Browser storage is full or unavailable. Export your practice to keep a copy.');}}
function applyState(state={}){
 restoring=true;try{
  stop();materials.splice(0,materials.length,...(Array.isArray(state.materials)?state.materials:[]).filter(x=>typeof x.id==='string'&&typeof x.text==='string'&&typeof x.name==='string'));
  ratings=state.ratings&&typeof state.ratings==='object'?state.ratings:{};deleted=state.deleted||{};snapshotTime=Number(state.updatedAt)||0;
  if(!sharedSource||source!==sharedSource){
    source=packs.find(x=>x.id===state.source)||materials.find(x=>x.id===state.source)||packs[0];
  }
  for(const [id,[min,max,def]]of Object.entries(settingsFields))$(id).value=clamp(state.settings?.[id]??def,min,max,def);
  for(const id of ['loop','hints'])$(id).checked=state.settings?.[id]!==false;$('englishHints').checked=state.settings?.englishHints===true;
  selectedVoice=state.settings?.voice||'';$('voice').value='';setMode(state.mode==='speech'?'speech':'vocab');
  $('paragraph').value=state.paragraph||'';$('wordBank').value=state.wordBank||'';
  if(mode==='speech'&&Array.isArray(state.speechItems)&&state.speechItems.length)items=state.speechItems.filter(x=>typeof x.ja==='string'&&hasJapanese(x.ja));
  current=clamp(state.current||0,0,Math.max(0,items.length-1));
  $('swapRows').replaceChildren();for(const swap of state.swaps||[]){addSwap(swap.from,swap.to);$('swapRows').lastChild.children[2].value=swap.kind||'Noun';}
  if(state.referenceId)$('referencePicker').value=state.referenceId;refreshReferenceWords();
  $('materialTitle').value=state.draft?.name||'';$('materialText').value=state.draft?.text||'';
  $('languageInput').value=state.language?.text||'';$('romajiResult').textContent=state.language?.romaji||'';$('englishResult').textContent=state.language?.english||'';
  $('itemCount').textContent=`${items.length} ${mode==='vocab'?'words':'sentences'}`;render();renderWords();renderMaterials();updateSettings();voiceOptions();
 }finally{restoring=false;lastPersistJson=JSON.stringify({...snapshot(),updatedAt:0});try{localStorage.setItem(activeStorageKey,JSON.stringify(snapshot()));}catch{}}
}
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),5000);}
function setStatus(text,playing=false){$('statusText').textContent=text;$('status').classList.toggle('playing',playing);}
function voiceOptions(){
  if(!('speechSynthesis' in window)){$('voice').replaceChildren(new Option('Speech unavailable in this browser',''));$('voiceHelp').textContent='Try a browser with text-to-speech support and a Japanese voice.';$('voiceHelp').classList.add('warning');return;}
  const old=$('voice').value||selectedVoice;voices=speechSynthesis.getVoices().filter(v=>/^ja(?:-|_|$)/i.test(v.lang));
  $('voice').replaceChildren(...(voices.length?voices.map((v,i)=>new Option(v.name+(v.localService?' · on device':''),String(i))):[new Option('No Japanese voice found','')]));
  let match=voices.findIndex(v=>v.voiceURI===old||v.name===old);if(match<0&&old!==''&&voices[Number(old)])match=Number(old);if(match>=0)$('voice').value=String(match);
  $('voiceHelp').textContent=voices.length?'Choose the clearest voice for you. Preview it with Start listening.':'Install a Japanese speech voice in your device’s language settings, then reopen the browser.';
  $('voiceHelp').classList.toggle('warning',!voices.length);$('play').disabled=!voices.length||!items.length;
}
function normaliseDue(){previewRatings={};for(const item of items){const r=ratings[item.ja];if(r&&typeof r==='object')previewRatings[item.ja]={...r,due:r.kind==='got'?Math.max(8,items.length*3):0};}}
function setSource(next,{keepMode=true}={}){
  stop();source=next;current=0;turn=0;sessionReads=0;items=mode==='vocab'?parseVocabulary(source.text):parseSentences(source.text);normaliseDue();
  $('saveSharedMaterial').hidden=source!==sharedSource;
  if(mode==='speech')$('paragraph').value=items.map(x=>x.ja).join('');
  $('sourceName').textContent=source.name;$('itemCount').textContent=`${items.length} ${mode==='vocab'?'words':'sentences'}`;render();renderDecks();renderWords();refreshMixer();persist();
}
let hintEpoch=0;const hintCache=new Map();
async function automaticHints(){const epoch=++hintEpoch,item=items[current];if(!item)return;const text=item.ja;const cached=hintCache.get(text)||{};const valid=()=>epoch===hintEpoch&&items[current]?.ja===text;try{if($('hints').checked&&!item.reading){const reading=cached.reading||await toRomaji(text);cached.reading=reading;if(valid())$('reading').textContent=reading;}if(!valid())return;if($('englishHints').checked&&!item.meaning){if(valid())$('languageStatus').textContent='Preparing English hint…';const meaning=cached.meaning||await toEnglish(text,message=>{if(valid())$('languageStatus').textContent=message;},$('allowModelDownload').checked);cached.meaning=meaning;if(valid()){$('meaning').textContent=meaning;$('languageStatus').textContent='Machine suggestion: check the meaning.';}}hintCache.set(text,cached);}catch(error){if(valid())$('languageStatus').textContent=error.message;}}
function render(){
  const item=items[current];$('practiceText').textContent=item?.ja||'日本語を追加しましょう';$('practiceText').classList.toggle('paragraph',mode==='speech');$('reading').textContent=item?.reading||'';$('meaning').textContent=item?.meaning||(item?'':'Add your Japanese material to begin.');
  $('position').textContent=items.length?`${String(current+1).padStart(2,'0')} / ${String(items.length).padStart(2,'0')}`:'00 / 00';
  $('modePill').textContent=mode==='vocab'?'YOUR LISTENING SPACE':'ONE FAMILIAR SENTENCE AT A TIME';
  $('practiceTurn').classList.toggle('speech-turn',mode==='speech');$('speechTools').classList.toggle('hidden',mode!=='speech');
  $('previous').disabled=$('next').disabled=!items.length;
  $('reveal').classList.toggle('hidden',mode==='speech');updateHints();updatePlay();automaticHints();
}
function updateHints(){const visible=$('hints').checked;for(const id of ['reading'])$(id).classList.toggle('hint-hidden',!visible);$('meaning').classList.toggle('hint-hidden',!$('englishHints').checked);$('reveal').textContent=visible?'◉ Hide romaji':'◉ Show romaji';$('reveal').setAttribute('aria-pressed',String(visible));}
function updatePlay(){
  if(feedbackState){
    $('play').textContent=feedbackState==='prompt'?'Waiting for rating':'Rating saved';
  }else{
    const icon=node('span','',running?'Ⅱ':'▶');icon.setAttribute('aria-hidden','true');
    $('play').replaceChildren(icon,document.createTextNode(running?'Pause':paused?'Continue listening':'Start listening'));
  }
  $('play').disabled=!voices.length||!items.length;$('play').setAttribute('aria-disabled',String(!!feedbackState||$('play').disabled));
  $('resetPractice').disabled=!items.length;
}
function interrupt(){generation++;if(cancelPending){const fn=cancelPending;cancelPending=null;fn();}if('speechSynthesis'in window&&(speechSynthesis.speaking||speechSynthesis.pending))speechSynthesis.cancel();}
function stop(){interrupt();running=false;paused=false;setFeedback('');setStatus('Ready when you are');}
function pause(){interrupt();running=false;paused=true;setStatus('Paused · continue to replay this item');updatePlay();}
function wait(ms,token){return new Promise(resolve=>{if(token!==generation){resolve(false);return;}const timer=setTimeout(()=>{if(cancelPending===cancel)cancelPending=null;resolve(token===generation);},ms);const cancel=()=>{clearTimeout(timer);resolve(false);};cancelPending=cancel;});}
function setFeedback(state){
  feedbackState=state;
  $('practiceTurn').dataset.feedback=state;
  $('feedback').inert=state!=='prompt';
  $('flashcardFront').inert=state==='got'||state==='forgot';
  if(!state)$('ratingStatus').textContent='';
  updatePlay();
}
function waitForRating(){
  return new Promise(resolve=>{
    const finish=kind=>{respondToRating=null;cancelPending=null;resolve(kind);};
    respondToRating=finish;
    cancelPending=()=>finish(null);
    setFeedback('prompt');
    setStatus('Your turn · rate this word');
    if(document.activeElement===$('play'))$('forgot').focus({preventScroll:true});
  });
}
function say(text,token){
  return new Promise((resolve,reject)=>{
    if(token!==generation){resolve(false);return;}
    const u=new SpeechSynthesisUtterance(text);u.lang='ja-JP';u.voice=voices[Number($('voice').value)]||voices[0];u.rate=Number($('speed').value);u.pitch=1;u.volume=1;
    let done=false;const finish=(ok,error)=>{if(done)return;done=true;clearTimeout(watchdog);if(cancelPending===cancel)cancelPending=null;if(error)reject(error);else resolve(ok);};
    const cancel=()=>finish(false);cancelPending=cancel;
    const watchdog=setTimeout(()=>{speechSynthesis.cancel();finish(false,new Error('The Japanese voice stopped responding. Try another voice, then press Start listening.'));},Math.max(30000,text.length*650/u.rate));
    u.onstart=()=>{if(token===generation)setStatus(`Listening · repeat ${activeRepeat} of ${$('repeats').value}`,true);};u.onend=()=>finish(token===generation);u.onerror=e=>{if(token!==generation||['canceled','interrupted'].includes(e.error))finish(false);else finish(false,new Error('The Japanese voice could not play. Check your device’s audio and try another Japanese voice.'));};
    speechSynthesis.speak(u);
  });
}
let activeRepeat=1;
async function start(){
  if(feedbackState)return;
  if(running){pause();return;}
  if(!voices.length){toast('Install or select a Japanese voice before listening.');return;}
  if(!items.length){openEditor('type');return;}
  const resume=paused;interrupt();const token=generation;running=true;paused=false;sessionReads=resume?sessionReads:0;updatePlay();
  try{
    if(!resume){for(let seconds=Number($('delay').value);seconds>0;seconds--){setStatus(`Get comfortable · starting in ${seconds}…`);if(!await wait(1000,token))return;}}
    while(token===generation&&running){
      const text=items[current].ja;
      // Exact slices prevent long-utterance truncation without inventing text.
      const chunks=[text]; // Preserve the full sentence’s natural prosody.
      for(activeRepeat=1;activeRepeat<=Number($('repeats').value);activeRepeat++){
        setStatus(`Listening · repeat ${activeRepeat} of ${$('repeats').value}`,true);
        for(const chunk of chunks){if(!await say(chunk,token))return;}
        if(activeRepeat<Number($('repeats').value)){setStatus('Your turn · say it out loud');if(!await wait(Number($('gap').value)*1000,token))return;}
      }
      sessionReads++;
      if(mode==='vocab'){
        const kind=await waitForRating();
        if(!kind||token!==generation)return;
        const ja=items[current].ja;
        ratings[ja]=reviewRating(ratings[ja],kind,turn,items.length);previewRatings[ja]=ratings[ja];
        renderWords();persist();
        const hadRatingFocus=$('flashcardFront').contains(document.activeElement);
        $('ratingIcon').textContent=kind==='got'?'✓':'↺';
        $('ratingDetail').textContent=kind==='got'?'Marked as familiar':'Marked to revisit';
        $('ratingStatus').textContent='Got it! '+$('ratingDetail').textContent+'.';
        setFeedback(kind);
        if(hadRatingFocus)$('play').focus({preventScroll:true});
        if(!await wait(Math.max(700,Number($('gap').value)*1000),token))return;
        const complete=!$('loop').checked&&sessionReads>=items.length;
        if(!complete){advance($('loop').checked);setStatus('Next word');}
        setFeedback('');
        if(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches&&!await wait(280,token))return;
        if(complete){completePractice();return;}
      }else{
        if(!$('loop').checked&&sessionReads>=items.length){completePractice();return;}
        setStatus('Your turn · try the sentence aloud');if(!await wait(Number($('gap').value)*1000,token))return;
        advance();if(!await wait(30,token))return;
      }
    }
  }catch(error){if(token===generation){stop();setStatus('Audio needs a little attention');toast(error.message);}}
}
function completePractice(){running=false;paused=false;setStatus('Lovely work · practice complete');updatePlay();}
function advance(adaptive=false){
  if(!items.length)return;
  turn++;current=adaptive&&mode==='vocab'?chooseNext(items,previewRatings,current,turn):(current+1)%items.length;render();renderWords();persist();
}
function navigate(delta){if(!items.length)return;const was=running;stop();current=(current+delta+items.length)%items.length;render();renderWords();persist();if(was)start();}
function resetPractice(){
  stop();current=0;turn=0;sessionReads=0;normaliseDue();
  render();renderWords();persist();
  setStatus('Practice reset · back to the first item');
}
function renderWords(){
  const q=$('wordSearch').value.toLowerCase();const list=$('wordList');list.replaceChildren();
  items.forEach((item,i)=>{if(!`${item.ja} ${item.reading} ${item.meaning}`.toLowerCase().includes(q))return;
    const row=node('div','word-row'+(i===current?' current':''));const rating=ratings[item.ja]?.kind;
    row.append(node('span','word-index',String(i+1).padStart(2,'0')),node('span','word-ja',item.ja),node('span','word-hint',$('hints').checked?item.reading:''),node('span','word-rating'+(rating==='forgot'?' forgot':''),rating==='got'?'✓ Familiar':rating==='forgot'?'↺ Revisiting':'New to you'));
    row.querySelector('.word-ja').lang='ja';const b=node('button','word-play','▶');b.setAttribute('aria-label',`Listen to ${item.ja}`);b.onclick=()=>{
      stop();current=i;render();renderWords();
      $('practiceTurn').closest('.practice-card').scrollIntoView?.({block:'nearest'});
      $('play').focus({preventScroll:true});start();
    };row.append(b);list.append(row);
  });
  if(!list.children.length)list.append(node('div','empty-state','No matching words. Try another search.'));
}
function renderDecks(){
  $('decks').replaceChildren(...packs.map(pack=>{const b=node('button','deck'+(source.id===pack.id?' selected':''));b.append(node('span','deck-illustration',pack.art.length>3?'こ':pack.art),node('h3','',pack.short),node('p','',pack.subtitle),node('span','deck-arrow','↗'));b.setAttribute('aria-pressed',String(source.id===pack.id));b.onclick=()=>{setSource(pack);$('wordSearch').value='';renderWords();toast(`${pack.short} is ready. Your listening settings stay with you.`);};return b;}));
}
function showView(next){stop();view=next;const studio=['vocab','speech'].includes(next);$('studioView').classList.toggle('hidden',!studio);$('materialsView').classList.toggle('hidden',next!=='materials');$('guideView').classList.toggle('hidden',next!=='guide');document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view===(studio?'vocab':next)));if(next==='materials')renderMaterials();}
function setMode(next){const sentenceDraft=$('paragraph').value;stop();mode=next;document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.mode===next)));setSource(source);if(next==='speech'&&sentenceDraft)$('paragraph').value=sentenceDraft;if(next==='speech'&&!$('swapRows').children.length)addSwap();refreshMixer();}
function renderMaterials(){
  $('materialCount').textContent=String(materials.length);const list=$('materialsList');list.replaceChildren();
  if(!materials.length){const e=node('div','empty-state');e.append(node('p','','Your classroom belongs here.'),node('p','small','Add your first notes, vocabulary list or paragraph to make it yours.'));list.append(e);}
  for(const material of materials){const card=node('article','material-card');const info=node('div');info.append(node('h3','',material.name),node('p','',`${parseVocabulary(material.text).length} items · saved in this browser`));const actions=node('div','material-actions');const use=node('button','secondary-button','Practise ↗');use.onclick=()=>{showView('vocab');setSource(material);};const edit=node('button','text-button','Edit');edit.onclick=()=>openEditor('type',material);const share=node('button','text-button','Share');share.onclick=()=>openShare(material);const del=node('button','text-button danger','Remove');del.onclick=()=>{const index=materials.indexOf(material);deleted[material.id]=Date.now();materials.splice(index,1);if(source.id===material.id)setSource(packs[0]);renderMaterials();persist();toast('Material removed from this browser.');};actions.append(use,edit,share,del);card.append(info,actions);list.append(card);}
}
function downloadPractice(data,filename) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link=node('a');link.href=url;link.download=filename;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
let shareRequest=0;
async function openShare(material) {
  const request=++shareRequest;
  const pageUrl=document.querySelector('link[rel="canonical"]').href;
  $('shareMaterialTitle').textContent=material.name;
  $('shareLink').value='';
  $('copyShareLink').disabled=true;
  $('shareMessage').textContent='Preparing the link…';
  $('shareDialog').showModal();
  try{
    const url=await makeMaterialLink(material,pageUrl);
    if(request!==shareRequest)return;
    $('shareLink').value=url;
    $('copyShareLink').disabled=false;
    $('shareMessage').textContent='';
  }catch{
    if(request===shareRequest)$('shareMessage').textContent='The link could not be prepared. Close this window and try again.';
  }
}
async function loadSharedMaterial() {
  const hash=window.location?.hash||'';
  if(!isMaterialLink(hash))return;
  try{
    const incoming=await readMaterialLink(hash);
    if(window.location.hash!==hash)return;
    const existing=materials.find(item=>item.name===incoming.name&&item.text===incoming.text);
    sharedSource=existing?null:{...incoming,id:crypto.randomUUID(),updatedAt:Date.now()};
    source=existing||sharedSource;
    showView('vocab');setMode('vocab');
    toast('Shared material is ready to practise.');
  }catch{
    if(window.location.hash===hash)toast('This material link is incomplete or invalid. Ask your teacher for a new link.');
  }
}
function saveSharedMaterial() {
  if(!sharedSource||source!==sharedSource)return;
  if(materials.length>=50){
    toast('You have 50 practices. Remove one before saving this material.');
    return;
  }
  materials.push(sharedSource);
  sharedSource=null;
  $('saveSharedMaterial').hidden=true;
  renderMaterials();persist();
  toast('Saved to My material.');
}
function setImportTab(tab){$('uploadArea').classList.toggle('hidden',tab==='type');$('uploadTab').classList.toggle('active',tab==='upload');$('typeTab').classList.toggle('active',tab==='type');}
function openEditor(tab='upload',material=null){stop();editingId=material&&materials.includes(material)?material.id:null;attached=[];importedRatings=null;if(material){$('materialTitle').value=material.name;$('materialText').value=material.text;}$('importError').textContent='';$('importStatus').replaceChildren();$('files').value='';setImportTab(tab);$('importDialog').showModal();}
async function readFiles(files){
  if(importBusy)return;importBusy=true;$('saveMaterial').disabled=true;$('files').disabled=true;$('importError').textContent='';
  const context={files:0,total:0};
  try{for(const file of [...files].slice(0,60)){
    const row=node('div','import-file',`Reading ${file.name}…`);$('importStatus').append(row);
    try{const result=await importFile(file,message=>{row.textContent=`${file.name} · ${message}`;},context);
      if(result.text){if(($('materialText').value+result.text).length>200000)throw new Error('Use a smaller collection below 200,000 characters.');$('materialText').value+=($('materialText').value?'\n\n':'')+result.text;}
      if(result.attachment)attached.push(file.name);if(result.ratings)importedRatings=result.ratings;
      if(!$('materialTitle').value)$('materialTitle').value=result.title||file.name.replace(/\.[^.]+$/u,'').slice(0,100);
      row.textContent=`${file.name} · ${result.text?'Text ready to review.':result.attachment?'Reference attached for this session.':'No readable text found. Try pasting it below.'} ${result.warnings.join(' ')}`;row.classList.toggle('warning',!!result.warnings.length||!result.text);
    }catch(error){row.textContent=`${file.name} · ${error.message||'Could not read this file. Try a PDF/DOCX export or paste the text.'}`;row.classList.add('warning');}
  }}finally{importBusy=false;$('saveMaterial').disabled=false;$('files').disabled=false;persist();}
}
function saveMaterial(){
  const text=$('materialText').value.trim(),name=$('materialTitle').value.trim()||'My Japanese practice';
  if(!parseVocabulary(text).length){$('importError').textContent=attached.length?'Your ONEPKG is attached, but it needs readable text. Paste Japanese below or add its PDF/DOCX export.':'Add at least one Japanese word or sentence. Put Japanese before any optional | reading | meaning hints.';return;}
  if(text.length>200000){$('importError').textContent='Use a smaller section below 200,000 characters.';return;}
  const material={id:editingId||crypto.randomUUID(),name:name.slice(0,100),text,updatedAt:Date.now()};const index=materials.findIndex(x=>x.id===material.id);
  if(index<0&&materials.length>=50){$('importError').textContent='You have 50 practices. Export or remove one before adding another.';return;}
  if(index>=0)materials[index]=material;else materials.push(material);
  if(importedRatings){for(const [ja,r] of Object.entries(importedRatings)){if(hasJapanese(ja)&&['got','forgot'].includes(r?.kind))ratings[ja]=reviewRating(null,r.kind,0,1);}}
  $('importDialog').close();showView(mode);setSource(material);renderMaterials();toast('Your material is ready. Only your Japanese text will be read.');
}
function exportCurrent(){
  const data={format:'kotoba-club-v1',name:$('sourceName').textContent,text:mode==='speech'?items.map(x=>x.ja).join('\n'):source.text,ratings:Object.fromEntries(parseVocabulary(source.text).map(x=>[x.ja,ratings[x.ja]]).filter(x=>x[1]))};
  downloadPractice(data,'hedgehogs-comet-practice.json');toast('Practice exported. Import the JSON file to restore it later.');
}
function invalidateMixer(){if($('variations').children.length){$('variations').replaceChildren();$('variationMessage').textContent='Your sentence or choices changed. Preview again to see the new results.';}}
function addSwap(from='',to=''){invalidateMixer();
  const row=node('div','swap-row');const a=node('input');a.placeholder='Original word';a.value=from;a.lang='ja';a.setAttribute('aria-label','Exact original word');const b=node('input');b.placeholder='Alternatives, comma separated';b.value=to;b.lang='ja';b.setAttribute('aria-label','Approved replacement words');const kind=node('select');kind.setAttribute('aria-label','Replacement part of speech');for(const text of ['Noun','Verb','Adjective','Other'])kind.append(new Option(text,text));const remove=node('button','','×');remove.setAttribute('aria-label','Remove replacement row');remove.onclick=()=>{invalidateMixer();row.remove();activeSwap=Math.max(0,activeSwap-1);refreshMixer();persist();};a.oninput=b.oninput=()=>{invalidateMixer();refreshReferenceWords();persist();};a.onfocus=b.onfocus=()=>{activeSwap=[...$('swapRows').children].indexOf(row);refreshReferenceWords();};row.append(a,b,kind,remove);$('swapRows').append(row);activeSwap=$('swapRows').children.length-1;refreshReferenceWords();
}
function generate(){
  stop();$('variationMessage').textContent='';$('variations').replaceChildren();
  try{const rules=[...$('swapRows').children].map(row=>({from:row.children[0].value,to:row.children[1].value}));const original=$('paragraph').value.trim();const variants=createVariations(original,rules,source.text+'\n'+$('wordBank').value+'\n'+rules.map(r=>r.to).join('\n'));
    if(!variants.length)throw new Error('Those replacements produced no new variations. Choose a different word.');
    const all=[original,...variants];$('variationMessage').textContent=`${variants.length} variations ready to review (up to 12). Check meaning and word forms before listening.`;
    for(const [i,text] of all.entries()){const card=node('div','variation');const label=node('span','small muted',i===0?'YOUR ORIGINAL':`VARIATION ${i}`);const p=node('p','',text);p.lang='ja';if(i>0){let left=0,right=0;while(left<original.length&&left<text.length&&original[left]===text[left])left++;while(right<original.length-left&&right<text.length-left&&original[original.length-1-right]===text[text.length-1-right])right++;p.replaceChildren(document.createTextNode(text.slice(0,left)),node('mark','',text.slice(left,right?text.length-right:undefined)),document.createTextNode(right?text.slice(-right):''));}const use=node('button','text-button','Load for listening ↗');use.onclick=()=>{stop();items=parseSentences(text);current=0;sessionReads=0;render();renderWords();$('itemCount').textContent=`${items.length} sentences`;$('sourceName').textContent=i===0?'Your original paragraph':`Reviewed variation ${i}`;setStatus('Reviewed paragraph ready');persist();$('practiceText').scrollIntoView?.({behavior:'smooth',block:'center'});toast('Sentence loaded above. Press Start listening when ready.');};card.append(label,p,use);$('variations').append(card);}
    persist();
  }catch(error){$('variationMessage').textContent=error.message;}
}
function updateSettings(){for(const [id,[min,max,def]]of Object.entries(settingsFields))$(id).value=clamp($(id).value,min,max,def);$('speedOut').textContent=`${Number($('speed').value).toFixed(2).replace(/0$/,'')}×`;$('delayOut').textContent=`${$('delay').value} sec`;$('gapOut').textContent=`${$('gap').value} sec`;$('repeatLabel').textContent=`Repeat each ${mode==='vocab'?'word':'sentence'} ${$('repeats').value}×`;updateHints();automaticHints();renderWords();persist();}
document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>showView(b.dataset.view));document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{setMode(b.dataset.mode);updateSettings();});
document.querySelector('.brand').onclick=e=>{e.preventDefault();showView('vocab');};
$('play').onclick=start;$('previous').onclick=()=>navigate(-1);$('next').onclick=()=>navigate(1);
$('got').onclick=()=>respondToRating?.('got');$('forgot').onclick=()=>respondToRating?.('forgot');
$('resetPractice').onclick=()=>$('resetDialog').showModal();
$('cancelReset').onclick=()=>$('resetDialog').close();
$('confirmReset').onclick=()=>{$('resetDialog').close();resetPractice();};
$('reveal').onclick=()=>{$('hints').checked=!$('hints').checked;updateSettings();};
for(const id of [...Object.keys(settingsFields),'hints','loop','englishHints','allowModelDownload'])$(id).addEventListener('input',updateSettings);
$('voice').onchange=()=>{selectedVoice=voices[Number($('voice').value)]?.voiceURI||'';if(running)pause();persist();};
$('repeatMinus').onclick=()=>{$('repeats').value=Math.max(1,Number($('repeats').value)-1);updateSettings();};$('repeatPlus').onclick=()=>{$('repeats').value=Math.min(10,Number($('repeats').value)+1);updateSettings();};
$('wordSearch').oninput=renderWords;for(const id of ['openImport','materialsImport'])$(id).onclick=()=>openEditor();$('openManual').onclick=()=>openEditor('type');$('editSource').onclick=()=>openEditor('type',source);
$('closeDialog').onclick=()=>{if(importBusy){toast('Please wait for this import to finish.');return;}$('importDialog').close();};$('importDialog').addEventListener('cancel',e=>{if(importBusy)e.preventDefault();});
$('uploadTab').onclick=()=>setImportTab('upload');$('typeTab').onclick=()=>{setImportTab('type');$('materialText').focus();};$('saveMaterial').onclick=saveMaterial;$('files').onchange=e=>readFiles(e.target.files);$('exportPractice').onclick=exportCurrent;
$('copyShareLink').onclick=async()=>{
  const field=$('shareLink');
  try{await navigator.clipboard.writeText(field.value);$('shareMessage').textContent='Link copied.';}
  catch{field.focus();field.select();$('shareMessage').textContent='Copy the selected link to share it.';}
};
$('closeShareDialog').onclick=()=>$('shareDialog').close();
$('saveSharedMaterial').onclick=saveSharedMaterial;
window.addEventListener('hashchange',loadSharedMaterial);
for(const event of ['dragenter','dragover'])$('dropzone').addEventListener(event,e=>{e.preventDefault();$('dropzone').classList.add('dragover');});for(const event of ['dragleave','drop'])$('dropzone').addEventListener(event,e=>{e.preventDefault();$('dropzone').classList.remove('dragover');});$('dropzone').addEventListener('drop',e=>readFiles(e.dataTransfer.files));
$('addSwap').onclick=()=>addSwap('','');$('generate').onclick=generate;$('paragraph').onchange=()=>{refreshMixer();persist();};$('wordBank').onchange=persist;
$('useParagraph').onclick=()=>{const parsed=parseSentences($('paragraph').value);if(!parsed.length){toast('Add a Japanese paragraph first.');return;}stop();items=parsed;current=0;sessionReads=0;render();renderWords();$('itemCount').textContent=`${items.length} sentences`;$('sourceName').textContent='Your original paragraph';setStatus('Your paragraph is ready');persist();toast('Your paragraph is loaded. Press Start listening.');};
document.addEventListener('keydown',e=>{
  if(e.altKey||e.ctrlKey||e.metaKey||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.target.isContentEditable||document.querySelector('dialog[open]')||!['vocab','speech'].includes(view))return;
  if(respondToRating&&!e.repeat&&['1','2'].includes(e.key)){e.preventDefault();respondToRating(e.key==='1'?'forgot':'got');return;}
  if(['BUTTON','A'].includes(e.target.tagName))return;
  if(e.code==='Space'){e.preventDefault();start();}
  if(e.key==='ArrowRight'){e.preventDefault();navigate(1);}
});
window.addEventListener('pagehide',stop);if('speechSynthesis'in window)speechSynthesis.addEventListener('voiceschanged',voiceOptions);

function refreshReferenceWords(){
 const ref=materials.find(x=>x.id===$('referencePicker').value)||source;
 const query=$('referenceSearch').value.toLowerCase();const list=$('referenceWords');list.replaceChildren();
 const row=$('swapRows').children[activeSwap];$('activeSwapHint').textContent=row?'Adding choices for: '+(row.children[0].value||'the selected row'):'Choose a word in step 2 first.';
 let words=parseVocabulary(ref.text).filter(x=>(x.ja+' '+x.meaning).toLowerCase().includes(query));
 for(const word of words.slice(0,80)){const button=node('button','word-chip',word.ja+(word.meaning?' · '+word.meaning:''));button.disabled=!row;button.onclick=()=>{const choices=row.children[1].value.split(/[,，、]/u).map(x=>x.trim()).filter(Boolean);if(!choices.includes(word.ja))choices.push(word.ja);row.children[1].value=choices.join(', ');invalidateMixer();persist();toast('Added '+word.ja+' as a replacement choice.');};list.append(button);}
 if(!words.length)list.append(node('p','small muted','No matching words. Try a different reference or type your choices in the row.'));
}
function refreshMixer(){
 const old=$('referencePicker').value;$('referencePicker').replaceChildren(new Option(source.name+' · current material',source.id),...materials.filter(x=>x.id!==source.id).map(x=>new Option(x.name,x.id)));if(materials.some(x=>x.id===old))$('referencePicker').value=old;
 const selected=$('sentencePicker').value;$('sentencePicker').replaceChildren(new Option('Choose a sentence…',''),...parseSentences(source.text).map(x=>new Option(x.ja,x.ja)));$('sentencePicker').value=selected;
 $('originalWords').replaceChildren();const text=$('paragraph').value;const segments=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('ja',{granularity:'word'}).segment(text)].filter(x=>x.isWordLike).map(x=>x.segment):[];
 for(const word of [...new Set(segments)].slice(0,40)){const button=node('button','word-chip',word);button.onclick=()=>{let row=$('swapRows').children[activeSwap];if(!row||row.children[0].value){addSwap(word,'');}else row.children[0].value=word;refreshReferenceWords();persist();};$('originalWords').append(button);}
 refreshReferenceWords();
}
$('sentencePicker').onchange=()=>{if($('sentencePicker').value){$('paragraph').value=$('sentencePicker').value;invalidateMixer();refreshMixer();persist();}};
$('referencePicker').onchange=()=>{refreshReferenceWords();persist();};$('referenceSearch').oninput=refreshReferenceWords;
$('paragraph').addEventListener('input',()=>{invalidateMixer();refreshMixer();});
$('useSelection').onclick=()=>{const field=$('paragraph'),word=field.value.slice(field.selectionStart,field.selectionEnd).trim();if(!word){toast('Select a word in the sentence first, or click a word chip.');return;}addSwap(word,'');persist();};
$('mixerExample').onclick=()=>{$('paragraph').value='わたしはりんごをたべます。';$('swapRows').replaceChildren();addSwap('りんご','ぱん, ばなな');refreshMixer();persist();$('variationMessage').textContent='Example ready: replace りんご with ぱん or ばなな. Choose Preview my new sentences.';};

restoring=true;setSource(source);restoring=false;applyState(saved);voiceOptions();setTimeout(voiceOptions,1000);setTimeout(voiceOptions,3000);
loadSharedMaterial();
let draftTimer;for(const id of ['materialTitle','materialText','paragraph','wordBank','swapRows'])$(id).addEventListener('input',()=>{clearTimeout(draftTimer);draftTimer=setTimeout(persist,400);});
startEnhancements({snapshot,apply:state=>{const merged=JSON.stringify(state);if(merged!==JSON.stringify(snapshot()))applyState(state);},save:persist,currentText:()=>mode==='speech'?$('paragraph').value:items[current]?.ja||'',changeAccount:uid=>{stop();activeStorageKey=uid?'kotoba-club-user-'+uid:KEY;try{return JSON.parse(localStorage.getItem(activeStorageKey)||'{}');}catch{return {};}}}).then(adapter=>{syncAdapter=adapter;});
