import { sample, review } from './review.mjs';
import { extractText } from './extract.mjs';

const paths = {
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.3 9a2.7 2.7 0 015.4 0c0 2-2.7 2.1-2.7 4.2M12 16.5h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  folder: '<path d="M3 8V6a1.5 1.5 0 011.5-1.5H10l2 2H20A1.5 1.5 0 0121.5 8v10A1.5 1.5 0 0120 19.5H4.5A1.5 1.5 0 013 18zM3 9h18"/>',
  files: '<path d="M8 3h7l4 4v13H8zM15 3v5h4M5 7H4v14h10"/>',
  file: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h5"/>',
  refresh: '<path d="M20 10a8 8 0 00-14-4L3 9m0-5v5h5M4 14a8 8 0 0014 4l3-3m0 5v-5h-5"/>',
  download: '<path d="M12 3v11m-4-4 4 4 4-4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>',
  details: '<path d="M5 3h9l4 4v4M14 3v5h4M5 3v18h6M8 12h3M8 16h2"/><circle cx="16" cy="16" r="3.5"/><path d="m18.5 18.5 3 3"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  link: '<path d="M13 5h6v6M11 13l8-8M9 6H5v13h13v-4"/>',
  bulb: '<path d="M8.5 16.5c0-2-3-3.4-3-7a6.5 6.5 0 1113 0c0 3.6-3 5-3 7zM9 19h6m-5 2h4"/>',
  upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 15v4a1 1 0 001 1h14a1 1 0 001-1v-4"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  alert: '<path d="M10.5 4.8a1.7 1.7 0 013 0L21 18.3a1.4 1.4 0 01-1.2 2.1H4.2A1.4 1.4 0 013 18.3zM12 9v4.5M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 10.5v6M12 7h.01"/>',
};
const icon = name => '<svg aria-hidden="true" class="ico" viewBox="0 0 24 24">' + paths[name] + '</svg>';
document.querySelectorAll('[data-icon]').forEach(el => el.outerHTML = icon(el.dataset.icon));
const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const labels = { high: '高风险', medium: '中风险', low: '低风险' };
const roles = {tender:'招标文件', bid:'投标文件'};
const missing = '未定位到对应投标摘录，请核对完整原文。';
const initialNames = {tender:'示例招标文件', bid:'示例投标文件'};
let project = {...sample, findings:review(sample.tender, sample.bid), names:initialNames, mode:'local', isSample:true};
let filter = 'all';
let selectedId = project.findings[0]?.id;
let aiAvailable = false;
let abortReview;
let draft;
let toastTimer;
const dialog = $('#dialog');

function notify(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2600);
}

function pill(severity) {
  return '<span class="pill '+severity+'">'+icon(severity === 'low' ? 'info':'alert')+labels[severity]+'</span>';
}

function sourceQuote(role, text) {
  const title = role === 'tender' ? '招标要求' : '投标响应';
  return '<section class="quote"><div class="quote-head"><h4>'+icon('file')+title+'</h4><button class="source-link" data-action="source" data-role="'+role+'">查看原文'+icon('link')+'</button></div><blockquote>'+escape(text || missing)+'</blockquote></section>';
}

function renderFindings() {
  const group = project.findings.filter(f => filter === 'all' || f.severity === filter);
  const finding = group.find(f => f.id === selectedId) ?? group[0];
  selectedId = finding?.id;
  $('#findings').innerHTML = group.length ? group.map(f => {
    const selected = selectedId === f.id;
    return '<button class="finding '+(selected ? 'selected':'')+'" aria-pressed="'+selected+'" data-action="select" data-id="'+escape(f.id)+'"><span class="finding-top">'+pill(f.severity)+'<span>'+escape(f.category)+'</span></span><span class="finding-title">'+escape(f.title)+'</span><span class="finding-excerpt">'+escape(f.requirement)+'</span><span class="finding-arrow">'+icon('chevron')+'</span></button>';
  }).join('') : '<p class="empty">'+(filter === 'all' ? '本次未识别到风险线索，仍需结合原文复核。':'当前筛选下没有审核发现。')+'</p>';
  const header = '<div class="detail-head"><h3>'+icon('details')+'证据详情</h3>'+(finding ? '<small>'+String(project.findings.indexOf(finding)+1).padStart(2,'0')+' / '+String(project.findings.length).padStart(2,'0')+'</small>':'')+'</div>';
  $('#detail').innerHTML = header+(finding ? '<div class="detail-body"><div class="detail-title">'+pill(finding.severity)+'<h4>'+escape(finding.title)+'</h4></div>'+sourceQuote('tender', finding.requirement)+sourceQuote('bid',finding.evidence)+'<div class="advice"><h4>'+icon('bulb')+'复核建议</h4><p>'+escape(finding.suggestion)+'</p></div></div>' : '<p class="empty">选择有审核发现的分类以查看原文依据。</p>');
}

