import { sample, review } from './review.mjs';
import { extractRequirements } from './requirements.mjs';
import {
  createProject,
  getProject,
  listProjects,
  saveProject,
  deleteProject,
  mergeRequirements,
  exportBackup,
  importBackup,
} from './projects.mjs';
import { mountMatchPanel } from './match-panel.mjs';
import {
  esc,
  icon,
  btn,
  views,
  groupName,
  statusLabels,
  priorityLabels,
  dateText,
  projectHeader,
  matrixView,
  matrixRows,
  filteredRows,
  rowInspector,
  writingView,
  reviewView,
  activeChecklist,
} from './views.mjs';
import {
  $,
  openModal,
  closeModal,
  notify,
  errMessage,
  cancel,
  fileEditor,
  fileRoles,
  readFile,
  showSource,
  pageAt,
  sparseText,
  manualForm,
  download,
  csv,
  report,
} from './dialogs.mjs';

let p,
  ai = false,
  view = 'matrix',
  rowId = '',
  risk = '',
  findingId = '';
let state, activeController, pendingAI, pendingDelete;
let saveTimer,
  writingSave,
  revision = 0,
  committed = 0,
  saveError = '';
let fileMode;
const dialog = $('#dialog');
document.querySelectorAll('[data-icon]').forEach((node) => (node.outerHTML = icon(node.dataset.icon)));
function currentRow() {
  return p?.requirements.find((row) => row.id === rowId);
}
function resetFilters() {
  state = { search: '', category: '', status: '', priority: '', check: '', page: 0 };
  risk = '';
  findingId = '';
}
function setIndicator(text, kind = '') {
  const el = $('#save-status');
  el.className = 'save-status ' + kind;
  el.textContent = text;
}
function changed() {
  revision++;
  clearTimeout(saveTimer);
  setIndicator('待自动保存', 'pending');
  saveTimer = setTimeout(() => flush().catch(() => {}), 260);
}
async function flush() {
  clearTimeout(saveTimer);
  if (writingSave) return writingSave;
  if (!p || committed === revision) return;
  writingSave = (async () => {
    try {
      setIndicator('正在保存…', 'pending');
      while (committed !== revision) {
        const source = p,
          nextRevision = revision;
        const saved = await saveProject(source);
        if (p !== source) return;
        source.version = saved.version;
        source.updatedAt = saved.updatedAt;
        committed = nextRevision;
      }
      saveError = '';
      setIndicator('已自动保存 · 本机', 'saved');
    } catch (error) {
      saveError = error.message || '无法写入本机项目库';
      setIndicator('保存失败 · 查看处理', 'error');
      throw error;
    }
  })().finally(() => {
    writingSave = null;
  });
  return writingSave;
}
function remember(id) {
  try {
    localStorage.setItem('biaoheng.active-project', id);
  } catch {}
}
function activate(project, section = 'matrix') {
  p = project;
  view = section;
  rowId = p.requirements[0]?.id || '';
  resetFilters();
  revision = committed = 0;
  saveError = '';
  remember(p.id);
  setIndicator('已自动保存 · 本机', 'saved');
  render();
}
function render() {
  document.querySelectorAll('[data-view]').forEach((el) => {
    el.classList.toggle('active', el.dataset.view === view);
    if (el.dataset.view === view) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  $('#breadcrumb').textContent = views[view] || '项目库';
  if (!p) {
    $('#workspace').innerHTML =
      '<section class="surface empty-action">' +
      icon('projects') +
      '<h1>创建投标项目</h1><p>从招标文件开始拆解要求，也可以从项目备份恢复工作。</p><div>' +
      btn('new', '新建项目', 'primary', 'add') +
      btn('restore', '导入备份', 'btn', 'up') +
      '</div></section>';
    return;
  }
  $('#workspace').innerHTML =
    projectHeader(p) +
    (view === 'matrix'
      ? matrixView(p, state)
      : view === 'writing'
        ? writingView(p, rowId)
        : reviewView(p, risk, findingId));
  if (view === 'matrix') renderRows();
  if (view === 'writing') renderInspector();
}
function renderRows() {
  const rows = filteredRows(p, state);
  state.page = Math.min(state.page, Math.max(0, Math.ceil(rows.length / 12) - 1));
  if (!rows.slice(state.page * 12, (state.page + 1) * 12).some((r) => r.id === rowId))
    rowId = rows[state.page * 12]?.id || '';
  $('#matrix-rows').innerHTML = activeChecklist(state) + matrixRows(rows, rowId, state.page);
  renderInspector();
}
function renderInspector() {
  const row = currentRow(),
    target = $('#row-detail');
  target.innerHTML = rowInspector(row, view === 'writing', ai);
  if (!row) return;
  const page = pageAt(p.tender, row.start ?? p.tender.indexOf(row.quote));
  if (page) target.querySelector('.quote-panel small').append(' · ' + page);
  const container = document.createElement('div');
  container.id = 'evidence-match';
  target.querySelector('.fields').before(container);
  if (row.needsReview && row.status === 'na') {
    const notice = target.querySelector('.notice');
    notice.textContent = '该旧版条款已标记不适用，保留在内部矩阵中。';
  }
  mountMatchPanel(container, {
    quote: row.quote,
    bid: p.bid,
    aiAvailable: ai,
    onUse: (excerpt, location) => {
      if (currentRow() !== row || !container.isConnected) return;
      for (const [key, value] of [
        ['evidence', excerpt],
        ['sourceLocation', location],
      ]) {
        if (value && !row[key].includes(value))
          row[key] = [row[key], value].filter(Boolean).join(key === 'sourceLocation' ? '；' : '\n');
        target.querySelector('[data-field="' + key + '"]').value = row[key];
      }
      changed();
      notify('已添加证据及其位置');
    },
  });
}
function updateListing() {
  if (view === 'matrix') {
    const rows = filteredRows(p, state);
    $('#matrix-rows').innerHTML = activeChecklist(state) + matrixRows(rows, rowId, state.page);
  }
}
function edit(field, value) {
  const row = currentRow();
  if (!row) return;
  if (field === 'status' && value === 'na' && !row.evidence.trim()) {
    notify('请先在事实与证明材料中记录不适用理由。');
    $('[data-field="status"]').value = row.status;
    return;
  }
  if (field === 'evidence' && row.status === 'na' && !value.trim()) {
    row.status = 'todo';
    $('[data-field="status"]').value = 'todo';
  }
  if (field === 'status' && value === 'ready' && (!row.response.trim() || row.needsReview)) {
    notify(row.needsReview ? '请先更新原文定位，再标记已复核。' : '请先填写响应正文，再标记已复核。');
    $('[data-field="status"]').value = row.status;
    return;
  }
  if (field === 'response' && row.response !== value && row.status === 'ready') {
    row.status = 'draft';
    $('[data-field="status"]').value = 'draft';
  }
  row[field] = value;
  changed();
  updateListing();
  const header = document.createElement('div');
  header.innerHTML = projectHeader(p);
  $('.project-hero').replaceWith(header.firstElementChild);
  if (field === 'status') render();
  else if (field === 'outlineSection' && view === 'writing') {
    const host = document.createElement('div');
    host.innerHTML = writingView(p, rowId);
    $('.outline').replaceWith(host.querySelector('.outline'));
  }
}
async function openLibrary() {
  await flush();
  const items = await listProjects();
  const rows = items
    .map(
      (item) =>
        '<article class="library-row"><button data-action="open-project" data-id="' +
        esc(item.id) +
        '">' +
        icon('projects') +
        '<span><b>' +
        esc(item.title) +
        '</b><small>' +
        item.requirementCount +
        ' 项条款 · ' +
        item.readyCount +
        ' 项已复核 · ' +
        dateText(item.updatedAt) +
        '</small></span></button><button class="link danger" data-action="delete" data-id="' +
        esc(item.id) +
        '" data-version="' +
        item.version +
        '">删除</button></article>',
    )
    .join('');
  openModal(
    '项目库',
    rows || '<p>尚无保存的项目。</p>',
    btn('restore', '导入项目备份', 'btn', 'up') + btn('new', '新建项目', 'primary', 'add'),
  );
}
function openFiles() {
  if (!p) return openLibrary();
  openModal(
    '项目文件',
    Object.entries(fileRoles)
      .map(
        ([key, label]) =>
          '<section class="library-row"><div class="source-meta">' +
          icon('file') +
          '<span><b>' +
          label +
          '</b><small>' +
          esc(p.names[key] || (p[key] ? '粘贴正文' : '尚未添加')) +
          ' · ' +
          p[key].length.toLocaleString() +
          ' 字符</small></span></div>' +
          (p[key]
            ? '<button class="link" data-action="read-source" data-role="' + key + '">阅读原文</button>'
            : '') +
          '</section>',
      )
      .join('') +
      (sparseText(p.tender) || sparseText(p.bid)
        ? '<p class="notice">' + sparseText(p.tender + p.bid) + '</p>'
        : ''),
    btn('edit-files', '更新项目文件', 'btn', 'write') + btn('close', '完成', 'primary'),
  );
}
function fileForm(mode) {
  fileMode = mode;
  const isNew = mode === 'new',
    isReview = mode === 'review',
    reused = !isNew;
  const title = isNew ? '新建投标项目' : isReview ? '运行定稿审核' : '更新项目文件';
  const intro = isNew
    ? '上传招标文件后即可建立响应矩阵，投标文件可以稍后添加。'
    : isReview
      ? '请核对当前投标定稿。此次结果关联下方投标正文。'
      : '更换招标正文后将重建条款清单，并保留已编写的记录供核对。正文变更会清除旧的审核结果。';
  let body = '<p class="form-intro">' + intro + '</p>';
  if (!isReview)
    body +=
      '<label class="simple-field">项目名称<input id="project-name" maxlength="200" placeholder="默认使用招标文件名称" value="' +
      esc(reused ? p.title : '') +
      '"></label>' +
      fileEditor('tender', reused ? p.names.tender : '', reused ? p.tender : '');
  body += fileEditor('bid', reused ? p.names.bid : '', reused ? p.bid : '');
  if (isReview)
    body +=
      '<label class="simple-field">审核方式<select id="review-mode"><option value="local">本地规则审核</option><option value="ai" ' +
      (ai ? '' : 'disabled') +
      '>AI 模型审核' +
      (ai ? '' : '（未配置）') +
      '</option></select></label><p class="helper" id="mode-hint">本地核对量化条款与常见材料要求。</p>';
  openModal(
    title,
    body,
    cancel + btn('submit-files', isNew ? '创建并拆解条款' : isReview ? '开始审核' : '保存更新', 'primary'),
  );
}
async function jsonCall(url, body, signal) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '请求失败，请重试。');
  return result;
}
async function submitFiles(button) {
  if (button.disabled) return;
  if (document.querySelector('[data-file]:disabled')) throw new Error('请等文件读取完毕再继续。');
  const mode = fileMode,
    isNew = mode === 'new',
    isReview = mode === 'review';
  const tender = isReview ? p.tender : $('#text-tender').value.trim(),
    bid = $('#text-bid').value.trim();
  if (!tender || (isReview && !bid))
    throw new Error(isReview ? '请提供完整的投标文件正文。' : '请上传招标文件或粘贴招标正文。');
  const reviewMode = $('#review-mode')?.value || 'local';
  const limit = reviewMode === 'ai' ? 60000 : 120000;
  if (Math.max(tender.length, bid.length) > limit)
    throw new Error('当前模式每份正文限 ' + limit.toLocaleString() + ' 字符，请选择对应标段或章节。');
  const title =
    $('#project-name')?.value.trim() || $('#name-tender')?.dataset.name || (isNew ? '未命名项目' : p.title);
  const names = {
    tender: isReview ? p.names.tender : $('#name-tender').dataset.name || '粘贴的招标正文',
    bid: bid ? $('#name-bid').dataset.name || '粘贴的投标正文' : '',
  };
  const controller = new AbortController();
  activeController = controller;
  const fields = $('#dialog-content').querySelectorAll('input,textarea,select,[data-action="submit-files"]');
  const label = button.textContent;
  fields.forEach((el) => (el.disabled = true));
  button.textContent = isReview ? '正在审核…' : '保存中…';
  try {
    await flush();
    if (controller.signal.aborted) return;
    if (isNew) {
      const item = createProject({ title, tender, bid, names, requirements: extractRequirements(tender) });
      activate(await saveProject(item));
      closeModal();
      notify('项目已建立，条款已拆解');
      return;
    }
    const replacedBid = Boolean(p.bid && p.bid !== bid);
    if (isReview) {
      const result =
        reviewMode === 'ai'
          ? (await jsonCall('/api/review', { tender, bid }, controller.signal)).findings
          : review(tender, bid);
      if (controller.signal.aborted) return;
      Object.assign(p, {
        bid,
        names,
        findings: result,
        reviewedAt: new Date().toISOString(),
        mode: reviewMode,
      });
      view = 'review';
      risk = '';
      findingId = '';
    } else {
      if (tender !== p.tender || bid !== p.bid) {
        p.findings = [];
        p.reviewedAt = null;
      }
      if (tender !== p.tender) {
        p.requirements = mergeRequirements(p.requirements, extractRequirements(tender));
        for (const row of p.requirements.filter((r) => r.manual || r.needsReview)) {
          const offset = tender.indexOf(row.quote);
          const unique = offset >= 0 && tender.indexOf(row.quote, offset + 1) < 0;
          row.start = unique ? offset : null;
          row.end = unique ? offset + row.quote.length : null;
          row.line = unique ? tender.slice(0, offset).split('\n').length : null;
          row.needsReview = !unique;
          if (row.needsReview && row.status === 'ready') row.status = 'draft';
        }
        rowId = p.requirements[0]?.id || '';
        resetFilters();
      }
      Object.assign(p, { title, tender, bid, names });
    }
    if (replacedBid) {
      for (const row of p.requirements) {
        if (row.status === 'ready') row.status = 'draft';
      }
    }
    if (tender !== sample.tender || bid !== sample.bid) p.isSample = false;
    changed();
    await flush();
    closeModal();
    render();
    notify(
      replacedBid
        ? '投标正文已变更，原已复核条款已转为编写中，请复核其证明位置。'
        : isReview
          ? '审核结果已保存'
          : '文件已更新',
    );
  } finally {
    if (activeController === controller) activeController = null;
    if (button.isConnected) {
      fields.forEach((el) => (el.disabled = false));
      button.textContent = label;
    }
  }
}
function addRow(update = false) {
  const row = update ? currentRow() : null;
  openModal(
    update ? '更新条款原文' : '补录招标条款',
    '<p class="form-intro">从当前招标正文复制条款。系统会核对引文并记录其位置。</p>' + manualForm(row),
    cancel + btn(update ? 'save-anchor' : 'save-row', '保存条款', 'primary'),
  );
}
function saveRow(update) {
  const title = $('#manual-title').value.trim(),
    quote = $('#manual-quote').value.trim();
  if (!title || !quote) throw new Error('请填写条款标题并粘贴招标原文。');
  const offset = p.tender.indexOf(quote);
  if (offset < 0) throw new Error('引文未匹配当前招标正文，请复制原文中的连续文字。');
  if (p.tender.indexOf(quote, offset + 1) >= 0)
    throw new Error('该段文字在原文中出现多次，请包含前后相邻文字以定位。');
  const row = update
    ? currentRow()
    : {
        id: crypto.randomUUID(),
        manual: true,
        status: 'todo',
        response: '',
        evidence: '',
        sourceLocation: '',
        outlineSection: '',
        owner: '',
        section: '',
      };
  Object.assign(row, {
    title,
    quote,
    category: $('#manual-category').value,
    priority: $('#manual-priority').value,
    needsReview: false,
    start: offset,
    end: offset + quote.length,
    line: p.tender.slice(0, offset).split('\n').length,
  });
  if (!update) p.requirements.push(row);
  rowId = row.id;
  resetFilters();
  state.page = Math.floor(p.requirements.indexOf(row) / 12);
  changed();
  closeModal();
  render();
  notify('条款已保存');
}
function exportMenu() {
  openModal(
    '项目导出',
    '<div class="export-list">' +
      [
        ['docx', 'write', 'Word 响应稿', '汇总适用条款及响应。不适用、原文待重定位的条款仅保留在内部矩阵。'],
        ['csv', 'matrix', '响应矩阵 CSV', '包含负责人、状态、条款、证明材料及其位置。'],
        ['backup', 'projects', '项目备份 JSON', '保存两份正文、全部编写记录与最近一次审核，可在项目库恢复。'],
        ...(p.reviewedAt
          ? [['report', 'check', '审核报告 Markdown', '最近一次文件审核的发现、原文与建议。']]
          : []),
      ]
        .map(
          ([act, glyph, title, description]) =>
            '<button data-action="' +
            act +
            '">' +
            icon(glyph) +
            '<span><b>' +
            title +
            '</b><small>' +
            description +
            '</small></span>' +
            icon('down') +
            '</button>',
        )
        .join('') +
      '</div>',
  );
}
async function word(button) {
  if (!p.requirements.length) throw new Error('请先添加至少一项招标条款。');
  button.disabled = true;
  try {
    const entries = p.requirements
      .filter((r) => r.status !== 'na' && !r.needsReview)
      .map((r) => ({
        section: groupName(r),
        title: r.title,
        requirement: r.quote,
        response: r.response,
        evidence: r.evidence,
        owner: r.owner,
        status: r.status,
      }));
    if (!entries.length) throw new Error('没有可导出的适用条款，请先核对矩阵。');
    const response = await fetch('/api/export/docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: p.title, entries }),
    });
    if (!response.ok) {
      const msg = await response.json().catch(() => ({}));
      throw new Error(msg.error || 'Word 导出失败。');
    }
    download(await response.blob(), p.title + '-响应稿.docx');
  } finally {
    button.disabled = false;
  }
}
function exportMatrix() {
  const rows = [
    [
      '招标章节',
      '要求类别',
      '类型',
      '条款标题',
      '招标原文',
      '原文位置',
      '负责人',
      '状态',
      '编写章节',
      '响应正文',
      '事实依据',
      '证明位置',
      '原文需复核',
    ],
  ];
  for (const r of p.requirements)
    rows.push([
      r.section,
      r.category,
      priorityLabels[r.priority],
      r.title,
      r.quote,
      [pageAt(p.tender, r.start), r.line ? '第 ' + r.line + ' 行' : ''].filter(Boolean).join(' · '),
      r.owner,
      statusLabels[r.status],
      groupName(r),
      r.response,
      r.evidence,
      r.sourceLocation,
      r.needsReview ? '是' : '否',
    ]);
  download(csv(rows), p.title + '-响应矩阵.csv');
}
function showAI() {
  if (!ai) {
    openModal(
      'AI 辅助起草',
      '<p>在服务端 .env 配置 AI_BASE_URL、AI_MODEL、AI_API_KEY 并重启。启用后可基于当前条款和证明资料生成候选响应。</p>',
      btn('close', '完成', 'primary'),
    );
    return;
  }
  const row = currentRow();
  openModal(
    'AI 辅助起草',
    '<p>提交后将把当前条款、事实与证明材料、已有响应正文发送给已配置的模型。请先确认材料适合发送。</p><div class="quote-panel"><b>' +
      esc(row.title) +
      '</b><blockquote>' +
      esc(row.quote) +
      '</blockquote></div><p class="helper">生成的候选文本需人工核实，确认后才会添加到响应正文。</p>',
    cancel + btn('generate', '发送并生成', 'primary', 'sparkle'),
  );
}
async function generate(button) {
  if (button.disabled) return;
  const row = currentRow(),
    controller = new AbortController();
  activeController = controller;
  button.disabled = true;
  button.textContent = '生成中…';
  try {
    const result = await jsonCall(
      '/api/draft',
      { requirement: row.quote, evidence: row.evidence, draft: row.response },
      controller.signal,
    );
    if (controller.signal.aborted || !dialog.open) return;
    pendingAI = { rowId: row.id, text: result.draft };
    openModal(
      '确认候选响应',
      '<label class="simple-field">可编辑候选文本<textarea rows="7" id="candidate">' +
        esc(result.draft) +
        '</textarea></label>' +
        (result.gaps?.length
          ? '<div class="notice"><b>需核实或补充</b><ul>' +
            result.gaps.map((g) => '<li>' + esc(g) + '</li>').join('') +
            '</ul></div>'
          : ''),
      cancel + btn('apply-draft', row.response ? '追加到已有正文' : '采用候选正文', 'primary'),
    );
  } finally {
    if (activeController === controller) activeController = null;
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = '发送并生成';
    }
  }
}

