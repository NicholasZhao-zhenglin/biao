const symbols = {
  projects:
    '<rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="15" width="7" height="6" rx="1.5"/><rect x="14" y="15" width="7" height="6" rx="1.5"/>',
  matrix: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
  write: '<path d="M15 4l5 5M5 19l4-1 12-12-4-4L5 14zM3 22h17"/>',
  check: '<path d="M12 3l8 3v6c0 5-5 8-8 10-3-2-8-5-8-10V6zM8.5 12l2.5 2.5 4.5-5"/>',
  files: '<path d="M8 3h7l4 4v13H8zM15 3v5h4M5 7H4v14h10"/>',
  file: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h4"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  expand: '<path d="M12 5h7v7M19 5l-8 8M8 5H5v14h14v-3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 015.2 0c0 2-2.7 2-2.7 4.3M12 16.5h.01"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  down: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  up: '<path d="M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5"/>',
  time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>',
  sparkle: '<path d="m12 4 2.4 6 5.6 2-5.6 2-2.4 6-2.4-6L4 12l5.6-2zM19 2v4m-2-2h4"/>',
};
export const icon = (key) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + (symbols[key] || '') + '</svg>';
export const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );
export const statusLabels = { todo: '待响应', draft: '编写中', ready: '已复核', na: '不适用' };
export const priorityLabels = { critical: '重点条款', scored: '评分项', normal: '一般条款' };
export const riskLabels = { high: '高风险', medium: '中风险', low: '低风险' };
export const views = { matrix: '响应矩阵', writing: '标书编写', review: '定稿审核' };
export const groupName = (row) => row.outlineSection || row.category || '其他要求';
export const dateText = (value) =>
  value
    ? new Date(value).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '尚未审核';
export const btn = (act, label, kind = 'btn', glyph = '') =>
  '<button class="' +
  kind +
  '" data-action="' +
  act +
  '">' +
  (glyph ? icon(glyph) : '') +
  label +
  '</button>';
export const badge = (key, label) => '<span class="badge ' + esc(key) + '">' + esc(label) + '</span>';
export const options = (map, current) =>
  Object.entries(map)
    .map(
      ([value, label]) =>
        '<option value="' +
        esc(value) +
        '"' +
        (value === current ? ' selected' : '') +
        '>' +
        esc(label) +
        '</option>',
    )
    .join('');
