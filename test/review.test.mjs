import test from 'node:test';
import assert from 'node:assert/strict';
import {review, sample} from '../src/review.mjs';

test('sample findings have traceable excerpts from both documents', () => {
  const findings = review(sample.tender, sample.bid);
  assert.deepEqual(findings.map(f => [f.id, f.severity]), [
    ['price', 'high'], ['delivery', 'high'], ['warranty', 'medium'], ['training', 'low'],
  ]);
  for (const item of findings) {
    assert.ok(item.requirement && sample.tender.includes(item.requirement));
    if (item.id === 'training') assert.equal(item.evidence, '');
    else assert.ok(item.evidence && sample.bid.includes(item.evidence));
  }
});

test('matching upper and lower bounds clear findings even when units differ', () => {
  const bid = sample.bid.replace('192万元', '1,850,000元')
    .replace('75日历天', '60日历天').replace('24个月', '3年') + '\n培训方案详见附件二。';
  assert.deepEqual(review(sample.tender, bid), []);
});

test('unrelated text does not generate sample risks', () => {
  assert.deepEqual(review('采购一批设备。', '承诺按期交付。'), []);
  assert.deepEqual(review(null, '设备'), []);
});

test('ambiguous units, alternatives and missing values prompt manual review', () => {
  for (const bid of ['交付周期为40工作日。', '交付周期为40至90日历天。', '见附件一。', '交付周期为40日历天。交付周期为90日历天。']) {
    assert.equal(review('交付周期不超过60日历天。', bid)[0].severity, 'low');
  }
});

test('ambiguous currencies and tax treatment prompt manual review', () => {
  const tender = '最高投标限价为100万元，含税。';
  for (const bid of ['投标报价为110万元，不含税。', '投标报价为110万美元。', '投标报价为110万元至120万元。']) {
    assert.equal(review(tender, bid)[0].severity, 'low');
  }
});

test('normalized full-width input retains its original quote', () => {
  const bid = '投标总价：２００万元。';
  assert.equal(review('最高限价185万元。', bid)[0].evidence, bid);
});

test('optional attachments and plain mentions are not treated as required', () => {
  assert.deepEqual(review('无需提供授权委托书。培训计划供参考。', '见正文。'), []);
});

test('differing start events and missing start events prompt manual review', () => {
  const tender = '自中标通知书发出之日起，交付周期不超过60日历天。';
  for (const bid of ['自合同签订之日起，交付周期为75日历天。', '交付周期为75日历天。']) {
    const [item] = review(tender, bid);
    assert.equal(item.severity, 'low');
    assert.match(item.suggestion, /起算/);
  }
  assert.equal(review('验收合格后，质保期为3年。', '到货后，质保期为2年。')[0].severity, 'low');
  assert.equal(review('投标有效期自开标之日起不少于90日历天。', '投标有效期自合同生效之日起为60日历天。')[0].severity, 'low');
});

test('separate or mixed lots are not compared as one scalar', () => {
  const tender = '第一标段\n最高限价为180万元。';
  assert.equal(review(tender, '第二标段\n投标总价为190万元。')[0].severity, 'low');
  assert.equal(review(tender, '投标总价为190万元。')[0].severity, 'low');
  assert.equal(review(tender, '第一标段\n投标总价为190万元。')[0].severity, 'high');
  assert.equal(review(tender + '\n第二标段\n最高限价为180万元。', '第一标段\n投标总价为190万元。')[0].severity, 'low');
});
