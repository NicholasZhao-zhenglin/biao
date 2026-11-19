// Offsets address the unmodified browser text (UTF-16), including PDF line breaks.
const sectionPattern = /^第[一二三四五六七八九十百千万零〇0-9]+[章节篇]/;
const chineseHeading = /^[一二三四五六七八九十]+[、．]/;
const numbered = /^(?:\d+(?:[.．-]\d+)*(?:[.．、](?!\d)|\s|$)|[（(][一二三四五六七八九十\d]+[)）]|[★▲])/;
const grade = /第[一二三四五六七八九十0-9]+[等档]次?[:：]/;
const score = /(?:得|加|扣|计|满分(?:为)?|最高(?:得)?|分值(?:为)?|最多(?:得)?)[0-9一二三四五六七八九十.]+分|不得分|评分(?:标准|依据|细则)[:：]|[（(]\d+(?:\.\d+)?分[)）]/;
const signing = /盖章|公章|签[署字章]|电子签名|骑缝|装订|密封|正本|副本|实质性格式|格式不得/;
const submission = /投标截止|投标文件截止|开标时间|开标地点|样品递交|递交(?:投标文件|地点|方式|截止)|提交投标文件|上传(?:电子)?投标文件|解密|送达(?:投标|地点)|获取招标文件|澄清截止/;
const price = /最高(?:投标)?限价|招标控制价|预算金额|投标报价|投标总价|开标一览表|分项报价|报价(?:表|单|唯一|不得|应)|计价(?:币种|货币)/;
const qualification = /营业执照|法人证书|资格(?:声明|证明|条件|要求)|资质(?:证书|要求|等级)|信用记录|失信被执行人|联合体|社会保障资金|财务会计制度|政府采购法.{0,4}第二十二条|依法缴纳|中小企业声明函/;
const business = /交付|交货|工期|履约|合同履行期限|服务(?:期|期限)|售后|质保|保修|投标有效期|验收|付款|支付条件|投标保证金/;
const materials = /偏离表|偏差表|授权(?:委托)?书|培训(?:计划|方案)|承诺函|证明材料|证明文件|响应表|投标函|检测报告|材料清单|附[件表]|资格声明书/;
const technical = /技术(?:参数|要求|方案|规格|指标)|技术服务|巡检|系统(?:维护|巡检)|数据备份|并发|带宽|兼容|接口|性能|部署|服务方案|实施方案|培训|响应时间|故障处理/;
const obligation = /必须|应当|须|应(?:加盖|盖章|签署|签字|密封|装订)|不得|不少于|不低于|不超过|不接受|不允许|应(?:具备|提供|提交|包括|完成|支持|填写|当|在|于|按)|需(?:提供|满足|提交|达到|附)|提供.{0,18}(?:件|函|表|证|书|计划|方案)|(?:按照?|符合|满足)(?:招标文件|采购文件|《中华人民共和国政府采购法)|验收内容包括|承诺|逐项响应|否则|至少|不多于/;
const critical = /无效投标|投标(?:将被认定为|视为|按)?无效|不予受理|不得偏离|不允许偏离|拒收|实质性要求|资格审查不合格|最高(?:投标)?限价|招标控制价/;
const metadata = /^(?:序号\s*(?:条目|审查|评审|因素|标的|项目|名称|内容)|条款号\s*条目|目录$|目\s+录$|[-―—|\s]+$)/;
const checklist = /[□■☐☑☒]/;
const checked = /[■☑☒]/;

function categoryFor(text, section) {
  if (score.test(text)) return '评审评分';
  if (/投标有效期/.test(text) && !/上传|送达/.test(text)) return '商务履约';
  if (submission.test(text)) return '递交安排';
  if (price.test(text)) return '报价要求';
  if (qualification.test(text)) return '资格条件';
  if (signing.test(text)) return '签章格式';
  if (materials.test(text)) return '响应材料';
  if (business.test(text)) return '商务履约';
  if (technical.test(text)) return '技术服务';
  if (/资格/.test(section)) return '资格条件';
  if (/采购需求|技术要求|技术规格/.test(section)) return '技术服务';
  if (/合同|商务/.test(section)) return '商务履约';
  if (/投标文件格式/.test(section)) return '签章格式';
  return '其他要求';
}

function classify(quote, section) {
  const compact = quote.normalize('NFKC').replace(/\s/g, '');
  if (compact.length < 5 || !/[\u3400-\u9fff]/.test(compact)) return;
  if (/^(?:项目名称|项目编号|招标人名称|采购代理机构|联系人|联系地址|项目联系人|电话|邮编)[:：]/.test(compact)) return;
  if (metadata.test(quote) || /\.{4,}|…{2,}/.test(compact)) return;
  // Blank form fields and unchecked options cannot establish an affirmative duty.
  const signatureField = /(?:投标人|法定代表人|授权代表).{0,14}(?:加盖公章|签字|签章)/.test(compact);
  if (/_{2,}/.test(compact) && !checked.test(compact) && !signatureField) return;
  if (checklist.test(compact) && !checked.test(compact)) return;
  const text = compact.replace(/[□☐][^□■☐☑☒]*/g, '');
  if (/(?:资格要求|特殊规定|其他要求)[:：](?:■)?无[。；;]?$/u.test(text)
      || /[:：]$/.test(text) && !/★/.test(text)) return;
  const category = categoryFor(text, section);
  const scorer = score.test(text);
  const mandatory = obligation.test(text);
  if (/(?:采购人|评标委员会|采购代理机构)(?:应当|负责|将在|应于|不得|可以)/.test(text)
      && !/(?:供应商|投标人)(?:必须|应当|须|不得|需提供)/.test(text) && !scorer) return;
  if (!mandatory && !scorer && !critical.test(text) && !signatureField) {
    // A short noun phrase is usually a table header; dates, amounts, marked
    // choices and service frequencies can establish a requirement on their own.
    const fieldValue = /[:：].{1,}|[\d一二三四五六七八九十]+(?:年|月|天|日|小时|份|套|元|%|次)|[★■☑☒]|每天|每周|每月|每季|季度|每年|无偏离/.test(text);
    if (!fieldValue || category === '其他要求') return;
  }
  if (category === '其他要求' && !mandatory && !critical.test(text)) return;
  const priority = scorer ? 'scored' : critical.test(text) || /^(?:[\d.()（）]+)?★/.test(text)
    || (category === '递交安排' && /截止/.test(text) && /\d/.test(text)) ? 'critical' : 'normal';
  return { category, priority };
}

