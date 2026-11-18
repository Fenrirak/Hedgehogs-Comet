export const hasJapanese = text => /[\u3040-\u30ff\u3400-\u9fff]/u.test(text);
export const clamp = (value,min,max,fallback=min) => Number.isFinite(Number(value)) ? Math.min(max,Math.max(min,Number(value))) : fallback;
export function parseVocabulary(text){
  const seen = new Set();
  return text.split(/\r?\n/u).flatMap(line=>{
    line=line.trim().replace(/^#{1,6}\s+/u,'').replace(/^[-*+]\s+/u,'').replace(/^\d+[.)]\s+/u,'').replace(/^\|\s*|\s*\|$/gu,'');
    const parts=line.split(/\s*\|\s*|\t+/u).map(x=>x.trim().replace(/\*\*|__/gu,''));
    const ja=parts[0];
    if(!ja||!hasJapanese(ja)||seen.has(ja)) return [];
    seen.add(ja);return [{ja,reading:parts.length>=3?parts[1]:'',meaning:parts.length>=3?parts.slice(2).join(' · '):(parts[1]||'')}];
  }).slice(0,500);
}
export function parseSentences(text){
  const original = text.split(/\r?\n/u).map(line=>line.trim().replace(/^#{1,6}\s+/u,'').replace(/^[-*+]\s+/u,'').replace(/^\d+[.)]\s+/u,'').replace(/^\|\s*|\s*\|$/gu,'').split(/\s*\|\s*|\t+/u)[0]).filter(hasJapanese).join('\n');
  return (original.match(/[^。！？!?\n]+[。！？!?]*/gu)||[]).map(ja=>({ja:ja.trim(),reading:'',meaning:''})).filter(x=>hasJapanese(x.ja)).slice(0,500);
}
// Keep ordinary sentences intact. For unusually long items, prefer a clause
// break, then a Japanese word boundary, before falling back to a character.
export function speechChunks(text){
  const limit=120;
  if(text.length<=limit)return [text];
  const words=typeof Intl.Segmenter==='function'
    ? new Intl.Segmenter('ja',{granularity:'word'}).segment(text) : null;
  const graphemes=words&&new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(text);
  const chunks=[];
  let start=0;
  while(text.length-start>limit){
    const target=start+limit;
    const window=text.slice(start,target);
    const clause=/^([\s\S]*[、，,。！？!?；;\s])/u.exec(window);
    let end=clause ? start+clause[1].length : words?.containing(target).index;
    if(!end||end<=start)end=target;
    if(graphemes){
      const cluster=graphemes.containing(end);
      end=cluster.index>start ? cluster.index : cluster.index+cluster.segment.length;
    }else if(/[\uD800-\uDBFF]/u.test(text[end-1])&&/[\uDC00-\uDFFF]/u.test(text[end])){
      end--;
    }
    chunks.push(text.slice(start,end));
    start=end;
  }
  if(start<text.length)chunks.push(text.slice(start));
  return chunks;
}
export function chooseNext(items,ratings,current,turn){
  if(items.length<2)return 0;
  let best=-1,score=Infinity;
  for(let offset=1;offset<=items.length;offset++){
    const i=(current+offset)%items.length;
    if(i===current)continue;
    const rating=ratings[items[i].ja];
    const due=rating?.due??0;
    const priority=rating?.kind==='forgot'&&due<=turn?due-100000:due;
    if(priority<score){score=priority;best=i;}
  }
  return best<0?(current+1)%items.length:best;
}
export function reviewRating(previous,kind,turn,count){
  return {kind,seen:(previous?.seen||0)+1,due:turn+(kind==='forgot'?1:kind==='got'?Math.max(8,count*3):Math.max(2,count)),updatedAt:Date.now()};
}
export function createVariations(paragraph,rules,reference,limit=12){
  if(!hasJapanese(paragraph))throw new Error('Add a Japanese paragraph first.');
  const valid=rules.filter(r=>r.from.trim()&&r.to.trim());
  if(!valid.length)throw new Error('Add an original word and at least one replacement.');
  const originals=new Set();
  for(const r of valid){
    r.from=r.from.trim();
    if(originals.has(r.from))throw new Error('Use one replacement row per original word.');
    if(!paragraph.includes(r.from))throw new Error(`“${r.from}” does not appear in your paragraph.`);
    if([...originals].some(x=>x.includes(r.from)||r.from.includes(x)))throw new Error('Overlapping original words need separate practices.');
    originals.add(r.from);
    r.choices=[...new Set(r.to.split(/[,，、\n]/u).map(x=>x.trim()).filter(Boolean))];
    if(!r.choices.length)throw new Error('Add a replacement word between the commas.');
    if(r.choices.length>20)throw new Error('Use at most 20 alternatives for each word.');
    for(const word of r.choices){
      if(!hasJapanese(word)||/[。！？!?\n]/u.test(word))throw new Error('Use Japanese words in the same form, without sentence punctuation.');
      if(!reference.includes(word))throw new Error(`Add “${word}” to your reference word bank first.`);
    }
  }
  // Tokenise the original once so a replacement is never replaced by a later rule.
  const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=new RegExp('('+valid.map(x=>escape(x.from)).sort((a,b)=>b.length-a.length).join('|')+')','gu');
  const pieces=paragraph.split(pattern);
  let combinations=[{}];
  for(const r of valid){combinations=combinations.flatMap(c=>r.choices.map(word=>({...c,[r.from]:word}))).slice(0,limit);}
  return [...new Set(combinations.map(c=>pieces.map(piece=>Object.hasOwn(c,piece)?c[piece]:piece).join('')))].filter(x=>x!==paragraph).slice(0,limit);
}
export const packs=[
 {id:'greetings',name:'Everyday essentials',subtitle:'12 words · Start with a hello',art:'こんにちは',short:'Greetings',colour:'sand',text:'おはようございます | ohayō gozaimasu | Good morning\nこんにちは | konnichiwa | Hello / Good afternoon\nこんばんは | konbanwa | Good evening\nありがとうございます | arigatō gozaimasu | Thank you\nすみません | sumimasen | Excuse me / Sorry\nはい | hai | Yes\nいいえ | iie | No\nさようなら | sayōnara | Goodbye\nまたね | mata ne | See you\nおねがいします | onegai shimasu | Please\nおやすみなさい | oyasuminasai | Good night\nどういたしまして | dō itashimashite | You’re welcome'},
 {id:'school',name:'In the classroom',subtitle:'10 words · Your school day',art:'が',short:'School life',colour:'sage',text:'がっこう | gakkō | School\nせんせい | sensei | Teacher\nがくせい | gakusei | Student\nほん | hon | Book\nえんぴつ | enpitsu | Pencil\nつくえ | tsukue | Desk\nいす | isu | Chair\nきょうしつ | kyōshitsu | Classroom\nともだち | tomodachi | Friend\nにほんご | nihongo | Japanese language'},
 {id:'food',name:'A little taste of Japanese',subtitle:'10 words · Everyday favourites',art:'りんご',short:'Food & drink',colour:'peach',text:'りんご | ringo | Apple\nみず | mizu | Water\nぱん | pan | Bread\nごはん | gohan | Rice / Meal\nおちゃ | ocha | Tea\nぎゅうにゅう | gyūnyū | Milk\nばなな | banana | Banana\nさかな | sakana | Fish\nやさい | yasai | Vegetables\nたまご | tamago | Egg'},
 {id:'kana',name:'Your first hiragana',subtitle:'15 sounds · Build your foundations',art:'あ',short:'First kana',colour:'blue',text:'あ | a | As in “father”\nい | i | As in “machine”\nう | u | A short, gently rounded u\nえ | e | As in “bed”\nお | o | A pure o sound\nか | ka | ka\nき | ki | ki\nく | ku | ku\nけ | ke | ke\nこ | ko | ko\nさ | sa | sa\nし | shi | shi\nす | su | su\nせ | se | se\nそ | so | so'}
];
