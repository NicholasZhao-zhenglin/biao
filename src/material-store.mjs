import { transact, requestValue } from './local-store.mjs';

export const categories = ['企业资质', '项目业绩', '人员证明', '产品技术', '其他材料'];
const transactMaterials = transact.bind(null, 'biaoheng-materials', ['materials'], 'materials');
const sizeLimit = 16 * 1024 * 1024;
const contentKeys = ['title','category','source','expiresOn','body'];

function clean(value, label, limit, required = true) {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) throw new Error('请检查' + label + '内容及长度。');
  return value.trim();
}

export function materialContent(input) {
  if (!input || typeof input !== 'object') throw new Error('材料格式无效。');
  const title = clean(input.title, '材料名称', 180);
  if (!categories.includes(input.category)) throw new Error('请选择有效的材料类型。');
  const source = clean(input.source, '来源文件或位置', 2000);
  const expiresOn = clean(input.expiresOn ?? '', '有效期', 10, false);
  if (expiresOn) {
    const time = Date.parse(expiresOn + 'T12:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || !Number.isFinite(time) || new Date(time).toISOString().slice(0,10) !== expiresOn) throw new Error('有效期需填写存在的年月日。');
  }
  return { title, category:input.category, source, expiresOn, body:clean(input.body,'选定的材料摘录（最多 30,000 字符）',30000) };
}

export function isExpired(expiresOn, now = new Date()) {
  const today = [now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-');
  return Boolean(expiresOn && expiresOn < today);
}

export function materialLocation(item) {
  return item.title + ' · ' + item.source + (item.expiresOn ? '（有效期至 '+item.expiresOn+(isExpired(item.expiresOn)?'，已过期':'')+'）' : '');
}

export async function listMaterials() {
  const rows = await transactMaterials('readonly',async tx => requestValue(tx.objectStore('materials').getAll()));
  return rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}

export function exportMaterials(rows) {
  const json = JSON.stringify({format:'biaoheng.materials', schemaVersion:1, materials:rows.map(materialContent)});
  if (json.length > sizeLimit || rows.length > 5000) throw new Error('材料库超过容量上限，请拆分材料或减少摘录长度。');
  return json;
}

export function parseMaterials(text) {
  if (typeof text !== 'string' || text.length > sizeLimit) throw new Error('材料备份过大。');
  let data;
  try { data = JSON.parse(text.replace(/^\uFEFF/,'')); } catch { throw new Error('材料备份不是有效的 JSON 文件。'); }
  if (data?.format !== 'biaoheng.materials' || data.schemaVersion !== 1 || !Array.isArray(data.materials) || data.materials.length > 5000) throw new Error('请选择企业材料库导出的 JSON 备份。');
  return data.materials.map(materialContent);
}

function sameVersion(previous, expected) {
  if (previous?.version !== expected) throw new Error('此材料已在其他页面更新或删除。请返回清单，重新核对后保存。');
}

export async function saveMaterial(input, existing = null) {
  const content = materialContent(input);
  return transactMaterials('readwrite', async tx => {
    const store = tx.objectStore('materials');
    const rows = await requestValue(store.getAll());
    if (existing) sameVersion(rows.find(row=>row.id === existing.id), existing.version);
    const item = { ...content, id:existing?.id ?? crypto.randomUUID(), version:(existing?.version ?? 0)+1, updatedAt:new Date().toISOString() };
    exportMaterials([...rows.filter(row=>row.id !== item.id),item]);
    store.put(item);
    return item;
  });
}

export async function deleteMaterial(item) {
  return transactMaterials('readwrite',async tx => {
    const store = tx.objectStore('materials');
    sameVersion(await requestValue(store.get(item.id)), item.version);
    store.delete(item.id);
  });
}

// Restore a backup by adding distinct entries, leaving existing copies and referenced snapshots intact.
export async function restoreMaterials(text) {
  const incoming = parseMaterials(text);
  return transactMaterials('readwrite',async tx => {
    const store = tx.objectStore('materials');
    const current = await requestValue(store.getAll());
    const fingerprint = item => JSON.stringify(contentKeys.map(key=>item[key]));
    const known = new Set(current.map(fingerprint));
    const added = [];
    for (const item of incoming) {
      const key = fingerprint(item);
      if (known.has(key)) continue;
      known.add(key);
      added.push({...item, id:crypto.randomUUID(),version:1,updatedAt:new Date().toISOString()});
    }
    exportMaterials([...current,...added]);
    for (const row of added) store.add(row);
    return {added:added.length, skipped:incoming.length-added.length};
  });
}
