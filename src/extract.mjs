const maxFileBytes = 10 * 1024 * 1024;
const maxXmlBytes = 12 * 1024 * 1024;
const maxCharacters = 120_000;
const maxPages = 200;
const utf8 = new TextDecoder('utf-8', { fatal: true });
const pdfAssets = new URL('../vendor/pdfjs/', import.meta.url);

class ImportError extends Error {}

function checkLength(length) {
  if (length > maxCharacters) {
    throw new ImportError('单份正文上限为 120,000 个字符，请拆分文件或粘贴对应章节。');
  }
}

function decodeText(bytes, allowLegacy = false) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return utf8.decode(bytes);
  } catch {
    if (allowLegacy) return new TextDecoder('gb18030', { fatal: true }).decode(bytes);
    throw new Error('Invalid XML encoding');
  }
}

// Read only the Word main document from the ZIP central directory.
// Limit both the declared and the actual decompressed size.
async function documentXml(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = offset => view.getUint16(offset, true);
  const u32 = offset => view.getUint32(offset, true);
  const minEnd = Math.max(0, bytes.length - 22 - 65535);
  let end = bytes.length - 22;
  while (end >= minEnd && !(u32(end) === 0x06054b50 && end + 22 + u16(end + 20) === bytes.length)) end--;
  if (end < minEnd) throw new Error('Invalid ZIP directory');
  let offset = u32(end + 16);
  for (let count = u16(end + 10); count > 0; count--) {
    if (offset + 46 > end || u32(offset) !== 0x02014b50) throw new Error('Invalid ZIP entry');
    const nameLength = u16(offset + 28);
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    if (nameLength === 17 && new TextDecoder().decode(nameBytes) === 'word/document.xml') {
      if (u16(offset + 8) & 1) throw new ImportError('请先解除 Word 文件的密码保护。');
      const method = u16(offset + 10);
      const packedSize = u32(offset + 20);
      const expectedSize = u32(offset + 24);
      if (expectedSize > maxXmlBytes) throw new ImportError('Word 正文结构过大，请拆分文件后导入。');
      const local = u32(offset + 42);
      if (u32(local) !== 0x04034b50) throw new Error('Invalid ZIP local header');
      const start = local + 30 + u16(local + 26) + u16(local + 28);
      if (start + packedSize > offset) throw new Error('Invalid ZIP payload');
      const packed = bytes.subarray(start, start + packedSize);
      if (method === 0 && packedSize === expectedSize) return decodeText(packed);
      if (method !== 8) throw new Error('Unsupported ZIP compression');
      const reader = new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const output = new Uint8Array(expectedSize);
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (size + value.length > expectedSize) {
          await reader.cancel();
          throw new Error('Invalid ZIP size');
        }
        output.set(value, size);
        size += value.length;
      }
      if (size !== expectedSize) throw new Error('Incomplete Word XML');
      return decodeText(output);
    }
    offset += 46 + nameLength + u16(offset + 30) + u16(offset + 32);
  }
  throw new Error('Missing main document');
}

async function extractWord(bytes) {
  const xml = await documentXml(bytes);
  if (/<!DOCTYPE/i.test(xml)) throw new Error('Unexpected DTD');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.documentElement.localName !== 'document') throw new Error('Invalid Word document');
  const ns = doc.documentElement.namespaceURI;
  const parts = [];
  let length = 0;
  let previousRow;
  let previousCell;
  for (const node of doc.getElementsByTagNameNS(ns, '*')) {
    let part;
    switch (node.localName) {
      case 'p': {
        const row = node.closest('tr');
        const cell = node.closest('tc');
        part = row && row === previousRow && cell !== previousCell ? '\t' : '\n';
        previousRow = row;
        previousCell = cell;
        break;
      }
      case 't': part = node.textContent; break;
      case 'tab': part = '\t'; break;
      case 'br':
      case 'cr': part = '\n'; break;
      default: continue;
    }
    length += part.length;
    checkLength(length);
    parts.push(part);
  }
  return parts.join('');
}

async function extractPdf(bytes) {
  const pdf = await import(new URL('pdf.min.mjs', pdfAssets).href);
  pdf.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', pdfAssets).href;
  const task = pdf.getDocument({
    data: bytes,
    cMapUrl: new URL('cmaps/', pdfAssets).href,
    cMapPacked: true,
    useWasm: false,
    useSystemFonts: true,
  });
  try {
    const doc = await task.promise;
    if (doc.numPages > maxPages) throw new ImportError('单个 PDF 上限为 200 页，请拆分后导入。');
    const parts = [];
    let length = 0;
    let readable = false;
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number);
      const pageParts = [];
      const reader = page.streamTextContent().getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const item of value.items) {
          if (typeof item.str !== 'string') continue;
          const part = item.str + (item.hasEOL ? '\n' : '');
          length += part.length;
          checkLength(length);
          pageParts.push(part);
        }
      }
      const pageText = pageParts.join('').trim();
      if (pageText) readable = true;
      const note = pageText.replace(/\s/g, '').length < 18 ? '\n〔本页可提取文字很少，请核对原件〕' : '';
      parts.push('【PDF 第 '+number+' 页】\n'+pageText+note+'\n');
      page.cleanup();
    }
    const text = parts.join('');
    if (!readable) throw new ImportError('未提取到 PDF 文字。扫描件请先进行 OCR 识别，再上传文字版或粘贴正文。');
    return text;
  } catch (error) {
    if (error.name === 'PasswordException') throw new ImportError('请先解除 PDF 的密码保护。');
    throw error;
  } finally {
    await task.destroy();
  }
}

/** Read the document locally and return plain text. */
export async function extractText(file) {
  const ext = file?.name?.split('.').pop().toLowerCase();
  if (ext === 'doc') throw new ImportError('请用 Word 将旧版 .doc 另存为 .docx 后导入。');
  if (!['txt', 'docx', 'pdf'].includes(ext)) throw new ImportError('支持 TXT、DOCX 和文字型 PDF 文件。');
  if (!file.size) throw new ImportError('文件为空，请重新选择。');
  if (file.size > maxFileBytes) throw new ImportError('单个文件上限为 10 MB，请拆分文件或粘贴正文。');
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let text;
    if (ext === 'docx') text = await extractWord(bytes);
    if (ext === 'pdf') text = await extractPdf(bytes);
    if (ext === 'txt') {
      text = decodeText(bytes, true);
      if (/[\u0000-\u0008\u000e-\u001a]/u.test(text)) throw new Error('Invalid plain text');
    }
    text = text.replace(/\r\n?/g, '\n').trim();
    if (!text) throw new ImportError('没有可读取的正文，请检查文件或直接粘贴文字。');
    checkLength(text.length);
    return text;
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError(`无法读取此 ${ext.toUpperCase()} 文件，请检查格式、解除密码保护，或粘贴正文。`);
  }
}
