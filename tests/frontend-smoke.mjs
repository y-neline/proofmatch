/** Verify account routes, paywalls, demo checkout boundaries, and core workflows. */
import assert from 'node:assert/strict';
import {initialWorkspace} from '../frontend/js/data.js';
const elements=new Map(),listeners={};
function element(key){
 if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',value:'',classList:{add(){},remove(){},toggle(){}},showModal(){},close(){},disabled:false});
 return elements.get(key);
}
globalThis.document={body:element('body'),querySelector:element,addEventListener:(event,handler)=>{listeners[event]=handler;}};
globalThis.location={get hash(){return this.value||'#login';},set hash(value){this.value=value.startsWith('#')?value:'#'+value;}};
globalThis.window={addEventListener:(event,handler)=>{listeners[event]=handler;},scrollTo(){},dispatchEvent(event){listeners[event.type]?.();}};
globalThis.FormData=class{constructor(form){this.values=form.values;}[Symbol.iterator](){return Object.entries(this.values)[Symbol.iterator]();}};
let workspace=initialWorkspace(),session=null,checkoutBody=null;
globalThis.fetch=async(url,options)=>({ok:true,json:async()=>{
 if(url.endsWith('config'))return {aiConfigured:false,jobsConfigured:false};
 if(url.endsWith('auth/me'))return {user:session};
 if(url.endsWith('auth/guest')){session={id:12,name:'Guest',email:'guest-test@proofmatch.invalid',guest:true,plan:'free',proUntil:null};return {user:session};}
 if(url.endsWith('auth/register')||url.endsWith('auth/login')){session={id:1,name:'Test User',email:'test@example.com',plan:'free',proUntil:null};return {user:session};}
 if(url.endsWith('auth/logout')){session=null;return {signedOut:true};}
 if(url.endsWith('billing/demo-checkout')){checkoutBody=JSON.parse(options.body);session={...session,plan:'pro',proUntil:Math.floor(Date.now()/1000)+86400};return {user:session};}
 if(url.endsWith('import'))return {text:'Built Vue asset interfaces with filtering and REST APIs.'};
 if(options?.body){workspace=JSON.parse(options.body);return {saved:true};}
 return {workspace};
}});
await import('../frontend/js/app.js');
await new Promise(resolve=>setTimeout(resolve,0));
assert.ok(element('#app').innerHTML.includes('id="login-form"'));
assert.ok(element('#app').innerHTML.includes('data-action="guest-login"'));

function route(page){location.hash='#'+page;listeners.hashchange();}
async function click(action,data={}){const el={dataset:{action,...data},disabled:false};await listeners.click({target:{closest:()=>el}});}
async function submit(id,values){await listeners.submit({preventDefault(){},target:{id,values,querySelector:()=>element('submit'),reset(){}}});}
await click('guest-login');
assert.ok(element('#app').innerHTML.includes('Good to see you'));
assert.equal(session.guest,true);
await click('logout');
assert.ok(element('#app').innerHTML.includes('data-action="guest-login"'));
route('register');assert.ok(element('#app').innerHTML.includes('id="register-form"'));
await submit('register-form',{name:'Test User',email:'test@example.com',password:'test-password'});
assert.ok(element('#app').innerHTML.includes('Good to see you'));
assert.ok(!element('#navigation').innerHTML.includes('Applications'));
for(const page of ['dashboard','profile','paths','jobs','plans','checkout']){
 route(page);assert.ok(element('#app').innerHTML.length>200);assert.ok(!element('#app').innerHTML.includes('undefined'));
}
route('resume');assert.ok(element('#app').innerHTML.includes('Explore ProofMatch Pro'));
route('training');assert.ok(element('#app').innerHTML.includes('Explore ProofMatch Pro'));
await click('create-plan');assert.equal(location.hash,'#plans');assert.equal(workspace.tasks.length,0);
route('checkout');element('#card-number').value='4111111111111111';element('#card-expiry').value='12/30';element('#card-cvc').value='123';
await submit('checkout-form',{email:'billing@example.com'});
assert.equal(checkoutBody,null,'Real card values must not be submitted');
assert.ok(element('#checkout-error').textContent.includes('Use the demo card'));
await click('fill-test-card');await submit('checkout-form',{email:'billing@example.com'});
assert.deepEqual(checkoutBody,{email:'billing@example.com'},'Card details must never leave the browser');
assert.ok(element('#app').innerHTML.includes('Your next chapter is unlocked'));
route('resume');assert.ok(element('#app').innerHTML.includes('Choose a confirmed experience'));
route('training');await click('create-plan');assert.equal(workspace.tasks.length,4);
element('#training-answer').value='I built the Vue asset list and filtering.';await click('review');
assert.equal(workspace.reviews.t1.completed,false,'Demo feedback cannot award completion');
route('resume');element('#rewrite-experience').value='e1';await click('rewrite');
assert.equal(workspace.rewrite.tailored,workspace.experiences[0].description);
await click('save-version');assert.equal(workspace.versions.length,1);
route('profile');assert.ok(element('#app').innerHTML.includes('id="resume-file"'));assert.ok(!element('#app').innerHTML.includes('id="source-text"'));
await click('import-text');element('#source-text').value='Built a user-owned Vue application.';await click('parse');
assert.ok(workspace.experiences.some(e=>e.description==='Built a user-owned Vue application.'));
await click('import-upload');
globalThis.FileReader=class{readAsDataURL(){this.result='data:application/pdf;base64,cGRm';this.onload();}};
await listeners.change({target:{id:'resume-file',files:[{name:'test.pdf',size:3}],disabled:false}});
assert.ok(workspace.experiences.some(e=>e.description==='Built Vue asset interfaces with filtering and REST APIs.'));
await click('logout');assert.ok(element('#app').innerHTML.includes('id="login-form"'));
assert.ok(element('#app').innerHTML.includes('data-action="guest-login"'));

console.log('Passed: registration/login pages, free feature gates, test-card-only checkout, no card transmission, Pro unlock, logout, résumé and training workflows, both import methods.');
