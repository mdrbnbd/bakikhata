// Renders the বাকি খাতা icon (ledger book + ৳) with the bundled Hind Siliguri font. Run from /workspace/shotkit's node_modules.
const p = require('/workspace/shotkit/node_modules/puppeteer-core');
const path = require('path');
const APP = path.resolve(__dirname, '../../app');
const book = (fg) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <rect x="24" y="18" width="52" height="64" rx="6" fill="#ffffff"/>
  <rect x="24" y="18" width="10" height="64" rx="4" fill="#d9f2e7"/>
  ${[28, 40, 52, 64, 76].map(y => `<circle cx="29" cy="${y - 2}" r="2.3" fill="${fg}"/>`).join('')}
  <line x1="40" y1="68" x2="70" y2="68" stroke="#c9e8da" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="40" y1="74" x2="62" y2="74" stroke="#c9e8da" stroke-width="2.4" stroke-linecap="round"/>
  <text x="55" y="58" text-anchor="middle" font-family="Hind Siliguri" font-weight="700" font-size="40" fill="${fg}">৳</text>
</svg>`;
const page = (s, mode) => `<!doctype html><html><head><link rel="stylesheet" href="file://${APP}/fonts.css"><style>
html,body{margin:0;background:transparent}
.full{width:${s}px;height:${s}px;border-radius:${mode === 'round' ? '50%' : mode === 'square' ? (s * 0.22) + 'px' : '0'};background:${mode === 'fg' ? 'transparent' : 'linear-gradient(145deg,#14a37a,#0b6e4f)'};display:grid;place-items:center;overflow:hidden}
.inner{width:${mode === 'fg' ? 62 : 92}%;height:${mode === 'fg' ? 62 : 92}%}
</style></head><body><div class="full"><div class="inner">${book('#0b6e4f')}</div></div></body></html>`;
(async () => {
  const b = await p.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--allow-file-access-from-files']});
  const pg = await b.newPage();
  for (const [mode, file] of [['square', 'master-square.png'], ['round', 'master-round.png'], ['fg', 'master-fg.png'], ['bleed', 'master-bleed.png']]) {
    await pg.setViewport({width: 1024, height: 1024});
    require('fs').writeFileSync('/tmp/bk-icon.html', page(1024, mode));
    await pg.goto('file:///tmp/bk-icon.html'); await pg.evaluate(() => document.fonts.ready); await new Promise(r => setTimeout(r, 300));
    await pg.screenshot({path: path.join(__dirname, file), omitBackground: true});
  }
  await b.close();
})();