function titleFor(quote) {
  const selected = quote.replace(/[□☐][^□■☐☑☒]*/g, '');
  const text = selected.replace(/^(?:\d+(?:[.．-]\d+)*(?:[、.．]\s*|\s+)|[（(][一二三四五六七八九十\d]+[)）])/, '')
    .replace(/[\r\n]+\s*/g, '').replace(/\s+/g, ' ').trim()
    .replace(/^★(?!号)\s*/, '').replace(/[■☑☒]\s*/g, '').replace(/[。；;]+$/, '');
  return text.length > 54 ? text.slice(0, 53) + '…' : text;
}

function contentId(section, quote) {
  // FNV-1a over normalized text keeps IDs stable after unrelated insertions.
  let hash = 2166136261;
  for (const ch of (section + '\0' + quote).normalize('NFKC').replace(/\s/g, '')) {
    hash = Math.imul(hash ^ ch.codePointAt(0), 16777619);
  }
  return 'req-' + (hash >>> 0).toString(36);
}

function isHeading(text) {
  return text.length <= 60 && !/[。；;★■☑]|[:：].+|\.{3,}|…/.test(text)
    && (sectionPattern.test(text) || (chineseHeading.test(text) && !obligation.test(text.replace(/[（(]须同时满足[）)]/, ''))));
}

export function extractRequirements(tender) {
  if (typeof tender !== 'string' || !tender.trim()) return [];
  const rows = [];
  const ids = new Map();
  let chapter = '', subsection = '', page = null, line = 0, block = null;

  function flush() {
    if (!block) return;
    const { start, end, line: firstLine } = block;
    block = null;
    const quote = tender.slice(start, end);
    const section = [chapter, subsection].filter(Boolean).join(' / ') || '正文';
    const result = classify(quote, section);
    if (!result) return;
    const key = contentId(section, quote);
    const count = (ids.get(key) || 0) + 1;
    ids.set(key, count);
    rows.push({ id: count === 1 ? key : key + '-' + count, title: titleFor(quote),
      ...result, quote, section, line: firstLine, start, end, page });
  }

  function append(text, start, isNewLine) {
    const rubricContinues = grade.test(text) && block?.rubric;
    const optionContinues = /^[□■☐☑☒]/.test(text) && block && (block.options || /[:：]$/.test(block.last));
    const childOfStarredList = block?.starredList && /^[（(][一二三四五六七八九十\d]+[)）]/.test(text);
    if (block && !rubricContinues && !optionContinues && !childOfStarredList) {
      const boundary = numbered.test(text) || /[。！？；;]$/.test(block.last)
        || (block.options && /^(?:■|☑|☒)(?:是|否|无|不适用|不允许|不需要|不组织|不召开)$/.test(block.last))
        || (!isNewLine && !grade.test(text)) || block.end - block.start > 1600
        || (isNewLine && /(?:每天|每周|每月|季度|每年)$/.test(block.last));
      if (boundary) flush();
    }
    if (!block) block = { start, line, rubric: false, options: false };
    block.end = start + text.length;
    block.last = text;
    block.rubric ||= grade.test(text);
    block.options ||= checklist.test(text);
    block.starredList ||= /★/.test(tender.slice(block.start, block.end)) && /[:：]$/.test(text);
  }

  for (const m of tender.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)) {
    line++;
    const raw = m[0].replace(/[\r\n]+$/, '');
    const text = raw.trim();
    const start = m.index + raw.indexOf(text);
    const pageHeading = /^【PDF\s*第\s*(\d+)\s*页】$/.exec(text);
    if (pageHeading) { flush(); page = Number(pageHeading[1]); continue; }
    if (!text || /^〔本页可提取文字很少/.test(text) || /^\d{1,3}$/.test(text)
        || metadata.test(text) || /(?:\.{3,}|…{2,})\s*\d+\s*$/.test(text)) { flush(); continue; }
    if (isHeading(text)) {
      flush();
      if (sectionPattern.test(text)) { chapter = text; subsection = ''; }
      else subsection = text;
      continue;
    }
    if (grade.test(text) || checklist.test(text)) { append(text, start, true); continue; }
    let first = true;
    for (const part of text.matchAll(/[^。！？；;]+(?:[。！？；;]+|$)/g)) {
      const value = part[0].trim();
      if (value) append(value, start + part.index + part[0].indexOf(value), first);
      first = false;
    }
  }
  flush();
  return rows;
}
