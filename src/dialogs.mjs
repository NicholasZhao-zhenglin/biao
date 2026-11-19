import { esc, icon, btn, options, riskLabels } from './views.mjs';
import { extractText } from './extract.mjs';

export const $ = (selector) => document.querySelector(selector);
let toastTimer;
export function notify(text) {
  const toast = $('#toast');
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3600);
}
export function openModal(title, body, actions = '') {
  $('#dialog-content').innerHTML =
    '<header class="dialog-head"><h2 id="dialog-title">' +
    esc(title) +
    '</h2><button data-action="close" aria-label="关闭" class="icon-btn">' +
    icon('close') +
    '</button></header><div class="dialog-body">' +
    body +
    '</div><p id="modal-error" role="alert"></p>' +
    (actions ? '<footer class="dialog-actions">' + actions + '</footer>' : '');
  if (!$('#dialog').open) $('#dialog').showModal();
  $('#dialog').scrollTop = 0;
}
export const closeModal = () => $('#dialog').close();
export function errMessage(message) {
  const el = $('#dialog').open ? $('#modal-error') : null;
  if (el) el.textContent = message;
  else notify(message);
}
export const cancel = btn('close', '取消');
export const fileRoles = { tender: '招标文件', bid: '投标文件' };
export function pageAt(text, offset) {
  if (!Number.isInteger(offset) || offset < 0) return '';
  const pattern = /【PDF 第\s*(\d+)\s*页】/g;
  let match,
    page = '';
  while ((match = pattern.exec(text)) && match.index <= offset) page = 'PDF 第 ' + match[1] + ' 页';
  return page;
}
const sparse = '〔本页可提取文字很少，请核对原件〕';
export const sparseText = (text) =>
  text.includes(sparse) ? '部分页面可提取的文字较少，请对照原 PDF 或补充 OCR 正文。' : '';
export function showSource(p, role, quote = '', offset = -1) {
  const text = p[role];
  const start =
    offset >= 0 && text.slice(offset, offset + quote.length) === quote
      ? offset
      : quote
        ? text.indexOf(quote)
        : -1;
  const fragment =
    start < 0
      ? esc(text)
      : esc(text.slice(0, start)) + '<mark>' + esc(quote) + '</mark>' + esc(text.slice(start + quote.length));
  openModal(
    fileRoles[role] + '原文',
    '<div class="source-meta">' +
      icon('file') +
      '<b>' +
      esc(p.names[role] || fileRoles[role]) +
      '</b><span>' +
      esc(pageAt(text, start) || text.length.toLocaleString() + ' 字符') +
      '</span></div>' +
      (quote && start < 0 ? '<p class="notice">当前文件未定位到此摘录，请对照最新原文。</p>' : '') +
      (sparseText(text) ? '<p class="notice">' + sparseText(text) + '</p>' : '') +
      '<pre class="file-text">' +
      fragment +
      '</pre>',
    btn('files', '返回项目文件'),
  );
  $('mark')?.scrollIntoView({ block: 'nearest' });
}
export function fileEditor(role, name, text) {
  return (
    '<section class="file-edit"><div><label for="text-' +
    role +
    '">' +
    fileRoles[role] +
    (role === 'bid' ? ' <small>· 可稍后添加</small>' : '') +
    '</label><label class="upload" tabindex="0">' +
    icon('up') +
    '选择文件<input type="file" accept=".txt,.docx,.pdf" data-file="' +
    role +
    '" class="file-input"></label></div><textarea id="text-' +
    role +
    '" placeholder="上传文件或粘贴' +
    fileRoles[role] +
    '正文">' +
    esc(text) +
    '</textarea><small id="name-' +
    role +
    '" data-name="' +
    esc(name) +
    '">' +
    esc(name || '支持 TXT、DOCX、文字型 PDF；单份 10 MB') +
    '</small><small class="scan-note" id="scan-' +
    role +
    '">' +
    esc(sparseText(text)) +
    '</small></section>'
  );
}
export async function readFile(input) {
  const file = input.files?.[0],
    role = input.dataset.file;
  if (!file) return;
  const area = $('#text-' + role),
    state = $('#name-' + role),
    prior = state.textContent;
  area.readOnly = input.disabled = true;
  state.textContent = '正在读取 ' + file.name;
  try {
    const text = await extractText(file);
    if (!input.isConnected) return;
    area.value = text;
    state.dataset.name = file.name;
    state.textContent = file.name + ' · ' + text.length.toLocaleString() + ' 字符';
    $('#scan-' + role).textContent = sparseText(text);
    errMessage('');
  } catch (error) {
    if (input.isConnected) {
      state.textContent = prior;
      errMessage(error.message);
    }
  } finally {
    input.disabled = area.readOnly = false;
    input.value = '';
  }
}
export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = name.replace(/[\\/:*?"<>|]/g, '_');
  link.href = url;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
export function csv(rows) {
  const cells = rows.map((row) =>
    row
      .map((val) => {
        let text = String(val ?? '');
        if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
        return '"' + text.replaceAll('"', '""') + '"';
      })
      .join(','),
  );
  return new Blob(['\uFEFF', cells.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}
export function report(p) {
  const text = [
    '# ' + p.title,
    '',
    '定稿审核报告',
    '',
    '审核方式：' + (p.mode === 'ai' ? 'AI 模型' : '本地规则'),
    '审核时间：' + p.reviewedAt,
    '招标文件：' + p.names.tender,
    '投标文件：' + p.names.bid,
    '',
    '审核发现 ' + p.findings.length + ' 项',
    '',
  ];
  for (const f of p.findings)
    text.push(
      '## ' + f.title,
      '',
      riskLabels[f.severity] + ' · ' + f.category,
      '',
      '招标原文',
      f.requirement,
      '',
      '投标响应',
      f.evidence || '未定位到对应响应，请核对附件。',
      '',
      '复核建议',
      f.suggestion,
      '',
    );
  text.push('请根据原件、澄清和附件复核最终结论。');
  download(
    new Blob(['\uFEFF', text.join('\n')], { type: 'text/markdown;charset=utf-8' }),
    p.title + '-审核报告.md',
  );
}
export function manualForm(row, quote = '') {
  const categories = [
    '资格条件',
    '报价要求',
    '技术服务',
    '商务履约',
    '评审评分',
    '签章格式',
    '递交安排',
    '响应材料',
    '其他要求',
  ];
  return (
    '<div class="fields"><label>条款标题<input id="manual-title" maxlength="220" value="' +
    esc(row?.title) +
    '" placeholder="如：项目经理资格证明"></label><label>招标文件原文<textarea id="manual-quote" rows="5" placeholder="从当前招标文件复制完整条款">' +
    esc(quote || row?.quote) +
    '</textarea></label><div class="field-pair"><label>条款类别<select id="manual-category">' +
    options(Object.fromEntries(categories.map((c) => [c, c])), row?.category || '其他要求') +
    '</select></label><label>条款类型<select id="manual-priority">' +
    options({ normal: '一般条款', critical: '重点条款', scored: '评分项' }, row?.priority || 'normal') +
    '</select></label></div></div>'
  );
}
