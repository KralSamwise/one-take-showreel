#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const formats = Object.fromEntries([6,15,30].flatMap(d=>[['16:9',1920,1080],['9:16',1080,1920]].map(([a,w,h])=>[`${d}x${a}`,{d,w,h}])));
export function create(target, {brand='FORM', format='15x9:16', tagline='One idea.|Many forms.', url='example.com'}={}) {
  if (!formats[format]) throw Error('Format must be 6/15/30x16:9 or x9:16');
  if (!brand.trim() || brand.length>32 || url.length>80 || tagline.split('|').length!==2) throw Error('Use a short brand, URL, and two tagline lines separated by |');
  const dest=path.resolve(target);
  if (fs.existsSync(dest)) throw Error('Target must be new');
  const vendor=path.join(root,'node_modules/gsap/dist/gsap.min.js');
  if (!fs.existsSync(vendor)) throw Error('Run npm ci in the skill repository first');
  const {d,w,h}=formats[format];
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  const staging=fs.mkdtempSync(path.join(path.dirname(dest),'.showreel-'));
  try {
    fs.cpSync(path.join(root,'template'),staging,{recursive:true});
    fs.mkdirSync(path.join(staging,'assets/vendor'),{recursive:true});
    fs.copyFileSync(vendor,path.join(staging,'assets/vendor/gsap.min.js'));
    const html=path.join(staging,'index.html');
    let text=fs.readFileSync(html,'utf8');
    for (const [key,value] of Object.entries({width:w,height:h,duration:d,fps:30})) text=text.replace(new RegExp(`data-${key}="[^"]+"`),`data-${key}="${value}"`);
    fs.writeFileSync(html,text);
    fs.writeFileSync(path.join(staging,'assets/brand/brand.js'),`window.OT_BRAND = ${JSON.stringify({name:brand,url,tagline:tagline.split('|'),hudLabel:'FORMAT DEMO'})};\n`);
    fs.writeFileSync(path.join(staging,'meta.json'),JSON.stringify({width:w,height:h,duration:d,fps:30},null,2));
    fs.writeFileSync(path.join(staging,'BRIEF.md'),`---\nworkflow: one-take-showreel\nflow: automation\nformat: ${format}\nmusic: none\n---\n\nFictional demonstration brand: ${brand}. No performance claims. Review output before sharing.\n`);
    fs.renameSync(staging,dest);
  } catch(e) {fs.rmSync(staging,{recursive:true,force:true});throw e;}
  return {directory:dest,width:w,height:h,duration:d};
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [target,...args]=process.argv.slice(2); const opts={};
  try {
    if (!target) throw Error('Usage: node scripts/create.mjs NEW_DIR [--brand NAME] [--format 15x9:16] [--tagline "Line one.|Line two."] [--url example.com]');
    for(let i=0;i<args.length;i+=2){if(!['--brand','--format','--tagline','--url'].includes(args[i])||args[i+1]===undefined)throw Error('Unknown option or missing value');opts[args[i].slice(2)]=args[i+1];}
    console.log(JSON.stringify(create(target,opts),null,2));
  } catch(e) {console.error(e.message);process.exitCode=2;}
}