function render() {
  $('#project-title').textContent = project.title;
  $('#sample-tag').hidden = !project.isSample;
  $('#mode-label').textContent = project.mode === 'ai' ? 'AI 模型审核' : '本地规则审核';
  $('#result-count').textContent = project.findings.length;
  const counts = {all:project.findings.length};
  for (const level of Object.keys(labels)) counts[level] = project.findings.filter(f => f.severity === level).length;
  $('#stats').innerHTML = Object.entries(labels).map(([k,v]) => '<div class="stat"><strong>'+counts[k]+'</strong><small><i class="sev-dot '+k+'"></i>'+v+'</small></div>').join('');
  $('#filters').innerHTML = Object.entries({all:'全部', ...labels}).map(([k,v]) => '<button class="filter '+(filter === k ? 'selected':'')+'" aria-pressed="'+(filter === k)+'" data-action="filter" data-filter="'+k+'">'+v+'<small>'+counts[k]+'</small></button>').join('');
  renderFindings();
}

function openModal(title, body, actions = '') {
  $('#dialog-content').innerHTML = '<header class="dialog-head"><h2 id="dialog-title">'+escape(title)+'</h2><button data-action="close" class="close" aria-label="关闭">'+icon('close')+'</button></header>'+body+(actions ? '<div class="dialog-actions">'+actions+'</div>':'');
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}

let fileAnchor;
function showFiles(role = 'tender', anchor = null) {
  fileAnchor = anchor;
  const selected = project[role];
  const fragment = anchor && (role === 'bid' ? anchor.evidence : anchor.requirement);
  const start = fragment ? selected.indexOf(fragment) : -1;
  const text = start < 0 ? escape(selected) : escape(selected.slice(0,start))+'<mark>'+escape(fragment)+'</mark>'+escape(selected.slice(start+fragment.length));
  const tabs = Object.entries(roles).map(([key,label]) => '<button class="file-tab '+(key === role ? 'selected':'')+'" aria-pressed="'+(key===role)+'" data-action="file-tab" data-role="'+key+'">'+icon('file')+label+'</button>').join('');
  openModal('项目文件','<div class="dialog-body"><div class="file-tabs">'+tabs+'</div><div class="file-name">'+escape(project.names[role])+' · '+selected.length.toLocaleString('zh-CN')+' 字符</div><pre class="file-text">'+text+'</pre></div>');
  $('#dialog-content mark')?.scrollIntoView({block:'nearest'});
}

function showHelp() {
  openModal('使用说明','<div class="dialog-body"><ul class="help-list"><li><h3>准备两份文件</h3><p>点击「新建审核」，分别选择招标和投标文件，或粘贴提取后的正文。支持 TXT、DOCX 和文字版 PDF，每份上限 10 MB。扫描件可先识别为文字再粘贴。</p></li><li><h3>选择审核方式</h3><p>本地规则在浏览器内运行，核查已覆盖的条款。配置模型服务后，可选择 AI 审核并同意发送两份正文。</p></li><li><h3>复核并导出</h3><p>按风险等级筛选发现，打开「查看原文」核实摘录。「导出报告」会下载当前项目的完整审核结果。</p></li><li><h3>文件留存</h3><p>项目仅保存在当前页面，刷新后会恢复示例。建议在离开前导出报告，并由项目负责人复核最终结论。</p></li></ul></div>');
}

