export const sample = {
  title: '滨江产业园综合能源管理平台采购项目',
  tender: `滨江产业园综合能源管理平台采购项目
招标文件（演示样本）

第一章　采购范围
本项目采购园区综合能源管理平台一套，包含数据采集、能耗监测、统计分析及现场部署服务。

第二章　投标人须知
2.1 本项目最高投标限价为人民币185万元，含税。
2.2 投标有效期自开标之日起不少于90日历天。

第三章　实施与验收
3.1 自合同签订之日起，交付周期不得超过60日历天。
3.2 验收内容包括平台功能测试、数据接入测试及操作文档移交。

第四章　售后与培训
4.1 自项目验收之日起，免费质保期不得少于36个月。
4.2 投标文件须附培训计划，列明培训对象、课程安排和授课时长。`,
  bid: `滨江产业园综合能源管理平台采购项目
投标文件（演示样本）

一、投标函
本公司响应本次园区综合能源管理平台采购需求。
本项目投标总价为人民币192万元，含税。
投标有效期自开标之日起为90日历天。

二、项目实施方案
我方提供能耗监测、分项统计、异常告警及报表功能。
自合同签订之日起，交付周期为75日历天。
项目实施分为需求调研、平台部署、联调测试及验收移交四个阶段。

三、售后服务承诺
自项目验收之日起，免费质保期为24个月。
项目服务团队提供工作日技术支持，配合完成故障排查与平台维护。`,
};

const money = {
  '元': ['CNY', 1], '千元': ['CNY', 1000],
  '万元': ['CNY', 10000], '亿元': ['CNY', 100000000],
};
const duration = {
  '日历天': ['day', 1], '日历日': ['day', 1], '自然日': ['day', 1],
  '天': ['day', 1], '日': ['day', 1], '工作日': ['working-day', 1],
  '个月': ['month', 1], '月': ['month', 1], '年': ['month', 12],
};

const metrics = [
  {
    id: 'price', category: '商务报价', field: '投标报价',
    tender: '最高投标限价|最高限价|招标控制价', bid: '投标总报价|投标总价|投标报价|报价总额|含税总价',
    units: money, maximum: true, severity: 'high', title: '报价超过最高投标限价',
    suggestion: '核对分项报价汇总、税额和报价单位，检查投标函与报价表的总价是否一致。',
  },
  {
    id: 'delivery', category: '交付工期', field: '交付周期',
    tender: '交付周期|交货期|供货期|项目工期|施工工期|工期', bid: '交付周期|交货期|供货期|项目工期|施工工期|工期',
    units: duration, maximum: true, severity: 'high', title: '交付周期超出要求',
    suggestion: '核对交付起算日和计时口径，调整实施排期后同步更新交付承诺。',
  },
  {
    id: 'warranty', category: '售后服务', field: '质保期',
    tender: '质保期|保修期|质量保证期', bid: '质保期|保修期|质量保证期',
    units: duration, maximum: false, severity: 'medium', title: '质保期短于要求',
    suggestion: '核对质保服务的覆盖范围和起算时间，补充相应的服务期限承诺。',
  },
  {
    id: 'validity', category: '商务条款', field: '投标有效期',
    tender: '投标有效期', bid: '投标有效期',
    units: duration, maximum: false, severity: 'high', title: '投标有效期短于要求',
    suggestion: '核对开标日期和有效期起算日，检查投标函中的承诺期限。',
  },
];

const materials = [
  ['training', '培训计划', /培训计划|培训方案|培训安排|培训课程表/],
  ['authorization', '授权委托书', /授权委托书|授权书/],
  ['deviation', '技术偏离表', /技术(?:规格)?(?:偏离|偏差)(?:响应)?表/],
];

// Keep slices of the original input for evidence, including full-width punctuation.
function clauses(text) {
  return (text.match(/[^。！？；;\r\n]+[。！？；;]?/g) || []).map(part => part.trim()).filter(Boolean);
}

const fromDate = '(?:自|从)[^,，。；:：\\d]{1,18}?(?:起|后)';
const upper = '不得超过|不能超过|不超过|不得高于|不高于|至多';
const lower = '不得少于|不少于|不低于|至少';
const specialContext = /参考|举例|例如|假设|另行|备选|可选|暂定|预计|暂估|原(?:定|报价)|预算示例|如需|若|除外|美元|港元|港币|欧元/;

function periodStart(quote) {
  const compact = quote.normalize('NFKC').replace(/\s+/g, '');
  const pattern = /(?:自|从|签订|签署|发出|收到|接到|中标|合同|协议|验收|到货|交货|交付|开标|投标截止|下单|订单)[^,。；:、\d]{0,24}?(?:之日起|之日|当日起|次日起|次日|日起|起算|起计|后)/g;
  return Array.from(compact.matchAll(pattern), match => match[0].replace(/^.*?[自从]/, '').replace(/^(?:项目|本项目)/, '')).join('|');
}

// A document-wide comparison is only meaningful for a single identifiable lot.
// Grouping independent lots requires explicit review of their section boundaries.
function lotScope(doc) {
  const text = doc.normalize('NFKC');
  const identifiers = /(?:第?([0-9零〇一二三四五六七八九十百甲乙丙丁A-Z]{1,12})\s*(?:标段|标包|合同包|包件|包(?!装|括)))|(?:(?:标段|标包|合同包|包件|采购包)(?:编号)?\s*[:：]?\s*([0-9零〇一二三四五六七八九十百甲乙丙丁A-Z]{1,12}))/g;
  return new Set(Array.from(text.matchAll(identifiers), match => match[1] || match[2]));
}

