import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, exportBackup, importBackup, mergeRequirements } from '../src/projects.mjs';

const tender = '第二章\n项目须于 30 日内交付。';
const quote = tender.slice(4);
const clause = { id: 'delivery', title: '交付期限', category: '商务', priority: 'critical', quote, section: '第二章', start: 4, end: tender.length, line: 2 };

test('备份恢复为独立项目，保留草稿、负责人、材料位置和原文', () => {
  const before = createProject({ title: '测试标段', tender, requirements: [{ ...clause, owner: '李工', response: '交付计划见附件 A。', sourceLocation: '附件 A 第 2 页', status: 'draft' }] });
  before.version = 7;
  const restored = importBackup(exportBackup(before));
  assert.notEqual(restored.id, before.id);
  assert.equal(restored.version, 0);
  assert.equal(restored.tender, before.tender);
  assert.deepEqual(restored.requirements, before.requirements);
});

test('未知版本、重复 ID 和无法定位的引文不能恢复', () => {
  const before = createProject({ tender, requirements: [clause] });
  const saved = JSON.parse(exportBackup(before));
  assert.throws(() => importBackup(JSON.stringify({ ...saved, schemaVersion: 2 })), /版本/);
  saved.project.requirements.push(clause);
  assert.throws(() => importBackup(JSON.stringify(saved)), /重复/);
  saved.project.requirements.pop();
  saved.project.tender = '替换后的原文';
  assert.throws(() => importBackup(JSON.stringify(saved)), /原文/);
});

test('支持只有招标文件的项目和手工条款', () => {
  const p = createProject({ tender, requirements: [{...clause, manual:true, start:null, end:null, line:null, quote:'项目经理复核附录' }] });
  assert.equal(p.bid,'');
  assert.equal(p.reviewedAt,null);
  assert.deepEqual(importBackup(exportBackup(p)).requirements, p.requirements);
});

test('重新拆解时保留唯一同文引文的编写进度，并迁移到新的源位置', () => {
  const moved = { ...clause, id: 'moved', start: 11, end: 11 + quote.length, line: 3, section: '附表' };
  const [saved] = mergeRequirements([{...clause, owner:'王工', status:'ready', response:'按期交付', outlineSection:'技术部分'}], [moved]);
  assert.equal(saved.id,'moved');
  assert.equal(saved.start,11);
  assert.equal(saved.response,'按期交付');
  assert.equal(saved.owner,'王工');
  assert.equal(saved.outlineSection,'技术部分');
  assert.equal(saved.status,'ready');
});

test('已编写的废止条款和手工条款继续留存，变更条款需要重新确认', () => {
  const old = {...clause, owner:'王工', response:'承诺 30 日', status:'ready'};
  const updated = { ...clause, quote:'项目须于 45 日内交付。' };
  const manual = {...clause, manual:true, id:'manual', start:null, end:null};
  const rows = mergeRequirements([old,manual],[updated]);
  assert.equal(rows.length,3);
  assert.equal(new Set(rows.map(row=>row.id)).size,3);
  assert.equal(rows[0].response,'');
  assert.equal(rows[1].response,old.response);
  assert.equal(rows[1].needsReview,true);
  assert.equal(rows[1].start,null);
  assert.equal(rows[1].status,'draft');
  assert.equal(rows[2].manual,true);
});

test('重复引文与多个新条款均可能对应时，保留原草稿待人工分配', () => {
  const old = { ...clause, response:'已拟定的条款' };
  const rows = mergeRequirements([old], [{...clause, id:'b'},{...clause,id:'c'}]);
  assert.deepEqual(rows.map(row=>row.response),['','','已拟定的条款']);
  assert.equal(rows[2].needsReview,true);
});

test('审核结果的引文须与保存的文件对应', () => {
  const finding = { id:'f', title:'工期待核对', severity:'low', category:'交付', requirement:quote, evidence:'45 日', suggestion:'核对交付日期' };
  assert.throws(() => createProject({ tender, bid:'20 日', findings:[finding] }), /引文/);
  const reviewedAt = '2026-01-01T00:00:00.000Z';
  assert.equal(importBackup(exportBackup(createProject({ tender, bid:'45 日', findings:[finding],reviewedAt }))).reviewedAt,reviewedAt);
});

test('人工标注的不适用原因和 PDF 页码随项目备份恢复', () => {
  const row = {...clause, status:'na', evidence:'此条只适用于联合体。', page:3};
  const [restored] = importBackup(exportBackup(createProject({tender, requirements:[row]}))).requirements;
  assert.equal(restored.page,3);
  assert.equal(restored.status,'na');
  assert.equal(restored.evidence,row.evidence);
});
