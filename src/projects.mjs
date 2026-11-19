// Keep project text and its lightweight library entry in one IndexedDB transaction.
import { transact as localTransaction, requestValue } from './local-store.mjs';
const transact = localTransaction.bind(null, 'biaoheng-workspace', ['projects', 'summaries']);
const backupFormat = 'biaoheng.project';
const maxBackupLength = 16 * 1024 * 1024;
const states = ['todo', 'draft', 'ready', 'na'];
const priorities = ['critical', 'scored', 'normal'];
const textLimit = 120000;

function invalid(message) {
  throw new Error(message);
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(label + '格式有误。');
  return value;
}

function string(value, label, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    invalid(label + '为空、格式有误或超出长度限制。');
  }
  return value;
}

function member(value, allowed, label) {
  if (!allowed.includes(value)) invalid(label + '取值无效。');
  return value;
}

function integer(value, min, label) {
  if (!Number.isSafeInteger(value) || value < min) invalid(label + '无效。');
  return value;
}

function boolean(value, label) {
  if (typeof value !== 'boolean') invalid(label + '必须为布尔值。');
  return value;
}

function date(value, label) {
  if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value))) invalid(label + '无效。');
  return new Date(value).toISOString();
}

function uniqueRows(value, label, normalize) {
  if (!Array.isArray(value) || value.length > 10000) invalid(label + '格式有误或数量超出限制。');
  const ids = new Set();
  return value.map(raw => {
    const row = normalize(record(raw, label));
    if (ids.has(row.id)) invalid(label + '含有重复标识。');
    ids.add(row.id);
    return row;
  });
}

function requirement(raw) {
  const row = {
    id: string(raw.id, '条款标识', 180, true),
    title: string(raw.title, '条款标题', textLimit, true),
    category: string(raw.category, '条款分类', 128, true),
    priority: member(raw.priority, priorities, '条款优先级'),
    quote: string(raw.quote, '条款内容', textLimit, true),
    section: string(raw.section ?? '', '招标章节', textLimit),
    manual: boolean(raw.manual ?? false, '手工条款标记'),
    needsReview: boolean(raw.needsReview ?? false, '原文复核标记'),
    owner: string(raw.owner ?? '', '负责人', 250),
    status: member(raw.status ?? 'todo', states, '条款状态'),
    response: string(raw.response ?? '', '响应草稿', textLimit),
    evidence: string(raw.evidence ?? '', '证明材料', textLimit),
    sourceLocation: string(raw.sourceLocation ?? '', '材料位置', 4000),
    outlineSection: string(raw.outlineSection ?? '', '编写章节', 1000),
  };
  for (const key of ['line', 'start', 'end']) {
    row[key] = raw[key] == null ? null : integer(raw[key], key === 'line' ? 1 : 0, '原文位置');
  }
  row.page = raw.page == null ? null : integer(raw.page, 1, 'PDF 页码');
  if ((row.start == null) !== (row.end == null) || (row.start != null && row.start >= row.end)) {
    invalid('条款原文范围无效。');
  }
  return row;
}

const draftFields = ['owner', 'status', 'response', 'evidence', 'sourceLocation', 'outlineSection'];
function hasWork(row) {
  return row.status !== 'todo' || draftFields.some(key => key !== 'status' && row[key]);
}

// Carry drafts forward only when the original clause is unambiguous.
// Preserve work on superseded clauses as separate rows for human reconciliation.
export function mergeRequirements(existingRows, extractedRows) {
  const previous = uniqueRows(existingRows, '现有条款', requirement);
  const current = uniqueRows(extractedRows, '提取条款', requirement);
  const byId = new Map(previous.filter(row => !row.manual).map(row => [row.id, row]));
  const byQuote = new Map();
  const newQuoteCount = new Map();
  for (const row of current) newQuoteCount.set(row.quote, (newQuoteCount.get(row.quote) ?? 0) + 1);
  for (const row of byId.values()) {
    byQuote.set(row.quote, byQuote.has(row.quote) ? null : row);
  }
  const matched = new Set();
  const merged = current.map(row => {
    let prior = byId.get(row.id);
    if (prior?.quote !== row.quote) prior = newQuoteCount.get(row.quote) === 1 ? byQuote.get(row.quote) : null;
    if (!prior || matched.has(prior.id)) return row;
    matched.add(prior.id);
    for (const key of draftFields) row[key] = prior[key];
    return row;
  });
  const ids = new Set(merged.map(row => row.id));
  for (const row of previous) {
    if (matched.has(row.id) || (!row.manual && !hasWork(row))) continue;
    if (ids.has(row.id)) row.id = 'preserved-' + crypto.randomUUID();
    ids.add(row.id);
    if (!row.manual) {
      row.needsReview = true;
      row.line = row.start = row.end = row.page = null;
      if (row.status === 'ready' || row.status === 'na') row.status = 'draft';
    }
    merged.push(row);
  }
  return merged;
}