export const note = (body) => '<p class="empty">' + esc(body) + '</p>';
export function projectHeader(project) {
  const rows = project.requirements;
  const ready = rows.filter((row) => row.status === 'ready').length;
  const draft = rows.filter((row) => row.status === 'draft').length;
  const na = rows.filter((row) => row.status === 'na').length;
  const todo = rows.length - ready - draft - na;
  const percent = rows.length > na ? Math.round((ready * 100) / (rows.length - na)) : 0;
  return (
    '<section class="project-hero"><div class="project-head"><div><div class="eyeline">' +
    icon('projects') +
    '当前投标项目' +
    (project.isSample ? '<span>示例</span>' : '') +
    '</div><h1>' +
    esc(project.title) +
    '</h1><button class="file-button" data-action="files">' +
    icon('files') +
    esc(project.names.tender || '招标正文') +
    icon('arrow') +
    '</button></div><div class="hero-actions">' +
    btn('new', '新建项目', 'btn', 'add') +
    btn('export-menu', '导出', 'primary', 'down') +
    '</div></div>' +
    '<div class="kpis"><div><label>招标条款</label><strong>' +
    rows.length +
    '</strong></div><div><label><i class="marker amber"></i>待响应</label><strong>' +
    todo +
    '</strong></div><div><label><i class="marker blue"></i>编写中</label><strong>' +
    draft +
    '</strong></div><div><label><i class="marker green"></i>已复核</label><strong>' +
    ready +
    '</strong></div><div class="kpi-progress"><div><label>适用项复核进度</label><b>' +
    percent +
    '%</b></div><div class="track"><i style="width:' +
    percent +
    '%"></i></div></div></div></section>'
  );
}
export function matrixView(p, state) {
  const categories = Object.fromEntries(
    [...new Set(p.requirements.map((r) => r.category))].map((c) => [c, c]),
  );
  return (
    '<div class="view-heading"><div><h2>响应矩阵</h2><p>对照招标原文，落实每项要求的负责人、证明材料与响应。</p></div>' +
    btn('add-row', '补录条款', 'btn', 'add') +
    '</div><div class="work-grid"><section class="surface matrix"><div class="search-line"><label class="search">' +
    icon('search') +
    '<input type="search" id="search" aria-label="搜索条款或负责人" placeholder="搜索条款或负责人" value="' +
    esc(state.search) +
    '"></label><select id="category" aria-label="筛选条款类别">' +
    options({ '': '全部类别', ...categories }, state.category) +
    '</select><select id="priority" aria-label="筛选条款类型">' +
    options({ '': '全部类型', ...priorityLabels }, state.priority || '') +
    '</select></div><div class="filter-line">' +
    Object.entries({ '': '全部', ...statusLabels })
      .map(
        ([k, v]) =>
          '<button data-action="filter-status" data-id="' +
          k +
          '" class="' +
          (k === state.status ? 'on' : '') +
          '">' +
          v +
          '<small>' +
          p.requirements.filter((r) => !k || r.status === k).length +
          '</small></button>',
      )
      .join('') +
    '</div><div id="matrix-rows"></div></section><section class="surface inspector" id="row-detail" aria-label="条款详情"></section></div>'
  );
}
const checklistLabels = { critical: '重点条款待复核', score: '评分项缺少证明', change: '原文待重新定位' };
function checklistMatch(row, key) {
  if (row.status === 'na') return false;
  if (key === 'change') return row.needsReview;
  if (key === 'critical') return row.priority === 'critical' && row.status !== 'ready';
  return key === 'score' && row.priority === 'scored' && (!row.evidence.trim() || !row.sourceLocation.trim());
}
function checklist(project) {
  const links = Object.entries(checklistLabels).map(([key, label]) => {
    const count = project.requirements.filter((r) => checklistMatch(r, key)).length;
    return '<button data-action="checklist" data-id="' + key + '">' + label + ' ' + count + '</button>';
  });
  return '<section class="review-checklist"><b>提交前待办</b>' + links.join('') + '</section>';
}
export function activeChecklist(state) {
  return state.check
    ? '<div class="check-chip">' +
        esc(checklistLabels[state.check]) +
        ' ' +
        btn('clear-check', '清除筛选', 'link') +
        '</div>'
    : '';
}
export function filteredRows(p, state) {
  const term = state.search.trim().toLowerCase();
  return p.requirements.filter(
    (row) =>
      (!state.status || row.status === state.status) &&
      (!state.priority || row.priority === state.priority) &&
      (!state.check || checklistMatch(row, state.check)) &&
      (!state.category || row.category === state.category) &&
      (!term ||
        [
          row.title,
          row.quote,
          row.owner,
          row.category,
          row.section,
          row.response,
          row.evidence,
          row.sourceLocation,
        ]
          .join(' ')
          .toLowerCase()
          .includes(term)),
  );
}
export function matrixRows(rows, active, page) {
  if (!rows.length) return note('没有匹配的条款。可更改筛选条件，或从招标原文补录。');
  const count = Math.ceil(rows.length / 12);
  const list = rows
    .slice(page * 12, (page + 1) * 12)
    .map(
      (row) =>
        '<button class="matrix-row ' +
        (active === row.id ? 'selected' : '') +
        '" data-action="choose" data-id="' +
        esc(row.id) +
        '" aria-pressed="' +
        (active === row.id) +
        '"><span class="row-main"><span class="row-tags">' +
        badge(row.priority, priorityLabels[row.priority]) +
        '<small>' +
        esc(row.category) +
        '</small></span><b>' +
        esc(row.title) +
        '</b><span class="row-ref">' +
        esc(row.section || '招标正文') +
        (row.line ? ' · 第 ' + row.line + ' 行' : '') +
        '</span></span><span class="row-owner">' +
        esc(row.owner || '未分配') +
        '</span><span>' +
        badge(row.status, statusLabels[row.status]) +
        '</span></button>',
    )
    .join('');
  return (
    '<div class="row-label"><span>招标要求</span><span>负责人</span><span>状态</span></div>' +
    list +
    '<div class="pager"><span>第 ' +
    (page * 12 + 1) +
    '–' +
    Math.min((page + 1) * 12, rows.length) +
    ' 项 / 共 ' +
    rows.length +
    ' 项</span>' +
    (count > 1
      ? '<button data-action="prev" ' +
        (!page ? 'disabled' : '') +
        '>上一页</button><b>' +
        (page + 1) +
        ' / ' +
        count +
        '</b><button data-action="next" ' +
        (page + 1 === count ? 'disabled' : '') +
        '>下一页</button>'
      : '') +
    '</div>'
  );
}
export function writingView(p, active) {
  const groups = new Map();
  for (const row of p.requirements) {
    const key = groupName(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return (
    '<div class="view-heading"><div><h2>标书编写</h2><p>按响应章节整理正文与证明材料，导出可继续编辑的 Word 稿。</p></div>' +
    btn('docx', '导出响应稿', 'btn', 'down') +
    '</div><div class="write-grid"><section class="surface outline"><h3>' +
    icon('layers') +
    '响应大纲</h3>' +
    ([...groups]
      .map(
        ([name, rows]) =>
          '<div class="chapter"><h4>' +
          esc(name) +
          '<small>' +
          rows.length +
          '</small></h4>' +
          rows
            .map(
              (row) =>
                '<button data-action="choose" data-id="' +
                esc(row.id) +
                '" class="' +
                (row.id === active ? 'selected' : '') +
                '"><i class="tiny ' +
                esc(row.status) +
                '"></i>' +
                esc(row.title) +
                '</button>',
            )
            .join('') +
          '</div>',
      )
      .join('') || note('请先在响应矩阵补录条款。')) +
    '</section><section class="surface inspector writing" id="row-detail"></section></div>'
  );
}
export function rowInspector(row, writing, aiOn) {
  if (!row) return note('选择条款以查看原文并编写响应。');
  const fields =
    '<div class="field-pair"><label>负责人<input data-field="owner" maxlength="80" placeholder="姓名或岗位" value="' +
    esc(row.owner) +
    '"></label><label>响应状态<select data-field="status">' +
    options(statusLabels, row.status) +
    '</select></label></div>';
  const body =
    '<label>响应章节<input data-field="outlineSection" maxlength="120" placeholder="' +
    esc(row.category) +
    '" value="' +
    esc(row.outlineSection) +
    '"></label><label>证明材料位置<input data-field="sourceLocation" maxlength="300" placeholder="如：技术分册第 18 页 / 附件 3" value="' +
    esc(row.sourceLocation) +
    '"></label><label>事实与证明材料（不适用时填写理由）<textarea rows="2" data-field="evidence" placeholder="摘录可核实的技术参数、资质或承诺依据">' +
    esc(row.evidence) +
    '</textarea></label><label>响应正文<textarea rows="' +
    (writing ? 8 : 4) +
    '" data-field="response" placeholder="写明如何满足本条要求，说明适用条件或偏离。">' +
    esc(row.response) +
    '</textarea></label>';
  return (
    '<div class="panel-head"><h3>' +
    icon(writing ? 'write' : 'file') +
    (writing ? '条款编写' : '条款详情') +
    '</h3>' +
    badge(row.status, statusLabels[row.status]) +
    '</div><div class="panel-body"><div class="row-tags">' +
    badge(row.priority, priorityLabels[row.priority]) +
    '<small>' +
    esc(row.category) +
    '</small>' +
    (row.manual ? '<small>人工补录</small>' : '') +
    '</div><h3 class="clause-title">' +
    esc(row.title) +
    '</h3>' +
    (row.needsReview
      ? '<div class="notice">招标文件已变更。请比对当前原文，核实条款后重新定位。' +
        btn('reanchor', '更新原文定位', 'link') +
        '</div>'
      : '') +
    '<div class="quote-panel"><div><b>招标原文</b><button data-action="source-row">查看全文 ' +
    icon('expand') +
    '</button></div><blockquote>' +
    esc(row.quote) +
    '</blockquote><small>' +
    esc(row.section || '招标正文') +
    (row.line ? ' · 第 ' + row.line + ' 行' : '') +
    '</small></div><div class="fields">' +
    fields +
    body +
    '</div><div class="editor-tools">' +
    btn('use-materials', '引用企业材料', 'btn', 'layers') +
    btn('ai-draft', 'AI 辅助起草', 'btn', 'sparkle') +
    (aiOn ? '' : '<small>需要配置模型</small>') +
    '</div></div>'
  );
}
export function reviewView(p, filter, selected) {
  const group = p.findings.filter((f) => !filter || f.severity === filter);
  const current = group.find((f) => f.id === selected) || group[0];
  const source = (role, title, quote) =>
    '<div class="quote-panel"><div><b>' +
    title +
    '</b><button data-action="source-finding" data-role="' +
    role +
    '">查看原文 ' +
    icon('expand') +
    '</button></div><blockquote>' +
    esc(quote || '未定位到对应响应，请核对附件。') +
    '</blockquote></div>';
  return (
    '<div class="view-heading"><div><h2>定稿审核</h2><p>' +
    esc(
      p.reviewedAt
        ? '上次审核 ' +
            dateText(p.reviewedAt) +
            ' · ' +
            (p.mode === 'ai' ? 'AI 模型' : '本地规则') +
            ' · ' +
            (p.names.bid || '投标正文')
        : '上传完整投标文件，对照招标要求进行最终检查。',
    ) +
    '</p></div>' +
    btn('review-run', p.reviewedAt ? '重新审核' : '开始审核', 'primary', 'check') +
    '</div>' +
    checklist(p) +
    (!p.reviewedAt
      ? '<section class="surface empty-action">' +
        icon('check') +
        '<h3>尚未运行定稿审核</h3><p>完成编写后，将完整投标文件与招标文件对照检查。</p>' +
        btn('review-run', '选择投标文件', 'btn', 'up') +
        '</section>'
      : '<div class="work-grid"><section class="surface"><div class="panel-head"><h3>审核发现 <small>' +
        p.findings.length +
        '</small></h3>' +
        btn('report', '导出报告', 'link', 'down') +
        '</div><div class="filter-line">' +
        Object.entries({ '': '全部', ...riskLabels })
          .map(
            ([key, label]) =>
              '<button class="' +
              (key === filter ? 'on' : '') +
              '" data-action="risk" data-id="' +
              key +
              '">' +
              label +
              '</button>',
          )
          .join('') +
        '</div>' +
        (group
          .map(
            (f) =>
              '<button class="finding ' +
              (f.id === current?.id ? 'selected' : '') +
              '" data-action="finding" data-id="' +
              esc(f.id) +
              '">' +
              badge(f.severity, riskLabels[f.severity]) +
              '<small>' +
              esc(f.category) +
              '</small><b>' +
              esc(f.title) +
              '</b><span>' +
              esc(f.requirement) +
              '</span></button>',
          )
          .join('') ||
          note(filter ? '当前分组没有审核发现。' : '本次未识别到风险线索，请结合完整文件复核。')) +
        '</section><section class="surface"><div class="panel-head"><h3>' +
        icon('files') +
        '证据详情</h3></div>' +
        (current
          ? '<div class="panel-body"><h3 class="clause-title">' +
            esc(current.title) +
            '</h3>' +
            source('tender', '招标要求', current.requirement) +
            source('bid', '投标响应', current.evidence) +
            '<section class="advice"><b>复核建议</b><p>' +
            esc(current.suggestion) +
            '</p></section></div>'
          : note('当前没有可显示的证据。')) +
        '</section></div>')
  );
}
