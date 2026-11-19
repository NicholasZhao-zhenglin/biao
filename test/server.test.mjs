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
const postJson = (url, body) => fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

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

test('模型编写仅接收当前条款、证明材料和已有草稿', async t => {
  const material = { requirement:'请提交团队业绩证明。', evidence:'附件目录第3项', draft:'' };
  const proposed = { draft:'【待补：项目名称与合同证明】', gaps:['核实合同页码'] };
  const url = await launch(t, config, (_url, options) => {
    assert.deepEqual(JSON.parse(JSON.parse(options.body).messages.at(-1).content),material);
    return Response.json({choices:[{message:{content:JSON.stringify(proposed)}}]});
  });
  const res = await postJson(url+'/api/draft',{...material,privateNotes:'不应发送'});
  assert.equal(res.status,200);
  assert.deepEqual(await res.json(),proposed);
});

test('条款级 AI 拒绝摘录以外的模型引文，本机模型可免密钥', async t => {
  const url = await launch(t, {baseUrl:'http://127.0.0.1:11434/v1',model:'local'},(_url,options)=>{
    assert.equal(options.headers.Authorization,undefined);
    return Response.json({choices:[{message:{content:JSON.stringify({assessment:'摘录支持',reason:'已找到',evidence:'不在原文'})}}]});
  });
  assert.deepEqual(await (await fetch(url+'/api/status')).json(),{ai:true});
  assert.equal((await postJson(url+'/api/check-clause',{requirement:docs.tender,evidence:docs.bid})).status,502);
});

test('无模型配置也能导出标准 Word 文档，空清单返回校验错误', async t => {
  const url = await launch(t);
  const payload = { title:'项目响应',entries:[{section:'商务',title:'交付',requirement:docs.tender,response:docs.bid}] };
  const response = await postJson(url+'/api/export/docx', payload);
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/wordprocessingml/);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.readUInt32LE(0),0x04034b50);
  assert.ok(bytes.includes(Buffer.from('word/document.xml')));
  assert.equal((await postJson(url+'/api/export/docx',{...payload,entries:[]})).status,400);
});
