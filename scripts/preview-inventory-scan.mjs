#!/usr/bin/env node
/**
 * Render the Inventory page's scan sheet in its native state.
 *
 * Distinct from preview-scan.mjs: this sheet opens *on top of* another page,
 * so the failure mode is different — the page behind it showed through the
 * scan window (form fields, scrollable) instead of the camera.
 *
 *   node scripts/preview-inventory-scan.mjs out.png
 *   node scripts/check-scan-window.mjs out.png
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const TOK=readFileSync('/tmp/uitok','utf8').trim()
const OUT=process.argv[2]
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const profile=mkdtempSync(join(tmpdir(),'inv-')); const port=9971
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'})
const cleanup=()=>{chrome.kill();try{rmSync(profile,{recursive:true,force:true})}catch{}}
async function wait(){for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${port}/json/version`);if(r.ok)return (await r.json()).webSocketDebuggerUrl}catch{}await new Promise(r=>setTimeout(r,250))}throw 0}
try{
  const ws=new WebSocket(await wait()); let id=1; const p=new Map()
  const send=(m,q={},s)=>new Promise((res,rej)=>{const n=id++;p.set(n,{res,rej});ws.send(JSON.stringify({id:n,method:m,params:q,...(s?{sessionId:s}:{})}))})
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j})
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){const{res,rej}=p.get(m.id);p.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result)}}
  const {targetId}=await send('Target.createTarget',{url:'about:blank'})
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true})
  await send('Page.enable',{},sessionId)
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true},sessionId)
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`const s='{"mode":"remote","serverUrl":"http://localhost:3000","configured":true}';localStorage.setItem('labstock.settings',s);localStorage.setItem('CapacitorStorage.labstock.settings',s);localStorage.setItem('CapacitorStorage.labstock.token','${TOK}');`},sessionId)
  await send('Page.navigate',{url:'http://localhost:3000/products'},sessionId)
  await new Promise(r=>setTimeout(r,4500))
  // Open the scan sheet by clicking the "Scan barcode" button.
  const {result:clicked}=await send('Runtime.evaluate',{expression:`
    (()=>{const b=[...document.querySelectorAll('button')].find(x=>/scan/i.test(x.textContent||''));
      if(!b) return 'no button'; b.click(); return 'clicked';})()
  `,returnByValue:true},sessionId)
  console.log('open sheet:', clicked.value)
  await new Promise(r=>setTimeout(r,2500))
  // Simulate the native scan state + camera layer behind everything.
  const {result:sim}=await send('Runtime.evaluate',{expression:`
   (()=>{
     const cam=document.createElement('div'); cam.id='fake-camera';
     cam.style.cssText='position:fixed;inset:0;z-index:-1;background:repeating-linear-gradient(45deg,#e8b04b 0 40px,#3aa0d8 40px 80px)';
     document.documentElement.appendChild(cam);
     document.documentElement.classList.add('scanner-active');
     document.body.classList.add('scanner-active');
     const sheet=document.querySelector('.scan-sheet');
     if(!sheet) return JSON.stringify({error:'no sheet'});
     const frame=sheet.querySelector('.scanner-frame');
     frame.querySelectorAll('.scanner-overlay').forEach(n=>n.remove());
     frame.insertAdjacentHTML('beforeend','<div class="scanner-overlay"><div class="scanner-scrim"></div><div class="reticle"><span class="reticle-corner tl"></span><span class="reticle-corner tr"></span><span class="reticle-corner bl"></span><span class="reticle-corner br"></span></div></div>');
     return JSON.stringify({
       sheetParent: sheet.parentElement.tagName+'.'+(sheet.parentElement.className||''),
       mainHidden: getComputedStyle(document.querySelector('.app-main')).visibility
     });
   })()
  `,returnByValue:true},sessionId)
  console.log('sim:', sim.value)
  await new Promise(r=>setTimeout(r,700))
  const {data}=await send('Page.captureScreenshot',{format:'png'},sessionId)
  writeFileSync(OUT, Buffer.from(data,'base64'))
  console.log('screenshot:', OUT)
  ws.close()
}finally{cleanup()}
