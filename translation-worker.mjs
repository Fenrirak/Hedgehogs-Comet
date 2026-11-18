let pipe;
self.onmessage=async({data:{text}})=>{
  try{
    self.postMessage({progress:'Loading the free translation model on your device…'});
    const {pipeline,env}=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
    env.allowLocalModels=false;env.backends.onnx.wasm.numThreads=1;
    pipe??=await pipeline('translation','Xenova/opus-mt-ja-en',{revision:'1a906cfaaf7c8f4193f67f5885c082aa6dbd9d16',dtype:'q8',device:'wasm',progress_callback:p=>{if(p.status==='progress')self.postMessage({progress:`Downloading ${p.file}… ${Math.round(p.progress||0)}%`});}});
    const pieces=text.match(/[^。！？!?\n]+[。！？!?]?/gu)||[text];const results=[];
    for(const sentence of pieces){
      if(sentence.length>200)throw new Error('A sentence exceeds 200 characters. Split it at natural sentence boundaries first.');
      self.postMessage({progress:`Translating part ${results.length+1} of ${pieces.length}…`});
      const output=await pipe(sentence,{max_new_tokens:256});results.push(output[0].translation_text);
    }
    self.postMessage({text:results.join('\n')});
  }catch(error){self.postMessage({error:error.message||'Translation failed. Try a shorter sentence.'});}
};
