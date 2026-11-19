import assert from 'node:assert/strict';
import test from 'node:test';
import {buildPassages,findPassages} from '../src/matching.mjs';

test('PDF 候选证据可逐字回溯至正确的文件页',()=>{
  const bid='【PDF 第 1 页】\n公司公章，经办人签署。\n【PDF 第 2 页】\n定期备份数据库，保留备份日志，并提供恢复演练记录。\n【PDF 第 3 页】\n门禁系统采用电子卡。';
  const result=findPassages(buildPassages(bid),'要求提供数据库备份及恢复演练方案。');
  assert.equal(result[0].page,2);
  assert.equal(result[0].text,bid.slice(result[0].start,result[0].end));
  assert.match(result[0].text,/恢复演练/);
});

test('无词项重合时不返回投标摘录',()=>{
  assert.deepEqual(findPassages(buildPassages('办公桌采购明细。'),'操作系统内核'),[]);
});
