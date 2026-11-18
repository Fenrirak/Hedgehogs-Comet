let romajiReady,translatorWorker;
const pendingLanguageScripts=new Map();
function loadReadingScript(url){if(!pendingLanguageScripts.has(url))pendingLanguageScripts.set(url,new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.onload=resolve;s.onerror=()=>{pendingLanguageScripts.delete(url);reject(new Error('The reading dictionary could not load. Use the hosted site and check your connection.'));};document.head.append(s);}));return pendingLanguageScripts.get(url);}
export async function toRomaji(text){
  if(!text.trim())throw new Error('Enter Japanese first.');
  if(text.length>3000)throw new Error('Convert up to 3,000 characters at a time.');
  if(!romajiReady)romajiReady=(async()=>{
    await loadReadingScript('./vendor/romaji/kuroshiro.min.js');await loadReadingScript('./vendor/romaji/kuroshiro-analyzer-kuromoji.min.js');
    const K=window.Kuroshiro.default||window.Kuroshiro,A=window.KuromojiAnalyzer.default||window.KuromojiAnalyzer;
    const instance=new K();await instance.init(new A({dictPath:new URL('./vendor/romaji/dict/',document.baseURI).href}));return instance;
  })().catch(error=>{romajiReady=null;throw error;});
  return (await romajiReady).convert(text,{to:'romaji',mode:'spaced',romajiSystem:'hepburn'});
}
async function englishInternal(text,progress,allowDownload){
  if(!text.trim())throw new Error('Enter Japanese first.');
  if(text.length>3000)throw new Error('Translate up to 3,000 characters at a time.');
  if('Translator'in self){
    const availability=await self.Translator.availability({sourceLanguage:'ja',targetLanguage:'en'});
    if(availability!=='unavailable'){
      if(availability!=='available'&&!allowDownload)throw new Error('Allow the one-time model download to enable local translation.');
      const translator=await self.Translator.create({sourceLanguage:'ja',targetLanguage:'en',monitor(m){m.addEventListener('downloadprogress',e=>progress(`Downloading translation model… ${Math.round(e.loaded*100)}%`));}});
      try{return await translator.translate(text);}finally{translator.destroy();}
    }
  }
  if(!allowDownload)throw new Error('Enable the local model download below. It is free and can be around 110 MB of model weights, plus runtime files.');
  if(location.protocol==='file:')throw new Error('Local translation needs the hosted site or a local web server.');
  translatorWorker??=new Worker(new URL('./translation-worker.mjs',import.meta.url),{type:'module'});
  const worker=translatorWorker;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{worker.terminate();translatorWorker=null;reject(new Error('Translation took too long on this device. Try a shorter sentence.'));},600000);
    worker.onmessage=({data})=>{if(data.progress){progress(data.progress);return;}clearTimeout(timer);if(data.error)reject(new Error(data.error));else resolve(data.text);};
    worker.onerror=()=>{clearTimeout(timer);worker.terminate();translatorWorker=null;reject(new Error('The local translation model could not start. Check your connection or try a desktop browser.'));};worker.postMessage({text});
  });
}
export function cancelTranslation(){translatorWorker?.terminate();translatorWorker=null;}

let englishQueue=Promise.resolve();
export function toEnglish(...args){const task=englishQueue.then(()=>englishInternal(...args));englishQueue=task.catch(()=>{});return task;}
