import assert from 'node:assert/strict';
import test from 'node:test';
import { extractRequirements } from '../src/requirements.mjs';

test('公开采购文件短摘录：识别 90 日历天的有效期及其 PDF 页位置', () => {
  // Source: 北京市水科学技术研究院《网络与信息系统运行维护服务》PDF 第8页、印刷第6页，13.1。
  // https://swj.beijing.gov.cn/zwgk/zfcg/zbcjgg/202505/P020250527642307970311.pdf
  const line = '13.1 投标有效期 自提交投标文件的截止之日起算 90 日历天。';
  const tender = '第二章 投标人须知\r\n【PDF 第 8 页】\r\n  ' + line;
  const [row] = extractRequirements(tender);
  assert.equal(row.quote, line);
  assert.equal(row.title, line.slice(5, -1));
  assert.equal(row.category, '商务履约');
  assert.equal(row.page, 8);
  assert.equal(row.line, 3);
  assert.equal(row.section, '第二章 投标人须知');
  assert.equal(tender.slice(row.start, row.end), line);
});

test('独立编写的多章样例：资格、评分、报价、签章与递交分开跟踪', () => {
  const tender = [
    '第一章 资格审查', '1. 企业应提供有效营业执照。',
    '第二章 报价要求', '1. 最高投标限价为180万元。',
    '第三章 技术要求', '★本系统必须支持离线部署。',
    '第四章 评审标准', '1.2 设备保障方案', '第一档：提供可执行的设备替换预案，得4分；',
    '第二档：仅给出原则性承诺，得1分；', '第三档：未响应，不得分。',
    '第五章 文件递交', '1. 投标函应加盖公章。', '2.投标文件截止时间为2026年6月1日9时。',
  ].join('\n');
  const rows = extractRequirements(tender);
  assert.deepEqual(rows.map(r => r.category), ['资格条件','报价要求','技术服务','评审评分','签章格式','递交安排']);
  assert.deepEqual(rows.map(r => r.priority), ['normal','critical','critical','scored','normal','critical']);
  assert.match(rows[3].quote, /设备保障方案/);
  assert.match(rows[3].quote, /第三档/);
  assert.ok(rows.every(row => tender.slice(row.start, row.end) === row.quote));
});

test('未勾选的备选项和空白模板不产生硬性义务，勾选组保留原文', () => {
  const tender = [
    '第一章 招标要求................................1', '目录',
    '第二章 项目须知', '投标样品递交：', '□需要，不提供投标无效。', '■不需要',
    '1. 本次是否接受联合体投标：■否 □是。',
    '□供应商必须提供授权书。', '3. 投标截止时间：____年__月__日。',
  ].join('\n');
  const rows = extractRequirements(tender);
  assert.ok(rows.every(row => row.priority !== 'critical'));
  assert.ok(rows.every(row => !row.title.includes('必须提供授权书')));
  assert.ok(rows.every(row => !row.title.includes('不提供投标无效')));
  const selected = rows.find(row => row.title.includes('联合体投标'));
  assert.equal(selected.category, '资格条件');
  assert.match(selected.title, /否/);
  assert.doesNotMatch(selected.title, /□是/);
  assert.match(selected.quote, /□是/);
});

test('跨页保留章节及引文位置，低文字页提示和标题不算要求', () => {
  const tender = '【PDF 第 2 页】\n第三章 技术要求\n1.提供符合采购技术要求的详细实施方案，\n说明部署步骤。\n【PDF 第 3 页】\n〔本页可提取文字很少，请核对原件〕\n2. 系统必须兼容离线模式。';
  const rows = extractRequirements(tender);
  assert.deepEqual(rows.map(row => row.page), [2, 3]);
  assert.equal(rows[0].quote, '1.提供符合采购技术要求的详细实施方案，\n说明部署步骤。');
  assert.ok(rows.every(row => row.section === '第三章 技术要求'));
  assert.ok(rows.every(row => tender.slice(row.start, row.end) === row.quote));
});

test('相同条款在不同章节或同章重复出现时可区分，不相关插入不改变 ID', () => {
  const line = '1. 投标人须附培训计划。';
  const body = ['第一章 通用要求',line,line,'第二章 专用要求',line].join('\n');
  const ids = extractRequirements(body).map(row => row.id);
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(extractRequirements('项目名称：演练\n'+body).map(row=>row.id), ids);
  assert.deepEqual(extractRequirements('这是一段无关的会议纪要。'), []);
});
