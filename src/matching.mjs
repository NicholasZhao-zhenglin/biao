// The index is scoped to the current bid. All returned excerpts are literal
// slices, so a user can inspect the passage even when the ranking is imperfect.
const common = new Set('投标人 供应商 本项目 采购人 招标文件 投标文件 投标 响应 文件 提供 要求 应当 必须 我方 本公司 采购 项目 的 和 或 及 为 须 应 可 按照 根据 相关 需要'.split(' '));
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
function terms(text) {
  const tokens = new Set();
  for (const {segment, isWordLike} of segmenter.segment(text.normalize('NFKC').toLowerCase())) {
    if (!isWordLike || segment.length < 2 || common.has(segment) || /^\d+$/.test(segment)) continue;
    tokens.add(segment);
    if (/^[\p{Script=Han}]{3,}$/u.test(segment)) {
      for (let i = 1; i < segment.length; i++) {
        const pair = segment.slice(i-1, i+1);
        if (!common.has(pair)) tokens.add(pair);
      }
    }
  }
  return tokens;
}

export function buildPassages(bid) {
  const passages = [], freq = new Map();
  let start = -1, end = 0, page = 0, startLine = 1, line = 0;
  function flush() {
    if (start < 0) return;
    const text = bid.slice(start, end);
    const tokens = terms(text);
    if (tokens.size) {
      passages.push({ start, end, text, line:startLine, page, tokens });
      for (const token of tokens) freq.set(token, (freq.get(token) || 0) + 1);
    }
    start = -1;
  }
  for (const match of bid.matchAll(/[^\n]*(?:\n|$)/g)) {
    line++;
    const value = match[0].trim();
    const marker = /^【PDF 第 (\d+) 页】$/.exec(value);
    if (!value || marker || value === '〔本页可提取文字很少，请核对原件〕') {
      flush();
      if (marker) page = Number(marker[1]);
      continue;
    }
    const offset = match.index + match[0].indexOf(value);
    for (const piece of value.matchAll(/[^。！？；]{1,480}[。！？；]?|[。！？；]/g)) {
      const position = offset + piece.index;
      if (start >= 0 && position + piece[0].length - start > 450) flush();
      if (start < 0) { start = position; startLine = line; }
      end = position + piece[0].length;
      if ((end - start > 45 && /[。！？；]$/.test(piece[0])) || end - start >= 280) flush();
    }
  }
  flush();
  return { passages, freq };
}

export function findPassages(index, query, count = 3) {
  const wanted = [...terms(query)];
  if (!wanted.length) return [];
  const matches = [];
  for (const passage of index.passages) {
    const shared = wanted.filter(token => passage.tokens.has(token));
    if (!shared.length) continue;
    const weight = shared.reduce((sum, token) => sum + Math.log(1 + (index.passages.length + 1) / (index.freq.get(token) + 1)), 0);
    const score = weight / (1 + Math.log1p(passage.tokens.size) / 8);
    matches.push({ ...passage, score });
  }
  return matches.sort((a,b) => b.score - a.score || a.start-b.start).slice(0,count)
    .map(({text,page,line,start,end}) => ({text,page,line,start,end,location:(page ? 'PDF 第 '+page+' 页 · ' : '')+'正文第 '+line+' 行'}));
}