function backup() {
  download(new Blob([exportBackup(p)], { type: 'application/json' }), p.title + '-项目备份.json');
}
function showHelp() {
  openModal(
    '工作台使用说明',
    '<div class="help-sections"><h3>读标与分工</h3><p>创建项目并导入招标文件，按章核对候选条款，在矩阵分配负责人。发现漏项时可复制招标原文补录。</p><h3>编写与复核</h3><p>在每项条款下记录响应正文、证明材料及页码。编写章节决定 Word 稿的大纲。负责人为本机记录，可用 CSV 分发分工。</p><h3>答疑与定稿</h3><p>项目文件中可更新更正后的招标正文。已编写的旧条款会保留以便核对。根据最终投标文件运行定稿审核，查看发现及引文。</p><h3>本机保存</h3><p>项目、资料保存在当前浏览器和地址下。清理浏览器数据会删除记录，请定期导出 JSON 项目备份。</p></div>',
    btn('close', '完成', 'primary'),
  );
}
async function switchProject(item) {
  await flush();
  if (!item) throw new Error('未找到该项目，请重新打开项目库。');
  activate(item);
  closeModal();
  window.scrollTo(0, 0);
}
async function materials(reuse) {
  const { openMaterials } = await import('./materials.mjs');
  const row = currentRow();
  openMaterials(
    reuse && row
      ? {
          onUse: (text, location) => {
            if (currentRow() !== row) return;
            if (text) row.evidence = [row.evidence, text].filter(Boolean).join('\n');
            if (location) row.sourceLocation = [row.sourceLocation, location].filter(Boolean).join('；');
            changed();
            renderInspector();
            notify('已引用企业材料');
          },
        }
      : {},
  );
}
async function handle(action, button) {
  const { id, role } = button.dataset;
  switch (action) {
    case 'close':
      closeModal();
      break;
    case 'projects':
      await openLibrary();
      break;
    case 'materials':
      await materials(false);
      break;
    case 'use-materials':
      await materials(true);
      break;
    case 'new':
      fileForm('new');
      break;
    case 'open-project':
      await switchProject(await getProject(id));
      break;
    case 'files':
      await openFiles();
      break;
    case 'edit-files':
      fileForm('edit');
      break;
    case 'read-source':
      showSource(p, role);
      break;
    case 'submit-files':
      await submitFiles(button);
      break;
    case 'choose':
      rowId = id;
      render();
      if (matchMedia('(max-width:900px)').matches) $('#row-detail')?.scrollIntoView({ block: 'start' });
      break;
    case 'add-row':
      addRow();
      break;
    case 'reanchor':
      addRow(true);
      break;
    case 'save-anchor':
      saveRow(true);
      break;
    case 'save-row':
      saveRow(false);
      break;
    case 'filter-status':
      state.status = id;
      state.page = 0;
      render();
      break;
    case 'checklist':
      resetFilters();
      state.check = id;
      view = 'matrix';
      render();
      break;
    case 'clear-check':
      state.check = '';
      render();
      break;
    case 'prev':
      state.page--;
      renderRows();
      break;
    case 'next':
      state.page++;
      renderRows();
      break;
    case 'source-row': {
      const r = currentRow();
      showSource(p, 'tender', r.quote, r.start ?? -1);
      break;
    }
    case 'export-menu':
      exportMenu();
      break;
    case 'docx':
      await word(button);
      break;
    case 'csv':
      exportMatrix();
      break;
    case 'backup':
      backup();
      break;
    case 'restore':
      $('#restore-file').click();
      break;
    case 'delete': {
      pendingDelete = { id, version: Number(button.dataset.version) };
      const name = button.closest('article').querySelector('b').textContent;
      openModal(
        '删除项目',
        '<p>将从本机项目库删除「' +
          esc(name) +
          '」及其条款、草稿和审核记录。已有 JSON 备份可以重新导入。</p>',
        btn('projects', '取消') + btn('delete-confirm', '确认删除', 'danger-btn'),
      );
      break;
    }
    case 'delete-confirm': {
      if (!pendingDelete) return;
      const target = pendingDelete;
      await deleteProject(target.id, target.version);
      pendingDelete = null;
      if (target.id === p?.id) {
        const next = (await listProjects())[0];
        if (next) activate(await getProject(next.id));
        else {
          p = null;
          remember('');
          render();
          setIndicator('本机项目库', 'saved');
        }
      }
      closeModal();
      notify('项目已删除');
      break;
    }
    case 'review-run':
      fileForm('review');
      break;
    case 'risk':
      risk = id;
      findingId = '';
      render();
      break;
    case 'finding':
      findingId = id;
      render();
      break;
    case 'source-finding': {
      const group = p.findings.filter((f) => !risk || risk === f.severity);
      const f = group.find((item) => item.id === findingId) || group[0];
      showSource(p, role, role === 'bid' ? f.evidence : f.requirement);
      break;
    }
    case 'report':
      report(p);
      break;
    case 'ai-draft':
      showAI();
      break;
    case 'generate':
      await generate(button);
      break;
    case 'apply-draft': {
      const row = currentRow(),
        candidate = $('#candidate').value.trim();
      if (!candidate || pendingAI?.rowId !== row.id) throw new Error('请确认候选响应内容。');
      row.response = [row.response, candidate].filter(Boolean).join('\n\n');
      row.status = 'draft';
      changed();
      pendingAI = null;
      closeModal();
      render();
      notify('候选内容已添加到响应正文');
      break;
    }
    case 'help':
      showHelp();
      break;
    case 'model-info':
      openModal(
        '模型连接',
        ai
          ? '<p>服务端已配置模型。可从条款详情选择 AI 辅助起草，在候选摘录中逐条核查，或从定稿审核选择 AI 模型审核。每次发送前可核对资料范围。</p>'
          : '<p>在项目目录将 .env.example 复制为 .env，填写 AI_BASE_URL、AI_MODEL 与 AI_API_KEY，然后重启本机服务并刷新页面。</p><p class="helper">配置完成后可使用逐条 AI 核查、基于事实资料起草响应、全文 AI 审核。</p>',
        btn('close', '完成', 'primary'),
      );
      break;
    case 'save-info':
      openModal(
        '本机保存',
        saveError
          ? '<p class="notice">' +
              esc(saveError) +
              '</p><p>修改仍保留在当前页面。可导出备份或另存为新项目。</p>'
          : '<p>每次编辑后自动保存到当前浏览器。跨电脑或清理浏览器数据前，请导出项目备份。</p>',
        (p ? btn('backup', '导出项目备份') : '') +
          (saveError ? btn('save-copy', '另存新项目', 'primary') : btn('close', '完成', 'primary')),
      );
      break;
    case 'save-copy': {
      const copy = importBackup(exportBackup(p));
      copy.title = p.title.slice(0, 180) + '（副本）';
      const saved = await saveProject(copy);
      clearTimeout(saveTimer);
      activate(saved);
      closeModal();
      notify('已另存为新项目');
      break;
    }
  }
}
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action],[data-view],.brand');
  if (!button) return;
  if (button.matches('.brand') || button.dataset.view) {
    event.preventDefault();
    view = button.dataset.view || 'matrix';
    render();
    window.scrollTo(0, 0);
    return;
  }
  handle(button.dataset.action, button).catch((error) => {
    if (error.name !== 'AbortError') errMessage(error.message || '操作失败，请重试。');
  });
});
document.addEventListener('input', (event) => {
  const el = event.target;
  if (el.id === 'search') {
    state.search = el.value;
    state.page = 0;
    renderRows();
  }
  if (el.dataset.field && el.tagName !== 'SELECT') edit(el.dataset.field, el.value);
});
document.addEventListener('change', async (event) => {
  const el = event.target;
  try {
    if (el.id === 'category' || el.id === 'priority') {
      state[el.id] = el.value;
      state.page = 0;
      renderRows();
    }
    if (el.dataset.field && el.tagName === 'SELECT') edit(el.dataset.field, el.value);
    if (el.dataset.file) await readFile(el);
    if (el.id === 'review-mode')
      $('#mode-hint').textContent =
        el.value === 'ai'
          ? '点击开始后将向配置的模型服务发送两份完整正文，每份限 60,000 字符。'
          : '本地核对量化条款与常见材料要求。';
    if (el.id === 'restore-file' && el.files[0]) {
      const file = el.files[0];
      el.value = '';
      if (file.size > 64 * 1024 * 1024) throw new Error('备份文件过大，请选择完整的项目 JSON。');
      const copy = importBackup(await file.text());
      await flush();
      await switchProject(await saveProject(copy));
      notify('已将备份恢复为独立项目');
    }
  } catch (error) {
    errMessage(error.message);
  }
});
dialog.addEventListener('close', () => {
  activeController?.abort();
  activeController = null;
  pendingAI = null;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flush().catch(() => {});
});
window.addEventListener('beforeunload', (event) => {
  if (revision !== committed) {
    event.preventDefault();
    event.returnValue = '';
  }
});
function makeSample() {
  const requirements = extractRequirements(sample.tender).map((row) => {
    const line = sample.bid
      .split('\n')
      .find((text) => /投标有效期/.test(row.quote) && text.includes('投标有效期'));
    if (line)
      return {
        ...row,
        owner: '商务组',
        response: line,
        evidence: line,
        sourceLocation: '投标函 · 有效期承诺',
        status: 'ready',
      };
    if (row.quote.includes('交付周期'))
      return {
        ...row,
        owner: '实施组',
        status: 'draft',
        response: '计划分阶段完成部署、联调和验收，交付排期待复核。',
      };
    return row;
  });
  return createProject({
    ...sample,
    isSample: true,
    requirements,
    findings: review(sample.tender, sample.bid),
    names: { tender: '能源管理平台采购招标文件（示例）', bid: '能源管理平台投标文件（示例）' },
    reviewedAt: new Date().toISOString(),
  });
}
async function init() {
  resetFilters();
  try {
    const items = await listProjects();
    let key = null;
    try {
      key = localStorage.getItem('biaoheng.active-project');
    } catch {}
    if (items.length) activate(await getProject((items.find((item) => item.id === key) || items[0]).id));
    else if (key === '') {
      render();
      setIndicator('本机项目库', 'saved');
    } else activate(await saveProject(makeSample()));
  } catch (error) {
    activate(makeSample());
    revision++;
    saveError = error.message;
    setIndicator('保存失败 · 查看处理', 'error');
    notify('本机存储不可用，可从导出菜单备份当前项目。');
  }
  try {
    const response = await fetch('/api/status');
    ai = response.ok && (await response.json()).ai === true;
    $('#model-status').innerHTML = icon('sparkle') + (ai ? 'AI 已配置' : 'AI 未配置');
    if (
      ai &&
      !document.activeElement?.matches('input,textarea,select') &&
      (view === 'matrix' || view === 'writing')
    )
      renderInspector();
  } catch {}
}
init();
