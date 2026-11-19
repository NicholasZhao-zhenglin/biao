import test from 'node:test';
import assert from 'node:assert/strict';
import { materialContent, exportMaterials, parseMaterials, isExpired, materialLocation } from '../src/material-store.mjs';

const sample = { title:'运维合同验收函', category:'项目业绩', source:'验收记录.pdf，第 4 页', expiresOn:'2028-02-29', body:'项目交付范围含系统运维。' };

test('库备份仅含材料摘录和来源，恢复数据验证通过', () => {
  const backup = exportMaterials([{...sample, id:'abc', version:9, binary:'pretend-file'}]);
  assert.deepEqual(parseMaterials(backup),[sample]);
  assert.ok(!backup.includes('pretend-file'));
  assert.match(materialLocation(sample),/验收记录.pdf，第 4 页/);
});

test('无效日期、无来源、正文过长以及错误的备份种类会报错', () => {
  assert.throws(()=>materialContent({...sample,expiresOn:'2027-02-29'}), /有效期/);
  assert.throws(()=>materialContent({...sample,source:' '}), /来源/);
  assert.throws(()=>materialContent({...sample,body:'字'.repeat(30001)}), /摘录/);
  assert.throws(()=>parseMaterials('{"format":"biaoheng.project"}'), /材料库/);
});

test('有效期按使用者当地自然日判断，当天仍有效', () => {
  const now = new Date(2026, 0, 3, 23, 59);
  assert.equal(isExpired('2026-01-03',now),false);
  assert.equal(isExpired('2026-01-02',now),true);
  assert.equal(isExpired('',now),false);
});
