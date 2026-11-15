import {request} from './api.js';
import {sampleResumeText, sampleExperiences} from './data.js';

export function createExperienceController({
  getState, getConfig, confirmed, aiTask, save, render, invalidate, toast, uid, escape, button, tag
}) {
  let importBusy = false;
  let importMessage = '';
  let importError = '';

  function reset() {
    importMessage = '';
    importError = '';
  }

  async function analyzeResume() {
    if (importBusy) return;
    const state = getState();
    if (!state.sourceText.trim()) throw Error('Upload your résumé first.');
    importBusy = true;
    importError = '';
    importMessage = 'Analyzing your résumé with AI…';
    render();
    try {
      await save();
      const sourceText = state.sourceText;
      const result = await aiTask('parse', {sourceText}, () => sourceText === sampleResumeText
  ? {experiences: sampleExperiences()}
  : {experiences: [{
      title: 'Imported résumé — review details',
      organization: '',
      type: 'Project',
      dates: '',
      description: sourceText,
      sourceQuote: sourceText,
      confirmed: false
    }]});
      state.importReview = {
        rawAnalysis: result.rawAnalysis || result,
        reviewEntries: result.reviewEntries || [],
        questions: result.questions || []
      };
      await save();
      if (!Array.isArray(result.experiences) || result.experiences.some(e => !e.title || !e.description || !e.sourceQuote || !sourceText.includes(e.sourceQuote))) {
        throw Error('AI analysis did not return valid source-backed entries. Please try uploading again.');
      }
      let added = 0;
      for (const e of result.experiences) {
        if (state.experiences.some(existing => existing.sourceQuote === e.sourceQuote)) continue;
        state.experiences.push({...e, id: uid(), confirmed: false});
        added++;
      }
      if (added) invalidate();
      await save();
      importMessage = (added
        ? `${added} experience entries extracted. Review and confirm on the right.`
        : result.experiences.length
          ? 'These entries already exist in your library.'
          : 'No source-backed entries could be added. Please try uploading again.')
        + (result.warnings?.length ? ' ' + result.warnings.join(' ') : '');
    } catch (error) {
      importMessage = '';
      importError = error.message;
      toast(error.message);
    } finally {
      importBusy = false;
      render();
    }
  }

  async function handleFileChange(el) {
    if (importBusy) return;
    const file = el.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast('Please choose a file smaller than 8 MB.');
      return;
    }
    el.disabled = true;
    importBusy = true;
    importError = '';
    importMessage = 'Reading document contents…';
    render();
    try {
      const content = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await request('import', {name: file.name, content});
      getState().sourceText = result.text;
      importBusy = false;
      await analyzeResume();
    } catch (error) {
      importBusy = false;
      importMessage = '';
      importError = error.message;
      render();
      toast(error.message);
    }
  }
  async function handleAction(action) {
    if (action === 'load-sample') {
  getState().sourceText = sampleResumeText;
  await analyzeResume();
  return true;
}
    const state = getState();
    if (action.startsWith('confirm:')) {
      state.experiences.find(e => e.id === action.slice(8)).confirmed = true;
      invalidate();
      await save();
      render();
      return true;
    }
    if (action === 'confirm-all') {
      state.experiences.forEach(e => { e.confirmed = true; });
      invalidate();
      await save();
      render();
      return true;
    }
    return false;
  }

  function page() {
    const state = getState();
    const config = getConfig();
    const unconfirmedCount = state.experiences.filter(e => !e.confirmed).length;

    return `<div class="page-heading">
        <div>
          <div class="eyebrow">START WITH WHAT’S REAL</div>
          <h1>Your story, in one place.</h1>
        </div>
        ${button('+ Add experience', 'add-experience', 'light')}
      </div>` +
      `<div class="two-col">
        <section class="stack" style="align-self:start">
          <div class="panel">
            <h2 style="margin-bottom:16px">Import your résumé</h2>
            <div class="upload" style="display:flex;flex-direction:column;align-items:center;text-align:center">
              <div style="font-size:28px;color:#819c64">↥</div>
              <strong class="small">Upload PDF, DOCX, or TXT</strong>
              <p>Up to 8 MB · Text-based files only</p>
              <label for="resume-file" class="button primary" style="cursor:pointer;margin-top:6px">Choose file</label>
<div style="margin-top:18px">
  <button type="button" class="button text" data-action="load-sample" style="font-weight:700">or try a sample résumé</button>
</div>
              <input type="file" id="resume-file" accept=".pdf,.docx,.txt" aria-label="Upload résumé" style="display:none" ${importBusy ? 'disabled' : ''}>
            </div>
            ${importBusy
              ? `<div class="ai-loader" role="status" aria-live="polite"><div class="spinner"></div><div><strong>${escape(importMessage)}</strong><div class="fine-print">Extracting verifiable roles, dates, and source quotes…</div></div></div>`
              : (importError || importMessage)
                ? `<p class="import-status ${importError ? 'error' : ''}" role="status" aria-live="polite">${escape(importError || importMessage)}</p>`
                : ''}
            ${state.importReview?.reviewEntries?.length ? `<details class="original-source"><summary>${state.importReview.reviewEntries.length} entries need review</summary><pre>${escape(JSON.stringify(state.importReview.reviewEntries, null, 2))}</pre></details>` : ''}
            ${!config.aiConfigured ? `<p class="fine-print">Demo mode: connect your AI API for résumé analysis.</p>` : ''}
          </div>
        </section>
        <section>
          <div class="section-head">
            <h2>Experience library</h2>
            <div class="row">
              ${unconfirmedCount > 0 ? button(`Confirm all (${unconfirmedCount})`, 'confirm-all', 'light') : ''}
              ${tag(state.experiences.length + ' entries', 'gray')}
            </div>
          </div>
          ${confirmed().length > 0 ? `<div class="info-strip" style="margin:0 0 18px;justify-content:space-between;align-items:center"><span><strong>${confirmed().length} confirmed facts ready.</strong> Next: select a target job to match evidence.</span><a href="#jobs" class="button primary" style="justify-content:center;text-align:center">Continue</a></div>` : ''}
          <div class="stack">
            ${state.experiences.map(e => `<article class="panel experience-card">
              <div class="row spread">${tag(e.type, 'gray')}${tag(e.confirmed ? 'User confirmed' : 'Review needed', e.confirmed ? '' : 'amber')}</div>
              <h3 style="margin-top:16px">${escape(e.title)}</h3>
              <p class="muted">${escape(e.organization)} · ${escape(e.dates)}</p>
              <p>${escape(e.description)}</p>
              <details class="original-source">
                <summary>Source text from résumé</summary>
                <div class="source" style="margin-top:8px">${escape(e.sourceQuote || 'Manually entered by you.')}</div>
              </details>
              <div class="row" style="margin-top:18px">
                ${button('Edit details', 'edit:' + e.id)}
                ${!e.confirmed ? button('Confirm facts', 'confirm:' + e.id, 'light') : ''}
              </div>
            </article>`).join('') || '<div class="empty">Upload a résumé on the left, or add an experience manually above.</div>'}
          </div>
        </section>
      </div>`;
  }

  return {page, handleAction, handleFileChange, reset};
}