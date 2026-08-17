/**
 * landing/preparar-logo.js — deixa uma logo pronta para a esteira da landing.
 *
 * A arte que chega (upload de white-label, print, arquivo do cliente) vem como
 * avatar quadrado grande, com fundo sólido próprio e margem morta enorme. Jogada
 * crua na faixa de 74px, a marca fica do tamanho de uma unha. Aqui: corta a
 * margem, padroniza a altura e comprime.
 *
 * Uso:
 *   node landing/preparar-logo.js <arquivo-de-entrada> <nome-de-saida>
 *
 * Exemplo:
 *   node landing/preparar-logo.js ~/Downloads/pj.png pj-celulares
 *   → grava landing/logos/pj-celulares.png
 *
 * Depois é só acrescentar a linha no array LOGOS do index.html:
 *   { nome: 'PJ Celulares', logo: '/logos/pj-celulares.png' },
 */
const path = require('path');
const fs = require('fs');

// sharp vive em backend/node_modules — o mesmo truque do gerar-logos.js.
const BACKEND = [
  path.join(__dirname, '..', 'backend'),
  path.join(__dirname, 'backend'),
].find(d => fs.existsSync(path.join(d, 'node_modules', 'sharp')));
if (!BACKEND) { console.error('[logo] não achei backend/node_modules/sharp'); process.exit(1); }
const sharp = require(path.join(BACKEND, 'node_modules', 'sharp'));

const ALTURA = 96;        // 2x a altura de exibição (~50px) — nitidez em tela retina
const LARGURA_MAX = 420;
const SAIDA_DIR = path.join(__dirname, 'logos');

const [entrada, nomeSaida] = process.argv.slice(2);
if (!entrada || !nomeSaida) {
  console.error('uso: node landing/preparar-logo.js <arquivo> <nome-de-saida>');
  process.exit(1);
}
if (!fs.existsSync(entrada)) { console.error('não encontrei:', entrada); process.exit(1); }

const slug = nomeSaida.toLowerCase().replace(/\.(png|jpe?g|webp)$/i, '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

(async () => {
  fs.mkdirSync(SAIDA_DIR, { recursive: true });
  const destino = path.join(SAIDA_DIR, slug + '.png');

  const antes = await sharp(entrada).metadata();
  const buf = await sharp(entrada)
    .trim({ threshold: 12 })   // corta a borda de cor uniforme, seja branca ou preta
    .resize({ height: ALTURA, width: LARGURA_MAX, fit: 'inside', withoutEnlargement: false })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  const depois = await sharp(buf).metadata();
  fs.writeFileSync(destino, buf);

  const kb = n => (n / 1024).toFixed(0) + 'kb';
  console.log(`${path.basename(entrada)}  ${antes.width}x${antes.height} (${kb(fs.statSync(entrada).size)})`);
  console.log(`→ ${path.relative(process.cwd(), destino)}  ${depois.width}x${depois.height} (${kb(buf.length)})`);
  console.log(`\nacrescente no array LOGOS do index.html:`);
  console.log(`  { nome: 'NOME DA EMPRESA', logo: '/logos/${slug}.png' },`);
})().catch(e => { console.error('[logo]', e.message); process.exit(1); });
