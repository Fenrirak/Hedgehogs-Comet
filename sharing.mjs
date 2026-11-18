import {parseVocabulary} from './core.mjs';

const prefix = '#material=';
const textLimit = 200000;
// JSON control characters and lone surrogates can take six bytes each.
const byteLimit = 6 * (textLimit + 100) + 128;

function encode(bytes) {
  let binary='';
  for(let offset=0;offset<bytes.length;offset+=8192){
    binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
  }
  return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/u,'');
}

export async function makeMaterialLink({name,text},pageUrl) {
  const plain = new TextEncoder().encode(JSON.stringify({name,text}));
  let bytes=plain, encoding='1';
  if(typeof CompressionStream!=='undefined'){
    const stream=new Blob([plain]).stream().pipeThrough(new CompressionStream('gzip'));
    const zipped=new Uint8Array(await new Response(stream).arrayBuffer());
    if(zipped.length<plain.length){bytes=zipped;encoding='2';}
  }
  const url=new URL(pageUrl);
  url.hash=prefix+encoding+'.'+encode(bytes);
  return url.href;
}

async function readText(stream) {
  const reader=stream.getReader();
  const decoder=new TextDecoder('utf-8',{fatal:true});
  let size=0,text='';
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done)return text+decoder.decode();
      size+=value.length;
      if(size>byteLimit)throw new Error('Material exceeds the text limit');
      text+=decoder.decode(value,{stream:true});
    }
  }finally{await reader.cancel();}
}

export function isMaterialLink(hash) {
  return hash.startsWith(prefix);
}

export async function readMaterialLink(hash) {
  const encoded=hash.slice(prefix.length);
  if (!isMaterialLink(hash) || encoded.length>Math.ceil(byteLimit*4/3)+2 ||
      !/^[12]\.[A-Za-z0-9_-]+$/u.test(encoded)) {
    throw new Error('Invalid material link');
  }
  const binary = atob(encoded.slice(2).replaceAll('-','+').replaceAll('_','/'));
  const bytes = Uint8Array.from(binary,character=>character.charCodeAt(0));
  const stream=new Blob([bytes]).stream();
  const decoded=encoded[0]==='2'?stream.pipeThrough(new DecompressionStream('gzip')):stream;
  const data=JSON.parse(await readText(decoded));
  if (typeof data?.name!=='string' || !data.name.trim() || data.name.length>100 ||
      typeof data.text!=='string' || data.text.length>textLimit || !parseVocabulary(data.text).length) {
    throw new Error('Invalid material link');
  }
  return {name:data.name,text:data.text};
}
