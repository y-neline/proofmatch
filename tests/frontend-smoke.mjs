/** Render every page and exercise demo mutations without a browser dependency. */
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", {value:webcrypto});
const elements = new Map();
const listeners = {};
function element(key) {
  if (!elements.has(key)) elements.set(key, {innerHTML:'',textContent:'',value:'',classList:{add(){},remove(){},toggle(){}},showModal(){},close(){},disabled:false});
  return elements.get(key);
}
globalThis.document = {querySelector:element,addEventListener:(event,handler)=>{listeners[event]=handler;}};
globalThis.location = {hash:''};
globalThis.window = {addEventListener:(event,handler)=>{listeners[event]=handler;},scrollTo(){}};
let workspace;
globalThis.fetch = async (url, options) => ({ok:true,json:async()=>{
  if (url.endsWith('import')) return {text:'Built Vue asset interfaces with filtering and REST APIs.'};
  if (url.endsWith('config')) return {aiConfigured:false,jobsConfigured:false};
  if(options){workspace=JSON.parse(options.body);return {saved:true};}
  return {workspace:null};
}});
await import('../frontend/js/app.js');
await new Promise(resolve=>setTimeout(resolve,0));
for(const page of ['dashboard','profile','paths','jobs','resume','training','applications']){
  location.hash='#'+page;listeners.hashchange();
  assert.ok(element('#app').innerHTML.length>200,page+' should render');
  assert.ok(!element('#app').innerHTML.includes('undefined'),page+' should not expose undefined fields');
}
async function click(action, data={}) {const el={dataset:{action,...data},disabled:false};await listeners.click({target:{closest:()=>el}});}
location.hash='#training';await click('create-plan');
assert.equal(workspace.tasks.length,4);
assert.ok(element('#app').innerHTML.includes('What a strong answer includes'));
element('#training-answer').value='I built the Vue asset list and filtering.';
await click('review');
assert.equal(workspace.reviews.t1.completed,false,'Demo reviews must not award completion');
location.hash='#resume';listeners.hashchange();element('#rewrite-experience').value='e1';
await click('rewrite');
assert.equal(workspace.rewrite.tailored,workspace.experiences[0].description,'Demo must preserve original facts');
await click('save-version');
assert.equal(workspace.versions.length,1);
await click('track');
assert.equal(workspace.applications[0].resumeVersion.number,1);
assert.deepEqual(workspace.applications[0].plan,workspace.tasks);
console.log('Passed: 7 page renders, demo plan/review boundaries, fact-preserving rewrite, résumé and application snapshots.');

location.hash='#profile';listeners.hashchange();
assert.ok(element('#app').innerHTML.includes('id="resume-file"'));
assert.ok(!element('#app').innerHTML.includes('id="source-text"'));
await click('import-text');
assert.ok(element('#app').innerHTML.includes('id="source-text"'));
assert.ok(!element('#app').innerHTML.includes('id="resume-file"'));
element('#source-text').value='Built a user-owned Vue application.';
await click('parse');
assert.ok(workspace.experiences.some(e=>e.description==='Built a user-owned Vue application.'));
await click('import-upload');
globalThis.FileReader=class{readAsDataURL(){this.result='data:application/pdf;base64,cGRm';this.onload();}};
await listeners.change({target:{id:'resume-file',files:[{name:'test.pdf',size:3}],disabled:false}});
assert.ok(workspace.experiences.some(e=>e.description==='Built Vue asset interfaces with filtering and REST APIs.'));
console.log('Passed: mutually exclusive import inputs, pasted-text analysis, automatic uploaded-file analysis.');
