import { deflateRawSync } from 'node:zlib';

// A Word document is an OPC ZIP with a small set of named XML parts.
const crcTable = Uint32Array.from({ length: 256 }, (_, byte) => {
  let crc = byte;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});

function zip(parts) {
  const files = [], directory = [];
  let offset = 0;
  for (const [path, xml] of Object.entries(parts)) {
    const name = Buffer.from(path), data = Buffer.from(xml), compressed = deflateRawSync(data);
    let crc = 0xffffffff;
    for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(33, 12); // 1980-01-01, a valid DOS date.
    local.writeUInt32LE((crc ^ 0xffffffff) >>> 0, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    local.copy(central, 6, 4, 30);
    central.writeUInt32LE(offset, 42);
    files.push(local, name, compressed);
    directory.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const index = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(directory.length / 2, 8);
  end.writeUInt16LE(directory.length / 2, 10);
  end.writeUInt32LE(index.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, index, end]);
}

const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const pkg = 'http://schemas.openxmlformats.org/package/2006/relationships';
const escape = value => value.replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function paragraph(style, text) {
  return '<w:p><w:pPr><w:pStyle w:val="'+style+'"/></w:pPr><w:r><w:t xml:space="preserve">'+escape(text)+'</w:t></w:r></w:p>';
}
const lines = (style, text) => text.split(/\r\n?|\n/).map(line => paragraph(style, line)).join('');

function style(id, name, size, color, before, after, outline) {
  const heading = outline !== undefined;
  return `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr>${heading ? '<w:keepNext/>' : ''}<w:spacing w:before="${before}" w:after="${after}"/>${heading ? '<w:outlineLvl w:val="'+outline+'"/>' : ''}</w:pPr><w:rPr>${heading || id === 'Title' ? '<w:b/>' : ''}<w:color w:val="${color}"/><w:sz w:val="${size}"/></w:rPr></w:style>`;
}
const styles = `<w:styles xmlns:w="${w}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体"/><w:sz w:val="22"/><w:lang w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:widowControl/><w:spacing w:after="100" w:line="320" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
  style('Title', 'Title', 36, '161616', 0, 160) + style('Heading1', 'heading 1', 30, '182942', 240, 100, 0) +
  style('Heading2', 'heading 2', 24, '253952', 160, 80, 1) + style('Source', '采购条款', 20, '485569', 0, 80) +
  style('Pending', '待补响应', 22, '945109', 0, 100) + '</w:styles>';

export function createResponseDocx({ title, entries }) {
  const groups = new Map();
  for (const entry of entries) {
    const section = entry.section?.trim() || '条款响应';
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push(entry);
  }
  let body = paragraph('Title', title) + paragraph('Source', '投标响应编写稿');
  let chapter = 0;
  for (const [section, items] of groups) {
    chapter++;
    body += paragraph('Heading1', chapter + '  ' + section);
    items.forEach((entry, index) => {
      body += paragraph('Heading2', chapter + '.' + (index + 1) + '  ' + (entry.title?.trim() || '条款响应'));
      if (entry.requirement) body += lines('Source', '采购要求　' + entry.requirement);
      body += entry.response?.trim() ? lines('Normal', entry.response) : paragraph('Pending', '【待补充响应】');
    });
  }
  const doc = `<w:document xmlns:w="${w}" xmlns:r="${rel}"><w:body>${body}<w:sectPr><w:footerReference w:type="default" r:id="rFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1276" w:right="1248" w:bottom="1276" w:left="1418" w:footer="660"/></w:sectPr></w:body></w:document>`;
  return zip({
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>',
    '_rels/.rels': `<Relationships xmlns="${pkg}"><Relationship Id="rDoc" Type="${rel}/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/document.xml': doc, 'word/styles.xml': styles,
    'word/_rels/document.xml.rels': `<Relationships xmlns="${pkg}"><Relationship Id="rStyles" Type="${rel}/styles" Target="styles.xml"/><Relationship Id="rFooter" Type="${rel}/footer" Target="footer1.xml"/></Relationships>`,
    'word/footer1.xml': `<w:ftr xmlns:w="${w}"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`,
  });
}