function candidate(texts, metric, side) {
  const terms = metric[side];
  const related = texts.filter(text => new RegExp(terms).test(text));
  if (!related.length) return null;
  const units = Object.keys(metric.units).sort((a, b) => b.length - a.length).join('|');
  const limit = side === 'tender' ? (metric.maximum ? upper : lower) : '';
  const qualifiers = [fromDate, '要求', '承诺', '为', '是', '人民币', ':', '¥', limit].filter(Boolean).join('|');
  const pattern = new RegExp(`(?:${terms})(?:${qualifiers})*([0-9]{1,3}(?:,[0-9]{3})+(?:\\.[0-9]+)?|[0-9]+(?:\\.[0-9]+)?)(${units})`, 'g');
  let first = null;
  let uncertain = false;
  for (const quote of related) {
    const compact = quote.normalize('NFKC').replace(/\s+/g, '');
    const matches = Array.from(compact.matchAll(pattern));
    if (matches.length !== 1 || specialContext.test(compact)) {
      uncertain = true;
      continue;
    }
    const match = matches[0];
    const suffix = compact.slice(match.index + match[0].length);
    if (/^(?:至|到|[-~—]|以上|以下|以内|左右|起|或|\/|不含|\+|零)/.test(suffix)) {
      uncertain = true;
      continue;
    }
    const [dimension, multiplier] = metric.units[match[2]];
    const value = Number(match[1].replaceAll(',', '')) * multiplier;
    if (!Number.isFinite(value) || (first && (first.value !== value || first.dimension !== dimension))) uncertain = true;
    if (first && metric.units === duration && periodStart(first.quote) !== periodStart(quote)) uncertain = true;
    if (!first) first = {quote, dimension, value};
  }
  return first && !uncertain ? first : {quote: related[0]};
}

function compare(metric, tender, bid, mixedLots) {
  const requirement = candidate(tender, metric, 'tender');
  if (!requirement) return null;
  const response = candidate(bid, metric, 'bid');
  const base = {id: metric.id, category: metric.category, requirement: requirement.quote, evidence: response?.quote || ''};
  const taxMismatch = metric.id === 'price'
    && [requirement.quote, response?.quote || ''].some(line => /不含税|未税/.test(line))
    && [requirement.quote, response?.quote || ''].some(line => /(?<!不)含税/.test(line));
  if (mixedLots) return {...base, severity: 'low', title: metric.field + '待核对', suggestion: '检测到标段或采购包信息，请先确认两段原文对应同一标段或采购包，再逐项比对。'};
  if (response && metric.units === duration && periodStart(requirement.quote) !== periodStart(response.quote)) {
    return {...base, severity: 'low', title: metric.field + '待核对', suggestion: '两段原文的期限起算表述不同，请确认起算事件和日期后再比较期限。'};
  }
  if (requirement.value === undefined || response?.value === undefined || requirement.dimension !== response.dimension || taxMismatch) {
    return {...base, severity: 'low', title: metric.field + '待核对',
      suggestion: response ? '请核对原文中的数值、单位、适用范围和条件后再判断是否满足要求。' : '在已提取的投标正文中未定位到对应字段，请核对附件、表格和其他表述。'};
  }
  const exceeds = metric.maximum ? response.value > requirement.value : response.value < requirement.value;
  return exceeds ? {...base, severity: metric.severity, title: metric.title, suggestion: metric.suggestion} : null;
}

export function review(tender, bid) {
  if (typeof tender !== 'string' || typeof bid !== 'string' || !tender.trim() || !bid.trim()) return [];
  const requirements = clauses(tender);
  const responses = clauses(bid);
  const tenderLots = lotScope(tender);
  const bidLots = lotScope(bid);
  const mixedLots = tenderLots.size > 1 || bidLots.size > 1 || tenderLots.size !== bidLots.size
    || [...tenderLots].some(lot => !bidLots.has(lot));
  const findings = metrics.map(metric => compare(metric, requirements, responses, mixedLots)).filter(Boolean);
  for (const [id, name, terms] of materials) {
    const requirement = requirements.find(line => terms.test(line) && /须|必须|应(?:当)?(?:提供|附|提交)|需(?:要)?(?:附|提供|提交)/.test(line) && !/无须|无需|不必|不需要|不须|无[需须]另/.test(line));
    if (!requirement) continue;
    const evidence = responses.find(line => terms.test(line));
    if (evidence && !/缺少|尚未|未附|未提交|未提供|不提供/.test(evidence)) continue;
    findings.push({id, title: name + '待核对', severity: 'low', category: '响应材料',
      requirement, evidence: evidence || '',
      suggestion: evidence ? '正文提及材料的提供状态，请核对对应附件。' : '未匹配到' + name + '的相关表述，请核对附件目录和扫描件，并定位对应材料。'});
  }
  const priority = {high: 0, medium: 1, low: 2};
  return findings.sort((a, b) => priority[a.severity] - priority[b.severity]);
}
