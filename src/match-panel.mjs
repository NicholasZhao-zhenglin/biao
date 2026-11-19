import { buildPassages, findPassages } from './matching.mjs';

let previousBid = '', index;
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function mountMatchPanel(container, {quote, bid, aiAvailable, onUse}) {
  if (!container) return;
  container.replaceChildren();
  const shell = el('details', undefined, 'match-shell');
  const summary = el('summary', '从投标正文查找响应依据');
  shell.append(summary);
  container.append(shell);
  if (!bid) {
    shell.append(el('p', '导入投标正文后，可以按当前条款查找候选摘录。'));
    return;
  }
  const search = el('input');
  search.type = 'search'; search.placeholder = '输入材料名或技术参数搜索';
  search.setAttribute('aria-label','在投标正文中查找候选依据');
  const results = el('div');
  const controls = el('div', undefined, 'match-controls');
  const submit = el('button', '查找');
  submit.type = 'button';
  controls.append(search, submit);
  shell.append(controls, results);
  if (aiAvailable) shell.insertBefore(el('p','点选 AI 核对时，仅将当前条款和选中的摘录发送给已配置的模型。'), results);

  function render() {
    if (bid !== previousBid || !index) { previousBid = bid; index = buildPassages(bid); }
    const candidates = findPassages(index, search.value.trim() || quote);
    results.replaceChildren();
    if (!candidates.length) results.append(el('p','没有找到相近摘录，可更换关键词或人工填写材料位置。'));
    for (const candidate of candidates) {
      const item = el('div', undefined, 'match-item');
      item.append(el('small', candidate.location), el('blockquote', candidate.text));
      const use = el('button', '引用此段');
      use.type = 'button';
      use.onclick = () => onUse(candidate.text, candidate.location);
      item.append(use);
      if (aiAvailable) {
        const inspect = el('button', 'AI 核对本条与摘录');
        inspect.type = 'button';
        inspect.title = '将当前条款与本段摘录发送给已配置的模型';
        const result = el('div', undefined, 'match-result');
        result.setAttribute('role','status');
        inspect.onclick = async () => {
          inspect.disabled = true; result.textContent = '正在核对…';
          try {
            const res = await fetch('/api/check-clause',{method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify({requirement:quote,evidence:candidate.text})});
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '核对失败。');
            result.replaceChildren(el('strong',data.assessment),el('p',data.reason));
            if (data.evidence) result.append(el('blockquote',data.evidence));
            const download = el('button', '下载条款核查记录');
            download.onclick = () => {
              const content = ['条款核查记录', quote, candidate.location, candidate.text, data.assessment, data.reason].join('\n\n');
              const url = URL.createObjectURL(new Blob(['\uFEFF',content],{type:'text/plain;charset=utf-8'}));
              const link = el('a'); link.href=url; link.download='条款核查记录.txt'; link.click();
              setTimeout(()=>URL.revokeObjectURL(url),1000);
            };
            result.append(download);
          } catch (error) { result.textContent = error.message; }
          finally { inspect.disabled = false; }
        };
        item.append(inspect,result);
      }
      results.append(item);
    }
  }
  shell.addEventListener('toggle', () => { if (shell.open && !results.childElementCount) render(); });
  submit.onclick = render;
  search.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); render(); } };
}
