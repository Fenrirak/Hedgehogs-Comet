export const STATE_LIMIT=12000000, CHUNK_SIZE=120000;
export function normaliseUsername(value){
  const name=String(value).trim().toLowerCase();
  if(!/^[a-z][a-z0-9_]{2,23}$/.test(name))throw new Error('Use 3–24 letters, numbers or underscores, starting with a letter.');
  return name;
}
export function mergeState(local={},remote={}){
  const newest=Number(local.updatedAt||0)>=Number(remote.updatedAt||0)?local:remote;
  const deleted={...remote.deleted};
  for(const [id,time]of Object.entries(local.deleted||{}))deleted[id]=Math.max(Number(time)||0,Number(deleted[id])||0);
  const materials=new Map();
  for(const item of [...(remote.materials||[]),...(local.materials||[])]){
    if(!item||typeof item.id!=='string'||typeof item.text!=='string')continue;
    if((deleted[item.id]||0)>=(item.updatedAt||1))continue;
    if(!materials.has(item.id)||(item.updatedAt||1)>=(materials.get(item.id).updatedAt||1))materials.set(item.id,item);
  }
  const ratings={...remote.ratings};
  for(const [word,rating]of Object.entries(local.ratings||{}))if((rating?.updatedAt||0)>=(ratings[word]?.updatedAt||0))ratings[word]=rating;
  return {...newest,materials:[...materials.values()],ratings,deleted,updatedAt:Math.max(Number(local.updatedAt)||0,Number(remote.updatedAt)||0)};
}
export function splitState(state){const raw=JSON.stringify(state);if(raw.length>STATE_LIMIT)throw new Error('Your cloud practice exceeds the sync limit. Export and remove unused material.');const parts=[];for(let start=0;start<raw.length;){
  let end=Math.min(start+CHUNK_SIZE,raw.length);
  if(end<raw.length&&/[\uD800-\uDBFF]/u.test(raw[end-1]))end--;
  parts.push(raw.slice(start,end));
  start=end;
}
if(parts.length>100)throw new Error('Your cloud practice exceeds the sync limit. Export and remove unused material.');return parts;}