function finding(raw) {
  return {
    id: string(raw.id, '发现标识', 180, true),
    severity: member(raw.severity, ['high', 'medium', 'low'], '风险等级'),
    title: string(raw.title, '发现标题', textLimit, true),
    category: string(raw.category, '发现分类', 250, true),
    requirement: string(raw.requirement, '招标要求摘录', textLimit, true),
    evidence: string(raw.evidence, '投标响应摘录', textLimit),
    suggestion: string(raw.suggestion, '处置建议', textLimit, true),
  };
}

function normalize(raw) {
  record(raw, '项目');
  const names = record(raw.names, '文件名称');
  const project = {
    id: string(raw.id, '项目标识', 180, true),
    version: integer(raw.version, 0, '项目版本'),
    title: string(raw.title, '项目名称', 250, true),
    tender: string(raw.tender, '招标正文', textLimit),
    bid: string(raw.bid, '投标正文', textLimit),
    names: { tender: string(names.tender, '招标文件名', 512), bid: string(names.bid, '投标文件名', 512) },
    mode: member(raw.mode, ['local','ai'], '审核方式'),
    isSample: boolean(raw.isSample, '示例标记'),
    createdAt: date(raw.createdAt, '创建时间'),
    updatedAt: date(raw.updatedAt, '修改时间'),
    reviewedAt: raw.reviewedAt == null ? null : date(raw.reviewedAt, '审核时间'),
    requirements: uniqueRows(raw.requirements, '条款', requirement),
    findings: uniqueRows(raw.findings, '审核发现', finding),
  };
  for (const row of project.requirements) {
    if (!row.manual && !row.needsReview && (row.start == null || project.tender.slice(row.start, row.end) !== row.quote || row.end > project.tender.length)) {
      invalid('条款原文与招标文件不一致，请重新拆解或标为待复核。');
    }
  }
  for (const item of project.findings) {
    if (!project.tender.includes(item.requirement) || !project.bid.includes(item.evidence)) invalid('审核引文与项目文件不一致，请重新审核。');
  }
  return project;
}

export function createProject(input = {}) {
  const now = new Date().toISOString();
  return normalize({
    id: crypto.randomUUID(), version: 0, title: input.title ?? '未命名项目',
    tender: input.tender ?? '', bid: input.bid ?? '',
    names: { tender: input.names?.tender ?? '', bid: input.names?.bid ?? '' },
    mode: input.mode ?? 'local', isSample: input.isSample ?? false,
    createdAt: now, updatedAt: now, reviewedAt: input.reviewedAt ?? null,
    requirements: input.requirements ?? [], findings: input.findings ?? [],
  });
}

function serialize(project) {
  const json = JSON.stringify({ format: backupFormat, schemaVersion: 1, project });
  if (json.length > maxBackupLength) invalid('项目过大，无法作为单个项目保存，请拆分标段或缩短草稿。');
  return json;
}

export function exportBackup(project) {
  return serialize(normalize(project));
}

export function importBackup(text) {
  if (typeof text !== 'string' || text.length > maxBackupLength) invalid('备份文件过大或格式有误。');
  let envelope;
  try { envelope = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { invalid('无法读取项目备份，请选择完整的 JSON 文件。'); }
  if (envelope?.format !== backupFormat || envelope.schemaVersion !== 1) invalid('不支持的项目备份格式或版本。');
  const original = normalize(envelope.project);
  return createProject(original);
}

function summary(project) {
  return { id: project.id, version: project.version, title: project.title, updatedAt: project.updatedAt,
    isSample: project.isSample, requirementCount: project.requirements.length,
    readyCount: project.requirements.filter(row => row.status === 'ready' && !row.needsReview).length,
    naCount: project.requirements.filter(row => row.status === 'na' && !row.needsReview).length,
    findingCount: project.findings.length, reviewedAt: project.reviewedAt };
}

function conflict() {
  const error = new Error('项目已在其他页面更新或删除。本页修改仍可导出备份，请重新打开最新版本。');
  error.code = 'conflict';
  throw error;
}

export async function getProject(id) {
  return transact('projects', 'readonly', async tx => (await requestValue(tx.objectStore('projects').get(id))) ?? null);
}

export async function listProjects() {
  const rows = await transact('summaries', 'readonly', async tx => requestValue(tx.objectStore('summaries').getAll()));
  return rows.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title, 'zh-CN'));
}

export async function saveProject(project) {
  const next = normalize(project);
  const expected = next.version;
  next.version++;
  next.updatedAt = new Date().toISOString();
  serialize(next);
  return transact(['projects','summaries'], 'readwrite', async tx => {
    const index = tx.objectStore('summaries');
    const previous = await requestValue(index.get(next.id));
    if (expected === 0 ? !!previous : previous?.version !== expected) conflict();
    tx.objectStore('projects').put(next);
    index.put(summary(next));
    return next;
  });
}

export async function deleteProject(id, version) {
  integer(version, 1, '项目版本');
  return transact(['projects','summaries'], 'readwrite', async tx => {
    const index = tx.objectStore('summaries');
    const previous = await requestValue(index.get(id));
    if (previous?.version !== version) conflict();
    tx.objectStore('projects').delete(id);
    index.delete(id);
  });
}
