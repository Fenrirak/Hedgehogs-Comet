import {appendFileSync,cpSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {siteFiles} from './site-files.mjs';
const arg=process.argv.slice(2),get=name=>arg[arg.indexOf(name)+1];
const url=arg.includes('--site-url')?get('--site-url'):process.env.SITE_URL;
const contact=arg.includes('--contact')?get('--contact'):process.env.OWNER_CONTACT;
if(!url||!contact)throw new Error('Set SITE_URL and OWNER_CONTACT, or pass --site-url and --contact. No fake production URLs are emitted.');
const base=new URL(url.endsWith('/')?url:url+'/');if(base.protocol!=='https:'||base.hostname.endsWith('.invalid'))throw new Error('Use the real HTTPS production URL.');
const output=mkdtempSync(join(tmpdir(),'hedgehogs-comet-'));
for(const name of siteFiles)cpSync(new URL('../'+name,import.meta.url),join(output,name));
cpSync(new URL('../vendor/',import.meta.url),join(output,'vendor'),{recursive:true});
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const pages=['index.html','privacy.html','terms.html'];
for(const name of [...pages,'creator.html']){
 const filename=join(output,name);let html=readFileSync(filename,'utf8');
 html=html.replace(/<link rel="canonical"[^>]*>/g,'').replace('</head>',`<link rel="canonical" href="${escape(new URL(name==='index.html'?'':name,base).href)}"></head>`);
 html=html.replace(/<span data-owner-contact>[\s\S]*?<\/span>/g,()=>`<span data-owner-contact>${escape(contact)}</span>`);
 if(name==='index.html'){
   html=html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g,'');
   const data={"@context":"https://schema.org","@type":"WebApplication",name:"Hedgehog’s Comet",url:base.href,applicationCategory:"EducationalApplication",operatingSystem:"Web",inLanguage:["en-NZ","ja"],offers:{"@type":"Offer",price:"0",priceCurrency:"NZD"},description:"Free Japanese listening and revision practice for beginners in Aotearoa New Zealand."};
   html=html.replace('</head>',()=>'<script type="application/ld+json">'+JSON.stringify(data).replaceAll('<','\\u003c')+'</script></head>');
 }
 writeFileSync(filename,html);
}
writeFileSync(join(output,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+pages.map(name=>'<url><loc>'+escape(new URL(name==='index.html'?'':name,base).href)+'</loc></url>').join('')+'</urlset>\n');
writeFileSync(join(output,'robots.txt'),'User-agent: *\nAllow: /\nSitemap: '+new URL('sitemap.xml',base).href+'\n');
console.log('Release URLs, sitemap, robots.txt and owner contact generated for '+base.href);

if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'path='+output+'\n');
console.log('Publish directory: '+output);
