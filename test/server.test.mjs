import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from '../server.mjs';

async function launch(t, config, fetcher) {
  const server = createServer(config, fetcher);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return 'http://127.0.0.1:' + server.address().port;
}

const config = { baseUrl: 'https://model.example/v1', key: 'test-only', model: 'test-model' };
const docs = { tender: '交付期限为30天。', bid: '承诺交付期限为45天。' };
const finding = { title: '交付期限超出要求', category: '工期', severity: 'high', requirement: docs.tender, evidence: docs.bid, suggestion: '核对排期并确认能否在30天内交付。' };
const post = (url, body) => fetch(url + '/api/review', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const completion = findings => Response.json({ choices: [{ message: { content: JSON.stringify({ findings }) } }] });

test('无密钥时仅启用本地审核，私有配置不作为静态资源提供', async t => {
  const url = await launch(t);
  assert.deepEqual(await (await fetch(url + '/api/status')).json(), { ai: false });
  assert.equal((await post(url, docs)).status, 503);
  assert.equal((await fetch(url + '/.env')).status, 404);
});

test('模型接收两份正文，返回可逐字对应的原文', async t => {
  const url = await launch(t, config, async (endpoint, options) => {
    assert.equal(endpoint.href, 'https://model.example/v1/chat/completions');
    const request = JSON.parse(options.body);
    assert.deepEqual(JSON.parse(request.messages.at(-1).content), docs);
    return completion([finding]);
  });
  assert.deepEqual(await (await fetch(url + '/api/status')).json(), { ai: true });
  const result = await post(url, docs);
  assert.equal(result.status, 200);
  assert.deepEqual((await result.json()).findings, [{ ...finding, id: 'ai-1' }]);
});

test('拒绝不存在的引文，避免将故障或编造误报成审核结果', async t => {
  const url = await launch(t, config, () => completion([{ ...finding, evidence: '承诺交付期限为90天。' }]));
  const result = await post(url, docs);
  assert.equal(result.status, 502);
  assert.match((await result.json()).error, /引证/);
});

test('空文档和过长文档在提交给模型前返回错误', async t => {
  let calls = 0;
  const url = await launch(t, config, () => { calls++; return completion([]); });
  assert.equal((await post(url, { ...docs, bid: ' ' })).status, 400);
  assert.equal((await post(url, { ...docs, tender: '示'.repeat(60001) })).status, 413);
  assert.equal(calls, 0);
});
