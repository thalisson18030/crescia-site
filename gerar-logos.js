/**
 * landing/gerar-logos.js — monta o array LOGOS da esteira da landing a partir dos
 * tenants pagantes reais.
 *
 * SOMENTE LEITURA no banco. Nenhum INSERT/UPDATE/DELETE/DDL. Seguro em produção.
 *
 * ⚠️ AUTORIZAÇÃO DE MARCA
 * A logo que o tenant subiu é o white-label DELE, para aparecer no sistema dele —
 * não é material de marketing da Crescia. Nenhum contrato assinado hoje autoriza uso
 * da marca do cliente em publicidade. Por isso este script, sozinho, NÃO publica nada:
 * sem --autorizados ele só relata quem tem logo, para você decidir de quem pedir o ok.
 *
 * Autocontido de propósito (só `pg` e `dotenv`), pra rodar na VPS sem deploy:
 *
 *   # 1. relatório — quem é pagante e tem logo (não copia nada, não publica nada)
 *   ssh root@31.97.65.120 'cd /opt/crescia-assist/backend && node -' < landing/gerar-logos.js
 *
 *   # 2. depois de ter o ok por escrito, liste os nomes autorizados (um por linha)
 *   #    e gere o array + copie os arquivos:
 *   ssh root@31.97.65.120 'cd /opt/crescia-assist/backend && node - \
 *     --autorizados /opt/crescia-assist/landing/autorizados.txt \
 *     --copiar /opt/crescia-assist/landing/logos' < landing/gerar-logos.js
 */
const fs = require('fs');
const path = require('path');

// `pg` e `dotenv` vivem em backend/node_modules. Mesmo truque do empresa/estado.js:
// funciona rodando como arquivo ou por stdin, de qualquer cwd.
const BACKEND = [
  path.join(__dirname, '..', 'backend'),
  path.join(__dirname, 'backend'),
  __dirname,
].find(d => fs.existsSync(path.join(d, 'node_modules', 'pg')));
if (!BACKEND) { console.error('[logos] não achei backend/node_modules/pg'); process.exit(1); }
module.paths.push(path.join(BACKEND, 'node_modules'));

const { Pool } = require('pg');
require('dotenv').config({ path: path.join(BACKEND, '.env'), quiet: true });

const LOGO_DIR = process.env.LOGOS_DIR || '/opt/crescia-assist/logos';

const arg = nome => {
  const i = process.argv.indexOf(nome);
  return i > -1 ? process.argv[i + 1] : null;
};
const autorizadosPath = arg('--autorizados');
const copiarPara = arg('--copiar');
// Decisão do Thalisson em 17/08/2026: publicar todos os pagantes com logo, sem
// pedir autorização caso a caso. Se algum cliente reclamar, é só tirar do array.
const todos = process.argv.includes('--todos');

// Mesmo filtro do empresa/estado.js — conta interna e de teste fora de tudo.
const FILTRO_INTERNO = `(
  t.nome ILIKE '%teste%' OR t.nome ILIKE '%test%'
  OR COALESCE(t.email_admin,'') ILIKE '%crescia%'
)`;

const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

(async () => {
  // Mesma config do backend/db.js — o projeto usa DB_* separado, não DATABASE_URL.
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'crescia_assist',
    user: process.env.DB_USER || 'crescia',
    password: process.env.DB_PASS,
    max: 4,
    connectionTimeoutMillis: 8000,
  });
  const { rows } = await pool.query(`
    SELECT t.nome, t.logo_url, t.plano, t.contrato_status, t.criado_em
      FROM tenants t
     WHERE t.status_cobranca = 'ativo'
       AND NOT ${FILTRO_INTERNO}
     ORDER BY t.criado_em ASC
  `);
  await pool.end();

  const comLogo = rows.filter(r => r.logo_url && String(r.logo_url).trim());

  console.log(`\n# Pagantes ativos (sem contas internas): ${rows.length}`);
  console.log(`# Com logo enviada: ${comLogo.length}`);
  console.log(`# A esteira da landing exige no mínimo 4 logos válidas.\n`);

  if (!comLogo.length) { console.log('Nenhum pagante tem logo. Nada a fazer.'); return; }

  console.log('| Empresa | Plano | Contrato | Arquivo da logo |');
  console.log('|---|---|---|---|');
  for (const r of comLogo) {
    console.log(`| ${r.nome.trim()} | ${r.plano} | ${r.contrato_status || '—'} | ${path.basename(r.logo_url)} |`);
  }

  if (!autorizadosPath && !todos) {
    console.log(`\n⚠️  Rodou em modo relatório: nada foi copiado e nenhum array foi gerado.`);
    console.log(`   Use --todos para gerar com todos os acima, ou --autorizados <arquivo>`);
    console.log(`   para restringir a uma lista de nomes.`);
    return;
  }

  let entram;
  if (todos) {
    entram = comLogo;
  } else {
    const permitidos = new Set(
      fs.readFileSync(autorizadosPath, 'utf8')
        .split('\n').map(norm).filter(l => l && !l.startsWith('#'))
    );
    entram = comLogo.filter(r => permitidos.has(norm(r.nome)));

    // Nome na lista que não bate com nenhum tenant: quase sempre erro de digitação,
    // e silenciar isso publicaria uma esteira menor do que o combinado.
    const naoEncontrados = [...permitidos].filter(p => !comLogo.some(r => norm(r.nome) === p));
    if (naoEncontrados.length) {
      console.log(`\n⚠️  Na lista mas sem pagante+logo correspondente: ${naoEncontrados.join(', ')}`);
    }
  }

  console.log(`\n# Entram na esteira: ${entram.length}`);
  if (entram.length < 4) {
    console.log(`⚠️  Menos de 4 — a esteira continua escondida de propósito (vitrine curta`);
    console.log(`   escancara o tamanho da base). Consiga mais autorizações antes de publicar.`);
  }

  if (copiarPara) {
    fs.mkdirSync(copiarPara, { recursive: true });
    for (const r of entram) {
      const origem = path.join(LOGO_DIR, path.basename(r.logo_url));
      const destino = path.join(copiarPara, path.basename(r.logo_url));
      try { fs.copyFileSync(origem, destino); }
      catch (e) { console.log(`⚠️  não copiei ${origem}: ${e.code}`); }
    }
    console.log(`# Arquivos copiados para ${copiarPara}`);
  }

  console.log(`\n// ── cole no array LOGOS da landing (bloco "PROVA SOCIAL · LOGOS") ──`);
  console.log('var LOGOS = [');
  for (const r of entram) {
    const nome = r.nome.trim().replace(/'/g, "\\'");
    console.log(`  { nome: '${nome}', logo: '/logos/${path.basename(r.logo_url)}' },`);
  }
  console.log('];');
})().catch(e => { console.error('[logos]', e.message); process.exit(1); });
