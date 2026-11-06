// Statik dogrulama: CSS brace dengesi + HTML/JS id eslesmesi
const fs = require('fs');
const path = require('path');
const root = __dirname;

const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + m); if (!c) fails++; };

// 1) CSS brace dengesi
let depth = 0, maxDepth = 0;
for (const ch of css) { if (ch === '{') { depth++; maxDepth = Math.max(maxDepth, depth); } else if (ch === '}') depth--; }
ok(depth === 0, 'CSS brace dengesi: ' + depth + ' (0 olmali)');

// 2) Gerekli seciciler var mi
const selectors = ['.screen', '.screen.active', '.players-list', '.player-item', '.player-avatar', '.opponent',
  '.opponent-card', '.game-log', '.log-content', '.my-hand-area', '.hand-cards', '.playing-card',
  '.modal', '.modal.hidden', '.btn-primary', '.btn-lg', '.toast', '.room-code-display', '.input-group input'];
const missingSel = selectors.filter(s => css.indexOf(s) === -1);
ok(missingSel.length === 0, 'Tum kritik CSS secicileri mevcut' + (missingSel.length ? ' - EKSIK: ' + missingSel.join(', ') : ''));

// 3) JS'te kullanilan tum getElementById HTML'de var mi
const ids = [...js.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
const DYNAMIC_IDS = ['start-btn', 'ready-btn'];
const uniqueIds = [...new Set(ids)].filter(id => DYNAMIC_IDS.indexOf(id) === -1);
const missingIds = uniqueIds.filter(id => html.indexOf('id="' + id + '"') === -1);
ok(missingIds.length === 0, 'JS getElementById hedefleri HTMLde mevcut (' + uniqueIds.length + ' kontrol)' + (missingIds.length ? ' - EKSIK: ' + missingIds.join(', ') : ''));

// 4) HTML'deki tum id'ler benzersiz
const allIds = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
const dupes = allIds.filter((v, i) => allIds.indexOf(v) !== i);
ok(dupes.length === 0, 'HTML id benzersiz' + (dupes.length ? ' - TEKRAR: ' + [...new Set(dupes)].join(', ') : ''));

// 5) Aktif ekran var mi (CSS yuklenince sayfa bos kalmamali)
ok(/class="screen active"/.test(html), 'Baslangicta aktif ekran (active class) mevcut');

// 6) CSS/JS cachebuster
ok(/style\.css\?v=\d+/.test(html), 'CSS cachebuster etiketi mevcut');
ok(/app\.js\?v=\d+/.test(html), 'JS cachebuster etiketi mevcut');

// 7) Socket.IO CDN/socket.io.js yukleniyor mu
ok(/<script src="\/socket\.io\/socket\.io\.js"><\/script>/.test(html), 'Socket.IO client scripti yukleniyor');

// 8) Manifest + service worker
ok(/rel="manifest"/.test(html), 'Manifest baglantisi mevcut');
ok(fs.existsSync(path.join(root, 'public', 'sw.js')), 'sw.js dosyasi mevcut');
ok(/navigator\.serviceWorker\.register/.test(js), 'ServiceWorker kaydi js icinde mevcut');

// 9) Tema (koyu) uygulaniyor mu
ok(/background:\s*var\(--bg\)/.test(css), 'Koyu tema CSS uygulaniyor');
ok(/body\{[^}]*background:var\(--bg\)/.test(css.replace(/\s/g, '')), 'body arka plani koyu tema');

console.log('\n=== ' + (fails ? fails + ' HATA' : 'TUM KONTROLLER BASARILI') + ' ===');
process.exit(fails ? 1 : 0);