function editor(role) {
  return '<section class="editor"><label for="text-'+role+'">'+icon('file')+roles[role]+'</label><input type="file" data-file="'+role+'" accept=".txt,.pdf,.docx" hidden><button class="upload" data-action="upload" data-role="'+role+'">'+icon('upload')+'选择文件</button><textarea id="text-'+role+'" placeholder="或在此粘贴'+roles[role]+'正文" required></textarea><small id="name-'+role+'"></small></section>';
}

function modeHint() {
  const mode = $('#review-mode');
  if (!mode) return;
  $('#mode-hint').textContent = mode.value === 'ai' ? '选择 AI 审核并点击开始后，将向已配置的模型服务发送两份正文，每份限 60,000 字符。' : (aiAvailable ? '文件内容仅在当前浏览器内处理。' : '文件内容仅在当前浏览器内处理。配置服务端模型后可启用 AI 审核。');
}

function openEditor(reuse = false) {
  draft = {names:reuse ? {...project.names} : {tender:'',bid:''},pending:0, busy:false};
  const choices = '<option value="local">本地规则审核</option><option value="ai" '+(aiAvailable ? '':'disabled')+'>AI 模型审核'+(aiAvailable ? '' : '（未配置）')+'</option>';
  openModal(reuse ? '重新审核':'新建审核','<div class="dialog-body"><label class="field-label" for="project-name">项目名称</label><input type="text" id="project-name" placeholder="输入项目名称（选填）" maxlength="100"><div class="editor-grid">'+editor('tender')+editor('bid')+'</div><p class="helper">支持 DOCX、文字版 PDF、TXT。单份上限 10 MB，正文限 120,000 字符。</p><div class="mode-panel"><label for="review-mode" class="field-label">审核方式</label><select id="review-mode">'+choices+'</select><p id="mode-hint" class="helper"></p></div><p role="alert" id="editor-error" class="field-error"></p></div>','<button data-action="close" class="outline-btn">取消</button><button id="run" data-action="run" class="primary">开始审核</button>');
  for (const role of Object.keys(roles)) {
    if (reuse) $('#text-'+role).value = project[role];
    $('#name-'+role).textContent = draft.names[role] || '尚未选择文件';
  }
  if (reuse) $('#project-name').value = project.title;
  modeHint();
}

async function readFile(input) {
  const [file] = input.files;
  if (!file) return;
  const state = draft;
  const role = input.dataset.file;
  state.pending++;
  $('#run').disabled = true;
  const area = $('#text-'+role);
  const upload = input.nextElementSibling;
  const previousStatus = $('#name-'+role).textContent;
  upload.disabled = true;
  area.readOnly = true;
  $('#name-'+role).textContent = '正在提取 '+file.name;
  $('#editor-error').textContent = '';
  try {
    const value = await extractText(file);
    if (draft !== state) return;
    area.value = value;
    state.names[role] = file.name;
    $('#name-'+role).textContent = file.name+' · '+value.length.toLocaleString('zh-CN')+' 字符';
  } catch (error) {
    if (draft === state) {
      $('#name-'+role).textContent = previousStatus;
      $('#editor-error').textContent = roles[role]+'读取失败。'+error.message;
    }
  } finally {
    if (draft === state) {
      state.pending--;
      $('#run').disabled = state.pending > 0;
      input.value = '';
      upload.disabled = area.readOnly = false;
    }
  }
}

