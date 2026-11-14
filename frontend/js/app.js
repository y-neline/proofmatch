import {request, ask} from './api.js';
import {authPage, plansPage, lockedPage, checkoutPage} from './account.js';
import {initialWorkspace, exampleTasks, examplePaths} from './data.js';

// Central state and small rendering functions keep each feature easy to replace.
let state = initialWorkspace();
let config = {aiConfigured:false,jobsConfigured:false};
let paths = examplePaths;
let account = null;
const isPro = () => account?.plan === 'pro' && account.proUntil * 1000 > Date.now();
let activeTask = 0;
let feedback = null;
let importMode = 'upload';
let importBusy = false;
let importMessage = '';
let importError = '';
const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => crypto.randomUUID();
const icons = {
 dashboard:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 profile:'<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="9" r="2.5"/><path d="M8 17c0-4 8-4 8 0"/>',
 paths:'<path d="M5 21v-7c0-5 13-3 13-9M14 5h4v4M5 9V3M2 6h6"/>',
 jobs:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12c5 4 13 4 18 0M10 13h4"/>',
 resume:'<path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6"/>',
 training:'<path d="m3 8 9-5 9 5-9 5zM6 10v7c4 3 8 3 12 0v-7M21 8v9"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.resume}</svg>`;
const pages = [['dashboard','Overview'],['profile','My Experience'],['paths','Career Paths'],['jobs','Job Matches'],['resume','Résumé Studio'],['training','Training Studio'],['plans','Plans & Billing']];
const button = (text, action, style='') => `<button type="button" class="button ${style}" data-action="${action}">${text}</button>`;
const tag = (text, style='') => `<span class="tag ${style}">${escape(text)}</span>`;
const job = () => state.jobs.find(j => j.id === state.selectedJob) || state.jobs[0];
const confirmed = () => state.experiences.filter(e => e.confirmed);
const progress = () => {
  const total = state.tasks.reduce((n,t)=>n+t.weight,0);
  const done = state.tasks.filter(t=>state.reviews[t.id]?.completed).reduce((n,t)=>n+t.weight,0);
  return total ? Math.round(done/total*100) : 0;
};
const safeUrl = url => {try {const u=new URL(url);return ['https:','http:'].includes(u.protocol)?escape(u.href):'';}catch{return '';}};
const dateLabel = date => date ? escape(new Date(date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})) : 'Deadline not provided';
function toast(message) {const el=document.querySelector('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('visible'),4500);}
async function save() {try {await request('workspace',state);}catch(error){toast('Save failed: '+error.message);throw error;}}
function heading(eyebrow,title,subtitle,action='') {return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;}
function applicationLink(j) {const url=safeUrl(j?.url);return url ? `<a class="button primary" href="${url}" target="_blank" rel="noopener noreferrer">Apply on source ↗</a>` : tag('Example · no live application','gray');}
function companyLogo(j,i=0) {return `<div class="company-logo ${i===1?'purple':i===2?'blue':''}">${escape(j.company.slice(0,1))}<span style="font-size:13px">${i===0?'◒':''}</span></div>`;}
function jobCard(j,i=0) {return `<article class="job-card ${j.id===state.selectedJob?'selected':''}"><div class="row spread">${companyLogo(j,i)}<button class="bookmark" data-action="bookmark" data-id="${escape(j.id)}" aria-label="${state.savedJobs.includes(j.id)?'Unsave':'Save'} ${escape(j.title)}">${state.savedJobs.includes(j.id)?'▣':'▢'}</button></div><h3>${escape(j.title)}</h3><p>${escape(j.company)} <span>·</span> ${escape(j.location)}</p><div class="chip-row">${tag(j.demo?'Example listing':j.source,j.demo?'gray':'')}${tag(j.demo?'Not a live job':'Source checked')}</div><p>${escape(j.description.slice(0,115))}…</p><button class="button text" data-action="select-job" data-id="${escape(j.id)}">${j.id===state.selectedJob?'View selected role':'Explore this role'} →</button><div class="job-bottom"><span>${dateLabel(j.deadline)}</span><span>↗</span></div></article>`;}
function dashboard() {
 const j=job(); const p=progress();
 return heading('YOUR NEXT CHAPTER',`Good to see you, ${escape(state.profile.name.split(' ')[0])} <span style="font-size:25px">✳</span>`,"Your experience has potential. Let’s put it to work.",button('+ Add experience','add-experience','primary'))+
 `<section class="hero"><div><div class="eyebrow">REAL EXPERIENCE. REAL POSSIBILITY.</div><h2>You’ve done the work.<br>Now tell a stronger story.</h2><p>Connect what you’ve done to what’s next — with a tailored résumé and a little intentional practice.</p><a class="button" href="#resume">Build my next chapter <span>↗</span></a></div><div class="hero-art" aria-hidden="true"><div class="orbit"></div><div class="orbit two"></div><div class="orbit three"></div><div class="proof-card"><strong>your<br>next.</strong><div class="paper-line"></div><div class="paper-line short"></div><div class="paper-line"></div><div class="card-tick">✓</div></div><div class="floating-tag">✧ Grounded in your experience</div></div></section>
 <section class="stats" aria-label="Workspace statistics">${[
 ['Experiences added',state.experiences.length,`${confirmed().length} confirmed by you`,'profile'],['Saved opportunities',state.savedJobs.length,'A place to start exploring','jobs'],['Training plan',p+'<span>%</span>',state.tasks.length?`${state.tasks.filter(t=>state.reviews[t.id]?.completed).length} of ${state.tasks.length} tasks complete`:'Your first session is waiting','training'],['Your plan',isPro()?'Pro':'Free',isPro()?'All features unlocked':'Explore through Job Matches','profile']
 ].map(([label,value,note,i])=>`<div class="stat"><div class="stat-icon">${icon(i)}</div><label>${label}</label><strong>${value}</strong><small>${note}</small></div>`).join('')}</section>
 <div class="dashboard-grid"><section><div class="section-head"><h2>Your current focus</h2><a class="button text" href="#jobs">Change role ↗</a></div><div class="panel"><div class="focus-heading">${companyLogo(j)}<div><h3>${escape(j.title)}</h3><p>${escape(j.company)} · ${escape(j.location)}</p></div>${tag('In preparation')}</div><div class="divider"></div><div class="progress-label"><span>Training plan completion</span><strong>${p}%</strong></div><div class="progress"><span style="width:${p}%"></span></div><p class="fine-print">Your preparation progress, not a measure of job qualification.</p><a class="next-task" href="#training"><span class="square-icon">${icon('training')}</span><span><strong>${state.tasks.length?'Continue your focused practice':'Start with your project story'}</strong><small>${state.tasks.length?'One thoughtful step at a time':'Experience follow-up · About 10 minutes'}</small></span><span class="arrow">↗</span></a><div class="row spread"><span class="fine-print">◷ ${dateLabel(j.deadline)}</span><a href="#training" class="button primary">Continue preparation →</a></div></div></section>
 <section><div class="section-head"><h2>Your next steps</h2><span class="fine-print">A clear way forward</span></div><div class="panel journey">${[['01','Bring your experience together','Add and confirm your real contributions','profile',confirmed().length>0],['02','Find your direction','Explore roles connected to your story','paths',false],['03','Make it role-specific','Create a résumé with a clear purpose','resume',state.versions.length>0],['04','Practise with intention','Prepare for what the role actually needs','training',false]].map(([n,t,d,link,done],i)=>`<a href="#${link}" class="journey-item"><span class="step ${done?'done':i===1?'current':''}">${done?'✓':n}</span><span><strong>${t}</strong><small>${d}</small></span></a>`).join('')}</div></section></div>
 <section class="section-space"><div class="section-head"><div><h2>Opportunities to explore</h2><p class="fine-print" style="margin:6px 0 0">A few starting points for your next move.</p></div><a href="#jobs" class="button text">View all opportunities ↗</a></div><div class="jobs-preview">${state.jobs.slice(0,3).map(jobCard).join('')}</div></section><div class="info-strip"><span>✧</span><span><strong>You don’t have to finish preparing to start applying.</strong> Keep moving toward opportunities while you build confidence.</span></div>`;
}
function experiencePage() {return heading('START WITH WHAT’S REAL','Your story, in one place.','Bring your experiences together. You stay in control of every claim.',button('+ Add experience','add-experience','primary'))+`<div class="two-col"><section class="stack"><div class="panel"><h2>Import your résumé</h2><p class="small muted">Choose one way to import. AI reads your résumé and organizes the details for your review.</p><div class="import-tabs" role="group" aria-label="Résumé input method"><button type="button" data-action="import-upload" aria-pressed="${importMode==='upload'}" ${importBusy?'disabled':''}>Upload a file</button><button type="button" data-action="import-text" aria-pressed="${importMode==='text'}" ${importBusy?'disabled':''}>Paste text</button></div>${importMode==='upload'?`<div class="upload"><div style="font-size:28px;color:#819c64">↥</div><strong class="small">Upload once. We’ll read it for you.</strong><p>PDF, DOCX or TXT · Up to 8 MB<br>Text-based documents supported. Scans require OCR.</p><input type="file" id="resume-file" accept=".pdf,.docx,.txt" aria-label="Upload résumé" ${importBusy?'disabled':''}></div>`:`<label class="field">Résumé text<textarea id="source-text" rows="9" placeholder="Paste your résumé here…" ${importBusy?'disabled':''}>${escape(state.sourceText)}</textarea></label><button type="button" class="button primary" data-action="parse" ${importBusy?'disabled':''}>${importBusy?'Analyzing…':'Analyze résumé ✧'}</button>`}<p class="import-status ${importError?'error':''}" role="status" aria-live="polite">${escape(importError||importMessage)}</p>${state.sourceText?`<details class="original-source"><summary>View preserved original text</summary><pre>${escape(state.sourceText)}</pre></details><div style="margin-top:12px"><button type="button" class="button text" data-action="retry-parse" ${importBusy?'disabled':''}>Analyze preserved text again ↻</button></div>`:''}${state.importReview?.reviewEntries?.length?`<details class="original-source"><summary>${state.importReview.reviewEntries.length} entries need review</summary><pre>${escape(JSON.stringify(state.importReview.reviewEntries,null,2))}</pre></details>`:''}<p class="fine-print">${config.aiConfigured?'AI analysis creates draft experience cards. Confirm each fact before using it.':'Demo mode: connect your AI API for résumé analysis.'}</p></div><div class="panel"><h2>Job search preferences</h2><p class="small muted">These are your choices. We never infer them from your identity.</p><form id="preferences-form"><label class="field">Location<input name="location" value="${escape(state.profile.location)}"></label><label class="field">Work arrangement<input name="remote" value="${escape(state.profile.remote)}"></label><label class="field">Interests<input name="interests" value="${escape(state.profile.interests)}"></label><label class="field">Work authorization / sponsorship<input name="authorization" value="${escape(state.profile.authorization)}"></label><button class="button" type="submit">Save preferences</button></form></div></section><section><div class="section-head"><h2>Experience library</h2>${tag(state.experiences.length+' entries','gray')}</div><div class="stack">${state.experiences.map(e=>`<article class="panel experience-card"><div class="row spread">${tag(e.type,'gray')}${tag(e.confirmed?'User confirmed':'Review needed',e.confirmed?'':'amber')}</div><h3 style="margin-top:16px">${escape(e.title)}</h3><p class="muted">${escape(e.organization)} · ${escape(e.dates)}</p><p>${escape(e.description)}</p><div class="source"><strong>Source statement</strong><br>${escape(e.sourceQuote || 'Manually entered by you.')}</div><div class="row" style="margin-top:18px">${button('Edit details','edit:'+e.id)}${!e.confirmed?button('Confirm facts','confirm:'+e.id,'light'):''}</div></article>`).join('') || '<div class="empty">Add your first experience to begin.</div>'}</div></section></div>`;}
function pathsPage() {return heading('SEE THE POSSIBILITIES','There’s more than one way forward.','Explore directions connected to your evidence, interests, and preferences.',button('Refresh suggestions ✧','paths','primary'))+`<div class="notice">${config.aiConfigured?'Suggestions are based on your supplied experience, not a certification of suitability.':'Illustrative career paths · Connect your AI API to generate suggestions from your own experience.'}</div><div class="job-list">${paths.map((p,i)=>`<article class="list-card"><span class="eyebrow">DIRECTION 0${i+1}</span><h3>${escape(p.title)}</h3>${tag(p.label || 'Based on your experience')}<p class="small muted">${escape(p.reason)}</p><div class="chip-row">${(p.skills||[]).map(s=>tag(s,'gray')).join('')}</div><div class="divider"></div><strong class="small">What to explore next</strong><ul>${(p.gaps||[]).map(g=>`<li>${escape(g)}</li>`).join('')}</ul><a class="button" href="#jobs">Explore opportunities →</a></article>`).join('')}</div><div class="info-strip">✧ These are starting points. You can pursue a different path and add evidence as you go.</div>`;}
function jobsPage() {const j=job();return heading('FIND YOUR NEXT OPPORTUNITY','A role worth preparing for.','Explore source-linked roles or bring a job description of your own.',button('+ Paste a job description','add-job','primary'))+`<div class="toolbar"><input id="job-query" placeholder="Search job titles or locations…" aria-label="Search jobs">${button('Search live jobs ↗','search-jobs')}${button('Show saved','saved-jobs')}</div><div class="notice">${config.jobsConfigured?'Live search uses your configured company’s Greenhouse board. Job status reflects the last successful check.':'Example listings are shown below. Set GREENHOUSE_BOARD in .env for real company postings, or paste a JD. No sample job is a live opportunity.'}</div><div class="job-list" id="job-results">${state.jobs.map(jobCard).join('')}</div><section class="section-space panel"><div class="section-head"><div><div class="eyebrow">SELECTED ROLE</div><h2 style="margin-top:9px">${escape(j.title)} at ${escape(j.company)}</h2></div>${applicationLink(j)}</div><p class="small muted">${escape(j.description)}</p><div class="row">${tag(j.source,'gray')}${tag(j.status,'gray')}${tag(dateLabel(j.deadline),'amber')}</div>${j.checkedAt?`<p class="fine-print">Last checked: ${escape(new Date(j.checkedAt).toLocaleString())}</p>`:''}<div class="divider"></div><div class="row">${button('Compare with my experience ✧','analyze','primary')}</div><div id="analysis">${analysisView()}</div></section>`;}
function analysisView() {if(!state.analysis)return '';return `<div class="section-space"><h2>Requirements & your evidence</h2>${state.analysis.requirements.map(r=>`<article class="requirement"><div class="row spread"><h4>${escape(r.requirement)}</h4>${tag(r.status,r.status==='Supported'?'':'amber')}</div>${tag(r.kind,'gray')}<blockquote>${escape(r.quote)}</blockquote><p><strong>Evidence:</strong> ${escape(r.evidence)}</p><p><strong>Next step:</strong> ${escape(r.next)}</p></article>`).join('')}</div>`;}
function resumeText() {return `${state.profile.name}\n${state.profile.headline}\n${state.profile.location}\n\nEXPERIENCE\n${confirmed().map(e=>`${e.title} | ${e.organization} | ${e.dates}\n${e.description}`).join('\n\n')}${state.rewrite?'\n\nTAILORED STATEMENT\n'+state.rewrite.tailored:''}`;}
function resumePage() {const j=job();return heading('GIVE YOUR EXPERIENCE A CLEAR VOICE','A résumé with a reason.','Tailor the emphasis. Keep the facts.',button('Print / Save PDF ↗','print','primary'))+`<div class="two-col"><section class="stack studio-controls"><div class="panel"><div class="eyebrow">TAILORING FOR</div><h2 style="margin:12px 0">${escape(j.title)}</h2><p class="small muted">${escape(j.company)} · ${escape(j.location)}</p><div class="divider"></div><label class="field">Choose a confirmed experience<select id="rewrite-experience">${confirmed().map(e=>`<option value="${e.id}">${escape(e.title)}</option>`).join('')}</select></label>${button('Create three versions ✧','rewrite','primary')}<p class="fine-print">Only confirmed facts are available for rewriting. AI suggestions still need your review.</p></div>${state.rewrite?`<div class="panel"><h2>Make every line traceable</h2>${['concise','tailored','interview'].map(k=>`<h4 style="text-transform:capitalize">${k==='interview'?'Interview expansion':k+' version'}</h4><p class="small">${escape(state.rewrite[k])}</p>`).join('')}<div class="divider"></div><strong class="small">Facts used</strong><ul class="small muted">${state.rewrite.factsUsed.map(f=>`<li>${escape(f)}</li>`).join('')}</ul>${state.rewrite.questions?.length?`<strong class="small">To confirm</strong><ul class="small muted">${state.rewrite.questions.map(f=>`<li>${escape(f)}</li>`).join('')}</ul>`:''}</div>`:''}<div class="panel"><h2>Version history</h2><p class="small muted">Each saved résumé keeps its job description and training plan snapshot.</p><div class="row">${button('Save version','save-version')}${button('Download .txt','download')}</div>${state.versions.map(v=>`<div class="requirement"><strong class="small">${escape(v.job.title)} · v${v.number}</strong><p>${escape(new Date(v.createdAt).toLocaleString())}</p><button class="button text" data-action="download-version" data-id="${v.id}">Download saved version ↓</button></div>`).join('')}</div></section><section class="resume-paper" id="resume-document"><h2>${escape(state.profile.name)}</h2><p class="muted">${escape(state.profile.headline)} · ${escape(state.profile.location)}</p><h4>EXPERIENCE & EDUCATION</h4>${confirmed().map(e=>`<h3>${escape(e.title)}</h3><p class="muted">${escape(e.organization)} · ${escape(e.dates)}</p><ul><li>${escape(e.description)}</li></ul>`).join('')||'<p>Add and confirm your experience to build this document.</p>'}${state.rewrite?`<h4>PROPOSED ROLE-SPECIFIC STATEMENT</h4><p>${escape(state.rewrite.tailored)}</p>${tag('Review before submitting','amber')}`:''}</section></div>`;}
function trainingPage() {const t=state.tasks[activeTask];return heading('CONFIDENCE COMES FROM PRACTICE','Prepare with intention.','One role. Your real experience. Questions that connect the two.',button(state.tasks.length?'Create a fresh plan ✧':'Create training plan ✧','create-plan','primary'))+`${!config.aiConfigured?'<div class="notice">Demo training examples · Connect your AI API to generate role-specific tasks and assess answers. Demo answers never earn completion.</div>':''}<div class="panel" style="margin-bottom:23px"><div class="row spread"><div><strong class="small">${escape(job().title)} · Training plan completion</strong><p class="fine-print">${state.tasks.filter(t=>state.reviews[t.id]?.completed).length} of ${state.tasks.length} tasks completed · Weighted by task scope</p></div><h2>${progress()}%</h2></div><div class="progress"><span style="width:${progress()}%"></span></div><p class="fine-print">Completion tracks reviewed tasks. It does not measure job qualification or hiring probability. Apply whenever you choose.</p></div>${!t?'<div class="panel empty">Your practice starts here.<br><br>Create a plan to connect a job requirement with your experience and a clear check.</div>':`<div class="two-col"><section class="stack">${state.tasks.map((task,i)=>`<button class="task-card ${i===activeTask?'selected':''}" data-action="task" data-index="${i}"><span class="task-number">${state.reviews[task.id]?.completed?'✓':String(i+1).padStart(2,'0')}</span><span><strong>${escape(task.title)}</strong><small>${escape(task.type)} · Weight ${task.weight} ${state.reviews[task.id]?.completed?'· Completed':''}</small></span></button>`).join('')}<div class="info-strip">✧ Practical submissions receive a text review. Code is not executed or independently verified.</div></section><section class="panel">${tag(t.type)}<h2 style="margin-top:18px">${escape(t.title)}</h2><p class="fine-print">Requirement: ${escape(t.requirement)}<br>Experience: ${escape(t.experience)}</p><p class="question">${escape(t.question)}</p><strong class="small">What a strong answer includes</strong><ul class="small muted">${t.criteria.map(c=>`<li>${escape(c)}</li>`).join('')}</ul><label class="field">Your answer<textarea id="training-answer" rows="7" placeholder="Be specific about what you did, how you did it, and what you still need to learn.">${escape(state.reviews[t.id]?.answer||'')}</textarea></label>${button('Review my answer ✧','review','primary')}${feedback?feedbackView(feedback):''}${state.reviews[t.id]?.followUp?`<div class="feedback"><strong>Independent follow-up</strong><p>${escape(state.reviews[t.id].followUp)}</p><label class="field">Try without a hint<textarea id="followup-answer" rows="4">${escape(state.reviews[t.id]?.followUpAnswer||'')}</textarea></label>${button('Review follow-up','followup')}</div>`:''}</section></div>`}`;}
function feedbackView(f) {return `<div class="feedback"><h4>${escape(f.summary)}</h4>${f.demo?tag('Demo guidance · not an assessment','amber'):tag('AI review · not execution','gray')}<h4>What’s working</h4><ul>${f.strengths.map(s=>`<li>${escape(s)}</li>`).join('')}</ul><h4>Keep working on</h4><ul>${f.gaps.map(s=>`<li>${escape(s)}</li>`).join('')}</ul><p><strong>Try this:</strong> ${escape(f.hint)}</p></div>`;}
function render() {
 const page=location.hash.slice(1)||'dashboard';
 document.body.classList.toggle('auth-mode',!account);
 if(!account){app.innerHTML=authPage(page==='register'?'register':'login');return;}
 if(page==='login'||page==='register'){location.hash='dashboard';return;}
 document.querySelector('#account-controls').innerHTML=`<a class="plan-pill ${isPro()?'pro':''}" href="#plans">${isPro()?'✧ Pro':'Free · Upgrade ↗'}</a><button type="button" class="button text" data-action="logout">Sign out</button>`;

 document.querySelector('#navigation').innerHTML=pages.map(([id,label])=>`<a href="#${id}" class="nav-link ${page===id?'active':''}"><span class="nav-icon">${icon(id)}</span>${label}${['resume','training'].includes(id)&&!isPro()?'<span class="nav-count">PRO</span>':''}</a>`).join('');
 document.querySelector('#breadcrumb').textContent=pages.find(p=>p[0]===page)?.[1]||'Overview';
 document.querySelector('#sidebar-name').textContent=state.profile.name;
 document.querySelector('.avatar').textContent=state.profile.name.split(' ').map(n=>n[0]).slice(0,2).join('');
 document.querySelector('#mode-label').textContent=config.aiConfigured?'AI connected · Local workspace':'Demo workspace';
 const renderers={dashboard,profile:experiencePage,paths:pathsPage,jobs:jobsPage,resume:resumePage,training:trainingPage,plans:()=>plansPage(account,isPro()),checkout:()=>checkoutPage(account,isPro())};
 app.innerHTML=['resume','training'].includes(page)&&!isPro()?lockedPage(page):(renderers[page]||dashboard)();
}
function showModal(content) {document.querySelector('#modal-content').innerHTML=content;modal.showModal();}
function closeButton() {return button('Cancel','close');}
function experienceModal(id) {const e=state.experiences.find(e=>e.id===id)||{};showModal(`<h2>${id?'Edit':'Add'} experience</h2><form id="experience-form" data-id="${id||''}"><div class="two-col"><label class="field">Title<input name="title" required value="${escape(e.title)}"></label><label class="field">Organization<input name="organization" value="${escape(e.organization)}"></label></div><div class="two-col"><label class="field">Type<select name="type">${['Project','Work','Education','Certification','Skill'].map(t=>`<option ${e.type===t?'selected':''}>${t}</option>`).join('')}</select></label><label class="field">Dates<input name="dates" value="${escape(e.dates)}" placeholder="e.g. Jan 2024 – Jun 2025"></label></div><label class="field">What did you actually do?<textarea name="description" required rows="5">${escape(e.description)}</textarea></label><p class="fine-print">Describe your personal contribution. Include results only when you can explain the evidence.</p><label class="small"><input type="checkbox" name="confirmed" ${e.confirmed?'checked':''}> I confirm these details reflect my real experience.</label><div class="row" style="margin-top:22px">${closeButton()}<button class="button primary">Save experience</button></div></form>`);}
function addJobModal() {showModal(`<h2>Bring your own opportunity</h2><form id="job-form"><div class="two-col"><label class="field">Job title<input name="title" required></label><label class="field">Company<input name="company" required></label></div><label class="field">Location / work arrangement<input name="location" placeholder="Not specified"></label><label class="field">Original application URL<input name="url" type="url" placeholder="https://…"></label><label class="field">Explicit application deadline (optional)<input name="deadline" type="date"></label><label class="field">Full job description<textarea name="description" required rows="8"></textarea></label><p class="fine-print">Use a deadline only if the source explicitly provides it. Manually pasted roles have unconfirmed availability.</p><div class="row">${closeButton()}<button class="button primary">Save opportunity</button></div></form>`);}
function settingsModal() {showModal(`<h2>Your workspace</h2><form id="profile-form"><label class="field">Name<input name="name" required value="${escape(state.profile.name)}"></label><label class="field">Professional headline<input name="headline" value="${escape(state.profile.headline)}"></label><div class="notice">${config.aiConfigured?'AI connection configured':'AI is not configured'} · ${config.jobsConfigured?'Live job board configured':'Job board is not configured'}<br>Configure server secrets in .env, then restart the server.</div><p class="fine-print">${account.guest?'Guest demo session':'Signed in as '+escape(account.email)} · ${isPro()?'Pro':'Free'} plan. Your data is saved in your own account.</p><a class="button text" href="#plans" data-action="view-plans">Manage plan ↗</a><div class="row">${closeButton()}<button class="button primary">Save profile</button>${button('Reset workspace','clear-demo')}</div></form>`);}
function invalidate() {state.analysis=null;state.rewrite=null;state.tasks=[];state.reviews={};feedback=null;activeTask=0;}
async function aiTask(task,payload,demo) {
 if(config.aiConfigured)return ask(task,payload);
 toast('Demo output — connect your API for personalized AI results.');
 return demo();
}
/** Both input methods share the same AI analysis and source-validation path. */
async function analyzeResume() {
 if(importBusy)return;
 if(!state.sourceText.trim())throw Error('Paste or upload your résumé first.');
 importBusy=true;importError='';importMessage='Analyzing your résumé with AI…';render();
 try {
  // Save the original before the model call so API failures cannot discard it.
  await save();
  const sourceText=state.sourceText;
  const result=await aiTask('parse',{sourceText},()=>({experiences:[{title:'Imported résumé — review details',organization:'',type:'Project',dates:'',description:sourceText,sourceQuote:sourceText,confirmed:false}]}));
  state.importReview={rawAnalysis:result.rawAnalysis||result,reviewEntries:result.reviewEntries||[],questions:result.questions||[]};
  await save();
  if(!Array.isArray(result.experiences)||result.experiences.some(e=>!e.title||!e.description||!e.sourceQuote||!sourceText.includes(e.sourceQuote)))throw Error('AI analysis did not return valid source-backed entries. Your original text and AI response are preserved. Retry analysis or review the source.');
  let added=0;
  for(const e of result.experiences){
   if(state.experiences.some(existing=>existing.sourceQuote===e.sourceQuote))continue;
   state.experiences.push({...e,id:uid(),confirmed:false});added++;
  }
  if(added)invalidate();await save();
  importMessage=(added?`${added} experience entries extracted. Review and confirm the details on the right.`:result.experiences.length?'These entries already exist in your library. No duplicates were added.':'No source-backed entries could be added. Retry analysis using the preserved original text.')+(result.warnings?.length?' '+result.warnings.join(' '):'');
 }catch(error){importMessage='';importError=error.message;toast(error.message);}
 finally{importBusy=false;render();}
}
function download(text,name) {const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([text],{type:'text/plain'}));link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}

// Event delegation avoids rebinding handlers after a page changes.
document.addEventListener('click',async event=>{
 const el=event.target.closest('[data-action]');if(!el)return;
 const action=el.dataset.action;
 const paidActions=['rewrite','save-version','download','download-version','print','create-plan','review','followup','task'];
 if(paidActions.includes(action)&&!isPro()){location.hash='plans';return;}
 el.disabled=true;
 try {
 if(action==='guest-login'){
  const errorBox=document.querySelector('#auth-error');
  if(errorBox)errorBox.textContent='';
  const result=await request('auth/guest',{});
  account=result.user;
  await loadWorkspace();
  location.hash='dashboard';render();
  return;
 }
 if(action==='logout'){await request('auth/logout',{});account=null;state=initialWorkspace();modal.close();location.hash='login';render();return;}
 if(action==='view-plans'){modal.close();location.hash='plans';return;}
 if(action==='fill-test-card'){document.querySelector('#card-name').value=account.name;document.querySelector('#card-number').value='4242 4242 4242 4242';document.querySelector('#card-expiry').value='12/30';document.querySelector('#card-cvc').value='123';return;}
 if(action==='close'){modal.close();return;}
 if(action==='add-experience')experienceModal();
 else if(action.startsWith('edit:'))experienceModal(action.slice(5));
 else if(action.startsWith('confirm:')){state.experiences.find(e=>e.id===action.slice(8)).confirmed=true;invalidate();await save();render();}
 else if(action==='import-upload'||action==='import-text'){if(importBusy)return;const draft=document.querySelector('#source-text');if(draft)state.sourceText=draft.value;importMode=action==='import-upload'?'upload':'text';importError='';render();}
 else if(action==='retry-parse'){await analyzeResume();}
 else if(action==='parse'){
  state.sourceText=document.querySelector('#source-text').value;
  await analyzeResume();
 }
 else if(action==='add-job')addJobModal();
 else if(action==='bookmark'){const id=el.dataset.id;state.savedJobs=state.savedJobs.includes(id)?state.savedJobs.filter(x=>x!==id):[...state.savedJobs,id];await save();render();}
 else if(action==='select-job'){if(state.selectedJob!==el.dataset.id){state.selectedJob=el.dataset.id;invalidate();await save();}location.hash='jobs';render();}
 else if(action==='saved-jobs'){document.querySelector('#job-results').innerHTML=state.jobs.filter(j=>state.savedJobs.includes(j.id)).map(jobCard).join('')||'<div class="empty">No saved opportunities yet.</div>';}
 else if(action==='search-jobs'){
  const result=await request('jobs?q='+encodeURIComponent(document.querySelector('#job-query').value));
  for(const j of result.jobs){const index=state.jobs.findIndex(x=>x.id===j.id&&x.source===j.source);if(index<0)state.jobs.push(j);else state.jobs[index]=j;}
  await save();render();document.querySelector('#job-results').innerHTML=result.jobs.map(jobCard).join('')||'<div class="empty">No matching postings in your configured company board.</div>';
 }
 else if(action==='analyze'){
  const result=await aiTask('analyze',{job:job(),experiences:confirmed()},()=>({requirements:[{requirement:'Review source requirements',quote:job().description,kind:'Responsibility',status:'Unknown',evidence:'Demo mode does not assess your experience against a job description.',next:'Connect your AI API to generate a source-grounded comparison.'}]}));
  if(!Array.isArray(result.requirements)||result.requirements.some(r=>!r.quote||!job().description.includes(r.quote)))throw Error('The requirement review did not include exact JD quotes. Try again.');
  state.analysis=result;await save();render();
 }
 else if(action==='paths'){const result=await aiTask('paths',{experiences:confirmed(),preferences:state.profile},()=>({paths:examplePaths}));if(!Array.isArray(result.paths))throw Error('Invalid career path response.');paths=result.paths;render();}
 else if(action==='rewrite'){
  const e=confirmed().find(e=>e.id===document.querySelector('#rewrite-experience').value);if(!e)throw Error('Confirm an experience first.');
  const result=await aiTask('rewrite',{experience:e,job:job()},()=>({concise:e.description,tailored:e.description,interview:'Explain the context, your specific actions, and any known limitations. Original statement: '+e.description,factsUsed:[e.description],questions:['What did you personally own, and how was the result checked?']}));
  if(!['concise','tailored','interview'].every(k=>typeof result[k]==='string')||!Array.isArray(result.factsUsed))throw Error('Invalid rewrite response.');
  state.rewrite=result;await save();render();
 }
 else if(action==='save-version'){
  if(!confirmed().length)throw Error('Confirm your real experience before saving a résumé.');
  state.versions.push({id:uid(),number:state.versions.length+1,createdAt:new Date().toISOString(),job:structuredClone(job()),text:resumeText(),plan:structuredClone(state.tasks)});await save();render();toast('Résumé and job snapshot saved.');
 }
 else if(action==='download')download(resumeText(),'ProofMatch-resume.txt');
 else if(action==='download-version'){const v=state.versions.find(v=>v.id===el.dataset.id);download(v.text,`ProofMatch-resume-v${v.number}.txt`);}
 else if(action==='print')window.print();
 else if(action==='create-plan'){
  if(!confirmed().length)throw Error('Confirm at least one experience before creating your plan.');
  const result=await aiTask('train',{job:job(),experiences:confirmed()},()=>({tasks:exampleTasks()}));
  if(!Array.isArray(result.tasks)||!result.tasks.length||result.tasks.some(t=>!t.id||!t.question||!Array.isArray(t.criteria)||!(t.weight>0))||new Set(result.tasks.map(t=>t.id)).size!==result.tasks.length)throw Error('The training plan has missing or invalid tasks.');
  state.tasks=result.tasks;state.reviews={};activeTask=0;feedback=null;await save();render();
 }
 else if(action==='task'){activeTask=Number(el.dataset.index);feedback=state.reviews[state.tasks[activeTask].id]?.feedback||null;render();}
 else if(action==='review'||action==='followup'){
  const t=state.tasks[activeTask];const follow=action==='followup';const answer=document.querySelector(follow?'#followup-answer':'#training-answer').value.trim();if(!answer)throw Error('Write an answer before requesting feedback.');
  const task=follow?{...t,question:state.reviews[t.id].followUp}:t;
  const result=await aiTask('feedback',{task,answer},()=>({summary:'Your response has been saved. A connected model is needed to assess it.',strengths:['You recorded an answer for review.'],gaps:['Demo mode cannot determine whether the criteria are met.'],hint:'Compare each claim with the criteria and include a concrete example.',followUp:'Choose a different project scenario. Explain your decision, a failure mode, and how you would check the result.',meetsCriteria:false,demo:true}));
  if(typeof result.summary!=='string'||!Array.isArray(result.strengths)||!Array.isArray(result.gaps)||typeof result.meetsCriteria!=='boolean')throw Error('Invalid feedback response.');
  const previous=state.reviews[t.id]||{};
  state.reviews[t.id]={...previous,...(follow?{followUpAnswer:answer}:{answer}),feedback:result,followUp:result.meetsCriteria?null:result.followUp,completed:config.aiConfigured&&result.meetsCriteria===true};
  feedback=result;await save();render();
 }
 else if(action==='clear-demo'){
  if(!window.confirm('Reset this entire local workspace? This removes your experiences, saved résumés, and training. Export anything you want to keep first.')) return;
  state=initialWorkspace();feedback=null;activeTask=0;paths=examplePaths;state.profile={name:'Your name',headline:'Your professional headline',location:'',remote:'',interests:'',authorization:'Not specified'};state.experiences=[];state.sourceText='';state.jobs=[{id:'starter',title:'Choose your target role',company:'Your next company',location:'Not specified',description:'Paste a full job description to begin.',source:'Not configured',demo:true,status:'Not configured',deadline:null,url:''}];state.selectedJob='starter';state.savedJobs=[];await save();modal.close();render();toast('Workspace reset. Add your own experience and job description.');
 }
 } catch(error){toast(error.message);}finally{el.disabled=false;}
});

document.addEventListener('submit',async event=>{
 event.preventDefault();const form=event.target;const values=Object.fromEntries(new FormData(form));
 if(['login-form','register-form','checkout-form'].includes(form.id)){
  const submit=form.querySelector('button[type="submit"]');submit.disabled=true;
  const errorBox=document.querySelector(form.id==='checkout-form'?'#checkout-error':'#auth-error');errorBox.textContent='';
  try{
   if(form.id==='checkout-form'){
    const number=document.querySelector('#card-number').value.replace(/\s/g,'');
    if(number!=='4242424242424242'||document.querySelector('#card-expiry').value.trim()!=='12/30'||document.querySelector('#card-cvc').value!=='123')throw Error('Use the demo card: 4242 4242 4242 4242, expiration 12/30, security code 123. Real card details are not accepted.');
    // Only email leaves the browser. No card number, expiry, CVC, or cardholder name.
    const result=await request('billing/demo-checkout',{email:values.email});account=result.user;
    await loadWorkspace();form.reset();location.hash='checkout';render();toast('Demo Pro activated. All features unlocked. No payment was taken.');
   }else{
    const result=await request(form.id==='register-form'?'auth/register':'auth/login',values);account=result.user;
    await loadWorkspace();location.hash='dashboard';render();
   }
  }catch(error){errorBox.textContent=error.message;}finally{submit.disabled=false;}
  return;
 }
 try {
 if(form.id==='experience-form'){
  const old=state.experiences.find(e=>e.id===form.dataset.id);const entry={...values,id:old?.id||uid(),sourceQuote:old?.sourceQuote||values.description,confirmed:values.confirmed==='on'};
  if(old)state.experiences[state.experiences.indexOf(old)]=entry;else state.experiences.push(entry);invalidate();
 }else if(form.id==='job-form'){
  if(values.url&&!safeUrl(values.url))throw Error('Use an HTTP or HTTPS source URL.');
  const entry={...values,id:uid(),deadline:values.deadline||null,source:'Pasted job description',status:'Availability unconfirmed',demo:false};state.jobs.unshift(entry);state.selectedJob=entry.id;state.savedJobs.push(entry.id);invalidate();
 }else if(form.id==='profile-form'){state.profile={...state.profile,...values};}
 else if(form.id==='preferences-form'){state.profile={...state.profile,...values};}
 else return;
 await save();modal.close();render();toast('Changes saved.');
 }catch(error){toast(error.message);}
});
document.addEventListener('change',async event=>{
 const el=event.target;
 try {
 if(el.id==='resume-file'){
  if(importBusy)return;
  const file=el.files[0];if(!file)return;if(file.size>8*1024*1024)throw Error('Please choose a file smaller than 8 MB.');
  el.disabled=true;importBusy=true;importError='';importMessage='Reading document contents…';render();
  const content=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});
  const result=await request('import',{name:file.name,content});state.sourceText=result.text;importBusy=false;await analyzeResume();
 }
 }catch(error){if(el.id==='resume-file'){importBusy=false;importMessage='';importError=error.message;render();}toast(error.message);}
});
document.querySelector('#settings-button').onclick=settingsModal;
document.querySelector('#help-button').onclick=()=>showModal(`<h2>Real experience. Clear next steps.</h2><p class="small muted">ProofMatch connects your experience, a specific job, a tailored résumé, and focused practice. The initial profile and listings are examples.</p><p class="small muted">Use My Experience to import or add your own details. Confirm facts before tailoring. Connect your AI API and Greenhouse board in .env for live features. Training progress never blocks an application.</p><p class="small muted">Your workspace belongs to your account. Free includes features through Job Matches. Pro unlocks Résumé and Training. Checkout is a simulation with no real payment.</p>${closeButton()}`);
document.querySelector('.mobile-menu').onclick=()=>document.querySelector('.sidebar').classList.toggle('open');
window.addEventListener('hashchange',()=>{document.querySelector('.sidebar').classList.remove('open');feedback=null;render();window.scrollTo(0,0);});
/** New accounts start with an empty experience library, not another user's data. */
async function loadWorkspace(){
 const saved=await request('workspace');
 state=saved.workspace||initialWorkspace();
 if(!saved.workspace){state.profile={...state.profile,name:account.name,headline:'',location:'',remote:'',interests:'',authorization:'Not specified'};state.sourceText='';state.experiences=[];state.savedJobs=[];}
 feedback=null;activeTask=0;importMessage='';importError='';paths=examplePaths;
}
async function init(){try{
 const [settings,session]=await Promise.all([request('config'),request('auth/me')]);config=settings;account=session.user;
 if(account)await loadWorkspace();
 }catch(error){toast('Server unavailable: '+error.message);}render();}
window.addEventListener('session-expired',()=>{account=null;modal.close();location.hash='login';render();toast('Your session expired. Please sign in again.');});
init();
