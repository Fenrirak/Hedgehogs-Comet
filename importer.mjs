import {recogniseHandwriting} from './handwriting.mjs';
import {readNotebook} from './onenote.mjs';
const MAX=20*1024*1024, EXPANDED=80*1024*1024, TEXT_LIMIT=200000;
const scripts=new Map();let pdfModule,ocrWorker;
function script(url,global){
  if(window[global])return Promise.resolve(window[global]);
  if(!scripts.has(url))scripts.set(url,new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.onload=()=>resolve(window[global]);s.onerror=()=>{scripts.delete(url);s.remove();reject(new Error('The document reader could not load. Check your internet connection or paste your text.'));};document.head.append(s);}));
  return scripts.get(url);
}
async function recognise(image,progress){
  const T=await script('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js','Tesseract');
  if(!ocrWorker){try{ocrWorker=await T.createWorker('jpn+eng',1,{logger:m=>{if(m.status==='recognizing text')progress(`Recognising Japanese text… ${Math.round((m.progress||0)*100)}%`);}});}catch(e){ocrWorker=null;throw new Error('Text recognition could not start. Check your connection, or paste the Japanese text.');}}
  const result=await ocrWorker.recognize(image);return result.data.text;
}
export async function importFile(file,progress=()=>{},context={files:0,total:0},depth=0){
  if(file.size>MAX)throw new Error('This file is over 20 MB. Try a smaller section.');
  context.files++;context.total+=file.size;
  if(context.files>60||context.total>EXPANDED)throw new Error('This collection exceeds 60 files or 80 MB. Import a smaller section.');
  const ext=file.name.split('.').pop().toLowerCase();
  let text='',warnings=[];
  progress(`Reading ${file.name}…`);
  if(['onepkg','one'].includes(ext))return readNotebook(file,progress);
  if(['md','txt'].includes(ext))text=await file.text();
  else if(ext==='json'){
    const data=JSON.parse(await file.text());
    if(data.format!=='kotoba-club-v1'||typeof data.text!=='string')throw new Error('Use a Hedgehog’s Comet practice export.');
    return {text:data.text.slice(0,TEXT_LIMIT),title:typeof data.name==='string'?data.name:'Imported practice',warnings:[],ratings:data.ratings&&typeof data.ratings==='object'?data.ratings:undefined};
  }
  else if(['png','jpg','jpeg'].includes(ext)){
    const bmp=await createImageBitmap(file);
    if(bmp.width*bmp.height>24000000){bmp.close();throw new Error('This image is too large to recognise safely. Resize it below 24 megapixels.');}
    bmp.close();text=document.getElementById('handwritingMode')?.checked?await recogniseHandwriting(file,progress):await recognise(file,progress);warnings.push('Photo text recognised. Check kana, kanji, punctuation and line order against your original.');
  }
  else if(['zip','docx'].includes(ext)){
    const ZIP=await script('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js','JSZip');
    const zip=await ZIP.loadAsync(file);const entries=Object.values(zip.files).filter(e=>!e.dir);
    if(entries.length>400)throw new Error('This archive has too many entries. Use a smaller collection.');
    if(entries.reduce((n,e)=>n+(e._data?.uncompressedSize||0),0)>EXPANDED)throw new Error('The expanded archive is over 80 MB.');
    if(ext==='docx'){
      const entry=zip.file('word/document.xml');if(!entry)throw new Error('This does not look like a readable DOCX document.');
      const xml=new DOMParser().parseFromString(await entry.async('string'),'application/xml');
      if(xml.querySelector('parsererror'))throw new Error('This DOCX contains invalid text data.');
      text=Array.from(xml.getElementsByTagNameNS('*','p')).map(p=>Array.from(p.getElementsByTagNameNS('*','t')).map(t=>t.textContent).join('')).join('\n');
      warnings.push('Document text extracted. Pictures and handwriting in DOCX are not recognised; export those pages to PDF or images.');
    }else{
      if(depth>0)throw new Error('Nested ZIP files are skipped. Upload their contents separately.');
      const supported=entries.filter(e=>/\.(png|jpe?g|md|txt|pdf|docx|onepkg|one)$/i.test(e.name)&&!e.name.startsWith('__MACOSX/'));
      if(supported.length>60)throw new Error('Use a ZIP with at most 60 supported files.');
      const chunks=[];
      for(const e of supported){
        try{const blob=await e.async('blob');const child=new File([blob],e.name.split('/').pop());const result=await importFile(child,progress,context,depth+1);if(result.text)chunks.push(result.text);warnings.push(...result.warnings.map(w=>`${child.name}: ${w}`));}
        catch(err){warnings.push(`${e.name}: ${err.message}`);}
        if(chunks.join('\n').length>TEXT_LIMIT)throw new Error('This collection contains too much text. Import fewer files.');
      }
      if(entries.some(e=>/\.zip$/i.test(e.name)))warnings.push('Nested ZIP files were skipped.');
      if(entries.length>supported.length)warnings.push('Only supported learning documents were extracted.');
      text=chunks.join('\n\n');
    }
  }
  else if(ext==='pdf'){
    if(!pdfModule){pdfModule=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');pdfModule.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';}
    const pdf=await pdfModule.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,cMapUrl:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/cmaps/',cMapPacked:true,standardFontDataUrl:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/standard_fonts/'}).promise;
    try{
      if(pdf.numPages>200)throw new Error('Use a PDF section of 200 pages or fewer.');
      const pages=[];
      for(let i=1;i<=pdf.numPages;i++){
        progress(`Reading PDF page ${i} of ${pdf.numPages}…`);const page=await pdf.getPage(i);const content=await page.getTextContent();
        let value='',lastY;
        for(const item of content.items){if(typeof item.str!=='string')continue;const y=item.transform?.[5];if(lastY!==undefined&&Math.abs(lastY-y)>5)value+='\n';value+=item.str+(item.hasEOL?'\n':'');lastY=y;}
        if(!/[\u3040-\u30ff\u3400-\u9fff]/u.test(value)){
          const base=page.getViewport({scale:1});const scale=Math.min(2,Math.sqrt(4000000/(base.width*base.height)));const viewport=page.getViewport({scale});const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;value=await recognise(canvas,progress);canvas.width=0;canvas.height=0;warnings.push(`Page ${i} used text recognition; check it carefully.`);
        }
        pages.push(value);page.cleanup();if(pages.join('\n').length>TEXT_LIMIT)throw new Error('This PDF has too much text. Import a smaller section.');
      }
      text=pages.join('\n\n');
    }finally{await pdf.destroy();}
  }
  else throw new Error('Choose ZIP, PNG, JPG, JPEG, MD, PDF, ONEPKG, DOCX or TXT.');
  if(text.length>TEXT_LIMIT)throw new Error('Use a smaller section with fewer than 200,000 characters.');
  return {text,warnings};
}
