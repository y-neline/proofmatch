const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const button = (text, action, style = '') =>
  `<button type="button" class="button ${style}" data-action="${action}">${text}</button>`;

const tag = (text, style = '') =>
  `<span class="tag ${style}">${escape(text)}</span>`;

export function createTrainingController({ getState, getConfig, getJob, confirmed, progress, exampleTasks, aiTask, save, render }) {
  let activeTask = 0;
  let feedback = null;

  function reset() {
    activeTask = 0;
    feedback = null;
  }

  function clearFeedback() {
    feedback = null;
  }

  function feedbackView(f) {
    return `<div class="feedback">
      <h4>${escape(f.summary)}</h4>
      ${f.demo ? tag('Demo guidance · not an assessment', 'amber') : tag('AI review · not execution', 'gray')}
      <h4>What’s working</h4><ul>${f.strengths.map(s => `<li>${escape(s)}</li>`).join('')}</ul>
      <h4>Keep working on</h4><ul>${f.gaps.map(s => `<li>${escape(s)}</li>`).join('')}</ul>
      <p><strong>Try this:</strong> ${escape(f.hint)}</p>
    </div>`;
  }

  function page() {
    const state = getState();
    const config = getConfig();
    const t = state.tasks[activeTask];

    return `
      <div class="page-heading">
        <div>
          <div class="eyebrow">CONFIDENCE COMES FROM PRACTICE</div>
          <h1>Prepare with intention.</h1>
          <p>One role. Your real experience. Questions that connect the two.</p>
        </div>
        ${button(state.tasks.length ? 'Create a fresh plan ✧' : 'Create training plan ✧', 'create-plan', 'primary')}
      </div>
      ${!config.aiConfigured ? '<div class="notice">Demo training examples · Connect your AI API to generate role-specific tasks and assess answers. Demo answers never earn completion.</div>' : ''}
      <div class="panel" style="margin-bottom:23px">
        <div class="row spread">
          <div>
            <strong class="small">${escape(getJob().title)} · Training plan completion</strong>
            <p class="fine-print">${state.tasks.filter(t => state.reviews[t.id]?.completed).length} of ${state.tasks.length} tasks completed · Weighted by task scope</p>
          </div>
          <h2>${progress()}%</h2>
        </div>
        <div class="progress"><span style="width:${progress()}%"></span></div>
        <p class="fine-print">Completion tracks reviewed tasks. It does not measure job qualification or hiring probability. Apply whenever you choose.</p>
      </div>
      ${!t ? '<div class="panel empty">Your practice starts here.<br><br>Create a plan to connect a job requirement with your experience and a clear check.</div>' : `
      <div class="two-col">
        <section class="stack">
          ${state.tasks.map((task, i) => `
            <button class="task-card ${i === activeTask ? 'selected' : ''}" data-action="task" data-index="${i}">
              <span class="task-number">${state.reviews[task.id]?.completed ? '✓' : String(i + 1).padStart(2, '0')}</span>
              <span>
                <strong>${escape(task.title)}</strong>
                <small>${escape(task.type)} · Weight ${task.weight} ${state.reviews[task.id]?.completed ? '· Completed' : ''}</small>
              </span>
            </button>`).join('')}
          <div class="info-strip">✧ Practical submissions receive a text review. Code is not executed or independently verified.</div>
        </section>
        <section class="panel">
          ${tag(t.type)}
          <h2 style="margin-top:18px">${escape(t.title)}</h2>
          <p class="fine-print">Requirement: ${escape(t.requirement)}<br>Experience: ${escape(t.experience)}</p>
          <p class="question">${escape(t.question)}</p>
          <strong class="small">What a strong answer includes</strong>
          <ul class="small muted">${t.criteria.map(c => `<li>${escape(c)}</li>`).join('')}</ul>
          <label class="field">Your answer
            <textarea id="training-answer" rows="7" placeholder="Be specific about what you did, how you did it, and what you still need to learn.">${escape(state.reviews[t.id]?.answer || '')}</textarea>
          </label>
          ${button('Review my answer ✧', 'review', 'primary')}
          ${feedback ? feedbackView(feedback) : ''}
          ${state.reviews[t.id]?.followUp ? `
            <div class="feedback">
              <strong>Independent follow-up</strong>
              <p>${escape(state.reviews[t.id].followUp)}</p>
              <label class="field">Try without a hint
                <textarea id="followup-answer" rows="4">${escape(state.reviews[t.id]?.followUpAnswer || '')}</textarea>
              </label>
              ${button('Review follow-up', 'followup')}
            </div>` : ''}
        </section>
      </div>`}`;
  }

  async function handleAction(action, el) {
    const state = getState();
    const config = getConfig();

    if (action === 'create-plan') {
      if (!confirmed().length) throw Error('Confirm at least one experience before creating your plan.');
      const result = await aiTask('train', { job: getJob(), experiences: confirmed() }, () => ({ tasks: exampleTasks() }));
      if (!Array.isArray(result.tasks) || !result.tasks.length || result.tasks.some(t => !t.id || !t.question || !Array.isArray(t.criteria) || !(t.weight > 0)) || new Set(result.tasks.map(t => t.id)).size !== result.tasks.length) {
        throw Error('The training plan has missing or invalid tasks.');
      }
      state.tasks = result.tasks;
      state.reviews = {};
      reset();
      await save();
      render();
      return true;
    }

    if (action === 'task') {
      activeTask = Number(el.dataset.index);
      feedback = state.reviews[state.tasks[activeTask].id]?.feedback || null;
      render();
      return true;
    }

    if (action === 'review' || action === 'followup') {
      const t = state.tasks[activeTask];
      const follow = action === 'followup';
      const answer = document.querySelector(follow ? '#followup-answer' : '#training-answer').value.trim();
      if (!answer) throw Error('Write an answer before requesting feedback.');
      const task = follow ? { ...t, question: state.reviews[t.id].followUp } : t;
      const result = await aiTask('feedback', { task, answer }, () => ({
        summary: 'Your response has been saved. A connected model is needed to assess it.',
        strengths: ['You recorded an answer for review.'],
        gaps: ['Demo mode cannot determine whether the criteria are met.'],
        hint: 'Compare each claim with the criteria and include a concrete example.',
        followUp: 'Choose a different project scenario. Explain your decision, a failure mode, and how you would check the result.',
        meetsCriteria: false,
        demo: true
      }));
      if (typeof result.summary !== 'string' || !Array.isArray(result.strengths) || !Array.isArray(result.gaps) || typeof result.meetsCriteria !== 'boolean') {
        throw Error('Invalid feedback response.');
      }
      const previous = state.reviews[t.id] || {};
      state.reviews[t.id] = {
        ...previous,
        ...(follow ? { followUpAnswer: answer } : { answer }),
        feedback: result,
        followUp: result.meetsCriteria ? null : result.followUp,
        completed: config.aiConfigured && result.meetsCriteria === true
      };
      feedback = result;
      await save();
      render();
      return true;
    }

    return false;
  }

  return { page, handleAction, reset, clearFeedback };
}