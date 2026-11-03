/* dFaster Note — PDF export. Renders a light-theme A4 page in the browser (perfect Bangla shaping),
   rasterises it with html2canvas and paginates at row/section boundaries into jsPDF (both bundled, MIT). */
(() => {
'use strict';
const loaded = {};
const load = src => loaded[src] || (loaded[src] = new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('লাইব্রেরি লোড হয়নি: ' + src)); document.head.appendChild(s);
}));
async function build(html, {title = 'report'} = {}) {
  await Promise.all([load('vendor/html2canvas.min.js'), load('vendor/jspdf.umd.min.js')]);
  await document.fonts.ready;
  const stage = U.$('#pdfStage');
  stage.innerHTML = `<div class="pdf-doc">${html}<div class="pdf-foot">dFaster Note · Powered by Robin · dFaster.com · ${U.dateBn(U.ymd())}</div></div>`;
  const doc = stage.firstElementChild;
  const W = 794, H = 1123;               // A4 @ 96 dpi
  const top = doc.getBoundingClientRect().top;
  // safe cut points: bottoms of rows / sections
  const cuts = [...doc.querySelectorAll('tr, .pdf-block, h2, h3, .pdf-foot')].map(e => Math.round(e.getBoundingClientRect().bottom - top)).sort((a, b) => a - b);
  const total = Math.ceil(doc.scrollHeight);
  const scale = 2;
  const canvas = await html2canvas(doc, {scale, backgroundColor: '#ffffff', width: W, windowWidth: W, logging: false});
  const {jsPDF} = window.jspdf;
  const pdf = new jsPDF({unit: 'px', format: [W, H], orientation: 'portrait', hotfixes: ['px_scaling'], compress: true});
  const M = 28;                           // top/bottom margin per page (px)
  let y = 0, page = 0;
  while (y < total - 2) {
    let end = Math.min(total, y + H - 2 * M);
    if (end < total) { const c = cuts.filter(v => v > y + 80 && v <= end).pop(); if (c) end = c; }
    const h = end - y;
    const part = document.createElement('canvas'); part.width = W * scale; part.height = h * scale;
    part.getContext('2d').drawImage(canvas, 0, y * scale, W * scale, h * scale, 0, 0, W * scale, h * scale);
    if (page) pdf.addPage([W, H], 'portrait');
    pdf.addImage(part.toDataURL('image/jpeg', 0.88), 'JPEG', 0, M, W, h);
    pdf.setFontSize(9); pdf.setTextColor(140); pdf.text(`${page + 1}`, W - M, H - 12, {align: 'right'});
    y = end; page++;
  }
  pdf.setProperties({title, creator: 'Baki Khata · dFaster.com'});
  stage.innerHTML = '';
  return pdf.output('datauristring').split(',')[1];
}
async function share(html, filename, title) {
  const b64 = await build(html, {title});
  await Native.shareFile(filename, 'application/pdf', b64, title);
  return b64;
}
window.PDF = {build, share};
})();