async function runReview() {
  if (!draft || draft.busy || draft.pending) return;
  const state = draft;
  const tender = $('#text-tender').value.trim();
  const bid = $('#text-bid').value.trim();
  const title = $('#project-name').value.trim() || state.names.tender.replace(/\.[^.]+$/,'') || '未命名审核项目';
  const mode = $('#review-mode').value;
  const error = $('#editor-error');
  if (!tender || !bid) {
    error.textContent = '请分别提供招标文件和投标文件的正文。';
    $(!tender ? '#text-tender':'#text-bid').focus();
    return;
  }
  const limit = mode === 'ai' ? 60000 : 120000;
  if (Math.max(tender.length,bid.length) > limit) {
    error.textContent = '当前模式每份正文限 '+limit.toLocaleString('zh-CN')+' 字符，请选取对应章节。';
    return;
  }
  state.busy = true;
  error.textContent = '';
  $('#dialog-content').querySelectorAll('input,textarea,select,.upload,#run').forEach(el => el.disabled = true);
  $('#run').textContent = '审核中…';
  try {
    let findings;
    if (mode === 'ai') {
      abortReview = new AbortController();
      const response = await fetch('/api/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tender,bid}),signal:abortReview.signal});
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.findings)) throw new Error(result.error || '模型响应异常，请重试。');
      findings = result.findings;
    } else {
      findings = review(tender,bid);
    }
    if (draft !== state) return;
    const names = {tender:state.names.tender || '粘贴的招标文件正文',bid:state.names.bid || '粘贴的投标文件正文'};
    project = {title,tender,bid,names,mode,findings,isSample:tender === sample.tender && bid === sample.bid};
    selectedId = findings[0]?.id;
    filter = 'all';
    render();
    dialog.close();
    notify('审核完成，共发现 '+findings.length+' 条风险线索');
  } catch (err) {
    if (draft === state && err.name !== 'AbortError') error.textContent = err.message || '审核失败，请重试。';
  } finally {
    if (draft === state && dialog.open) {
      state.busy = false;
      $('#dialog-content').querySelectorAll('input,textarea,select,.upload,#run').forEach(el => el.disabled = false);
      $('#run').textContent = '开始审核';
    }
  }
}

function downloadReport() {
  const lines = ['# '+project.title, '', '招投标文件审核报告', '', '审核方式  '+$('#mode-label').textContent, '招标文件  '+project.names.tender,'投标文件  '+project.names.bid, '审核发现  '+project.findings.length+' 条',''];
  for (const [index,f] of project.findings.entries()) {
    lines.push('## '+(index+1)+'. '+f.title,'',labels[f.severity]+' · '+f.category,'','招标要求','',f.requirement,'','投标响应','',f.evidence || missing,'','复核建议','',f.suggestion,'');
  }
  if (!project.findings.length) lines.push('本次未识别到风险线索。','');
  lines.push('本报告供项目人员复核，最终结论请结合完整文件确认。');
  const url = URL.createObjectURL(new Blob(['\uFEFF'+lines.join('\n')],{type:'text/markdown;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = project.title.replace(/[\\/:*?"<>|]/g,'_').slice(0,75)+'-审核报告.md';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url),1000);
  notify('已生成完整审核报告');
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const {action,id,role} = button.dataset;
  switch(action) {
    case 'workspace': window.scrollTo({top:0,behavior:'smooth'}); break;
    case 'new': openEditor(); break;
    case 'redo': openEditor(true); break;
    case 'files': showFiles(); break;
    case 'file-tab': showFiles(role,fileAnchor); break;
    case 'source': showFiles(role,project.findings.find(f => f.id === selectedId)); break;
    case 'help': showHelp(); break;
    case 'close': dialog.close(); break;
    case 'filter': filter = button.dataset.filter; render(); $('.filter.selected')?.focus({preventScroll:true}); break;
    case 'select':
      selectedId = id;
      renderFindings();
      $('.finding.selected')?.focus({preventScroll:true});
      if (matchMedia('(max-width:760px)').matches) $('#detail').scrollIntoView({block:'start'});
      break;
    case 'upload': $('[data-file="'+role+'"]').click(); break;
    case 'run': runReview(); break;
    case 'export': downloadReport(); break;
  }
});
dialog.addEventListener('close',() => {draft = null; abortReview?.abort(); abortReview = null;});
dialog.addEventListener('change',event => {
  if (event.target.matches('[data-file]')) readFile(event.target);
  if (event.target.id === 'review-mode') modeHint();
});
render();
fetch('/api/status').then(response => response.ok ? response.json() : {}).then(status => {
  aiAvailable = status.ai === true;
  const aiOption = $('#review-mode option[value="ai"]');
  if (aiAvailable && aiOption) {
    aiOption.disabled = false;
    aiOption.textContent = 'AI 模型审核';
    modeHint();
  }
}).catch(() => {});
