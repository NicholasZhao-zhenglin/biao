import { extractText } from './extract.mjs';
import { categories, isExpired, materialLocation, listMaterials, saveMaterial, deleteMaterial, exportMaterials, restoreMaterials } from './material-store.mjs';

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(label, action, className = '') {
  const node = el('button', label, className);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

function picker(accept) {
  const node = el('input');
  node.type = 'file'; node.accept = accept; node.hidden = true;
  return node;
}

function field(parent, text, control) {
  const label = el('label', text);
  label.append(control); parent.append(label);
  return control;
}

function download(text) {
  const url = URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));
  const link = el('a');
  link.href = url; link.download = '标衡-企业材料库.json';
  document.body.append(link); link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export async function openMaterials({onUse} = {}) {
  if (document.querySelector('dialog.bh-materials[open]')) return;
  if (!document.getElementById('bh-materials-style')) {
    const style = el('link'); style.id = 'bh-materials-style'; style.rel = 'stylesheet';
    style.href = new URL('./materials.css',import.meta.url).href;
    document.head.append(style);
  }
  const modal = el('dialog', null, 'bh-materials');
  modal.setAttribute('aria-labelledby','bh-materials-heading');
  const head = el('header');
  const title = el('h2','企业材料库'); title.id = 'bh-materials-heading';
  head.append(title, button('关闭',()=>modal.close()));
  const body = el('div',null,'mat-content');
  const message = el('div',null,'mat-message'); message.setAttribute('role','status');
  modal.append(head, message, body); document.body.append(modal); modal.showModal();
  modal.addEventListener('close',()=>modal.remove(),{once:true});
  let rows = [], activeId = null, term = '', category = '';
  const inform = (msg, error = false) => {
    message.textContent = msg; message.classList.toggle('mat-error', error);
  };

  async function fetchList(id, notice='') {
    try {
      rows = await listMaterials();
      if (!modal.open) return;
      activeId = id; showList(); inform(notice);
    } catch (err) { inform(err.message,true); }
  }

  function showList() {
    body.replaceChildren();
    const intro = el('p','在本机跨项目复用证明材料。项目备份含已引用的摘录，材料库可单独备份。','mat-note');
    const actions = el('div',null,'mat-actions');
    const restoreInput = picker('.json');
    actions.append(button('新增材料',()=>showEditor(null),'mat-primary'),
      button('备份材料库',async()=>{try {download(exportMaterials(await listMaterials()));inform('已导出材料库备份。');} catch(err){inform(err.message,true);}}),
      button('恢复备份',()=>restoreInput.click()),restoreInput);
    restoreInput.onchange = async () => {
      const file = restoreInput.files[0];
      if (!file) return;
      try {
        if (file.size > 64*1024*1024) throw new Error('备份文件过大。');
        const result = await restoreMaterials(await file.text());
        await fetchList(null,'已恢复 '+result.added+' 项，跳过 '+result.skipped+' 项重复材料。');
      } catch(err){inform(err.message,true);restoreInput.value='';}
    };
    const filters = el('div',null,'mat-filters');
    const search = el('input'); search.type='search'; search.placeholder='搜索名称、来源或摘录'; search.value=term;
    search.setAttribute('aria-label','搜索企业材料');
    const filter = el('select'); filter.setAttribute('aria-label','材料类型');
    filter.append(new Option('全部类型',''),...categories.map(c=>new Option(c,c))); filter.value = category;
    filters.append(search,filter);
    const grid=el('div',null,'mat-grid'), list=el('div',null,'mat-list'), details=el('section',null,'mat-detail');
    grid.append(list,details);body.append(intro,actions,filters,grid);

    function select() {
      const needle = term.trim().toLocaleLowerCase();
      const found = rows.filter(row=>(!category || row.category === category) && (!needle || [row.title,row.source,row.body].some(v=>v.toLocaleLowerCase().includes(needle))));
      const active = found.find(row=>row.id===activeId) || found[0];
      activeId = active?.id ?? null;
      list.replaceChildren(); details.replaceChildren();
      if (!active) {
        list.append(el('p',rows.length?'没有匹配的材料。':'尚未录入材料。','mat-empty'));
        details.append(el('p',rows.length?'调整关键词或类型以查看摘录。':'新增一份资质、业绩或人员证明，保存可引用的段落及来源。','mat-note'));
        return;
      }
      for (const row of found) {
        const pick = button('',()=>{activeId=row.id; select();},'mat-pick');
        pick.setAttribute('aria-pressed',String(row.id === activeId));
        pick.append(el('span',row.category),el('b',row.title),el('small',row.source));list.append(pick);
      }
      const expired = isExpired(active.expiresOn);
      details.append(el('span',active.category,'mat-kind'),el('h3',active.title),el('p','来源　'+active.source,'mat-source'));
      if (active.expiresOn) details.append(el('p',(expired?'已过期 · ':'有效期至 ')+active.expiresOn, expired?'mat-expired':'mat-source'));
      details.append(el('blockquote',active.body));
      const tools=el('div',null,'mat-actions');
      if (onUse) {
        const cite=button('引用到当前条款',async()=>{
          try {cite.disabled=true; await onUse(active.body,materialLocation(active));modal.close();}
          catch(err){inform(err.message,true);cite.disabled=false;}
        },'mat-primary');
        tools.append(cite);
      }
      tools.append(button('编辑',()=>showEditor(active)),button('删除',async()=>{
        if (!window.confirm('删除“'+active.title+'”？已有项目中的引用摘录会保留。')) return;
        try {await deleteMaterial(active);await fetchList(null,'材料已删除。');}
        catch(err){await fetchList(active.id);inform(err.message,true);}
      },'mat-danger'));
      details.append(tools);
    }
    search.oninput=()=>{term=search.value;select();};
    filter.onchange=()=>{category=filter.value;select();};
    select();
  }

  function showEditor(existing) {
    inform(''); body.replaceChildren();
    const form = el('form',null,'mat-form');
    const heading=el('h3',existing?'编辑材料':'新增材料');
    const cols=el('div',null,'mat-cols');
    const title=field(cols,'材料名称',el('input')); title.required=true; title.maxLength=180; title.value=existing?.title || '';
    const categoryInput=field(cols,'材料类型',el('select')); categoryInput.append(...categories.map(c=>new Option(c,c))); categoryInput.value=existing?.category || categories[0];
    const loc=field(cols,'来源文件与位置',el('input'));loc.required=true;loc.maxLength=2000;loc.placeholder='如：企业证照册.pdf，第 3 页';loc.value=existing?.source || '';
    const expiry=field(cols,'有效期至（选填）',el('input'));expiry.type='date';expiry.value=existing?.expiresOn || '';
    const sourceFile=picker('.pdf,.docx,.txt');
    const excerptTools=el('div',null,'mat-actions'),previewArea=el('div',null,'mat-preview');
    const importSource=button('从文件选取摘录',()=>sourceFile.click());
    excerptTools.append(importSource,sourceFile,el('small','仅保存你选定的文字。'));
    const finalBody=el('div'), excerpt=field(finalBody,'材料原文摘录',el('textarea'));
    excerpt.rows=6;excerpt.required=true;excerpt.value=existing?.body || '';excerpt.placeholder='粘贴可直接引用的证明文字，或从文件中选取。';
    const actions=el('div',null,'mat-actions');
    const save=el('button','保存材料','mat-primary');save.type='submit';
    actions.append(save,button('返回清单',()=>fetchList(existing?.id)));
    form.append(heading,cols,excerptTools,previewArea,finalBody,actions);body.append(form);title.focus();
    sourceFile.onchange = async () => {
      const file=sourceFile.files[0];if(!file)return;
      importSource.disabled=save.disabled=true;inform('正在本机提取正文…');
      try {
        const text=await extractText(file);if(!form.isConnected)return;
        const preview=el('textarea');preview.readOnly=true;preview.rows=6;preview.value=text;
        previewArea.replaceChildren();
        field(previewArea,'在文件正文中选中需要引用的文字',preview);
        previewArea.append(button('将选中文字加入摘录',()=>{
          const start=preview.selectionStart;
          const selected=preview.value.slice(start,preview.selectionEnd).trim();
          if(!selected){inform('请先在文件正文中拖选文字。',true);return;}
          const joined=[excerpt.value.trim(),selected].filter(Boolean).join('\n\n');
          if(joined.length>30000){inform('摘录总长度超过 30,000 个字符，请缩小选区。',true);return;}
          const before=preview.value.slice(0,start);
          const pages=[...before.matchAll(/【PDF 第 (\d+) 页】/g)];
          const source=file.name + (pages.length?'，第 '+pages.at(-1)[1]+' 页起':'，正文第 '+before.split('\n').length+' 行起');
          if (!loc.value.trim()) loc.value=source;
          else if(!loc.value.includes(source))loc.value+='；'+source;
          if(!title.value.trim())title.value=file.name.replace(/\.[^.]+$/,'');
          excerpt.value=joined;
          inform('已将选区加入摘录，请核对来源后保存。');
        }));inform('正文已提取，请选取适合复用的段落。');
      } catch(err){if(form.isConnected)inform(err.message,true);}
      finally {importSource.disabled=save.disabled=false;sourceFile.value='';}
    };
    form.onsubmit=async event=>{
      event.preventDefault();if(save.disabled)return;save.disabled=true;
      try {
        const saved=await saveMaterial({title:title.value,category:categoryInput.value,source:loc.value,expiresOn:expiry.value,body:excerpt.value},existing);
        term=''; category=''; await fetchList(saved.id,'材料已保存。');
      } catch(err){inform(err.message,true);save.disabled=false;}
    };
  }
  await fetchList(null);
}
