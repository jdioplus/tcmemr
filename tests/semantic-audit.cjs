const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ROOT = path.resolve(__dirname, '..');
const SOURCE = process.argv[2] || path.join(ROOT, 'semantic/semantic-demo.html');
const OUT = path.join(ROOT, 'semantic/test-results');
const data = fs.readFileSync(SOURCE);
const crypto = require('crypto');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath:process.env.CHROME_PATH || undefined,channel:process.env.CHROME_PATH ? undefined : 'chrome', headless: true });
  const context = await browser.newContext({ offline: true, viewport: { width: 1280, height: 900 } });
  const http = [], requests = [], errors = [], consoleMessages = [];
  await context.route(/^https?:\/\//, route => { http.push(route.request().url()); return route.abort(); });
  await context.addInitScript(() => {
    window.__semanticWrites = [];
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...args) { window.__semanticWrites.push('Storage.setItem'); return original.apply(this, args); };
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args) { window.__semanticWrites.push('IndexedDB.open'); return open.apply(this, args); };
  });
  const page = await context.newPage();
  page.on('request', r => { requests.push(r.url()); if (/^https?:/i.test(r.url()) && !http.includes(r.url())) http.push(r.url()); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleMessages.push({ type: m.type(), text: m.text() }); });
  const result = { testedAt: new Date().toISOString(), source: SOURCE, bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex'), chrome: browser.version(), contextOffline: true, checks: [] };
  function check(name, condition) { assert.ok(condition, name); result.checks.push(name); console.log('PASS:', name); }
  page.on('console', m => { if (m.text().startsWith('SEMANTIC')) console.log(m.text()); });
  try {
    await page.goto('file://' + SOURCE, { waitUntil: 'load', timeout: 45000 });
    await page.evaluate(() => window.addEventListener('bingli-semantic-status', e => { const s = e.detail; console.log('SEMANTIC', s.state, s.completedChunks, s.totalChunks, s.lastError); }));
    check('No model loading until requested', await page.evaluate(() => BingliSemantic.status().state === 'idle'));
    result.tokenization = await page.evaluate(() => {
      const phrases = ['无发热、无咳嗽。', '有发热、有咳嗽。', 'Hb 86 g/L，WBC 3.2×10^9/L；CT：新发磨玻璃影', '肝胃不和，舌淡红、苔薄白，脉弦', '[CLS] x\u0000\ufffd\t中 文', 'A'.repeat(101)];
      return phrases.map(text => ({ text, ...BingliSemantic.tokenize(text) }));
    });
    check('Chinese positive and negative tokens remain distinct', JSON.stringify(result.tokenization[0].ids) !== JSON.stringify(result.tokenization[1].ids));
    check('Mixed Chinese report keeps numbers and units as valid token IDs', result.tokenization[2].ids.length > 15 && result.tokenization[2].ids.every(Number.isInteger));
    check('WordPiece overlong word emits unknown token', result.tokenization[5].ids.join(',') === '101,100,102');
    const start = Date.now();
    result.embedding = await page.evaluate(async () => {
      const t = performance.now();
      const embedded = await BingliSemantic.embedding('化疗后乏力，Hb 86 g/L，进食减少。');
      return { ...embedded, vector: embedded.vector.slice(0, 8), norm: Math.sqrt(embedded.vector.reduce((sum, value) => sum + value * value, 0)), elapsedMs: Math.round(performance.now() - t), status: BingliSemantic.status() };
    });
    result.firstEmbeddingWallMs = Date.now() - start;
    check('Real local encoder returns normalized 512-dimensional vector', result.embedding.dimension === 512 && Math.abs(result.embedding.norm - 1) < 1e-5 && result.embedding.vector.every(Number.isFinite));
    result.firstSearch = await page.evaluate(async () => {
      const t = performance.now();
      const matches = await BingliSemantic.search('化疗后乏力，血红蛋白下降，进食减少', DOCS, { limit: 6 });
      return { elapsedMs: Math.round(performance.now() - t), matches, status: BingliSemantic.status() };
    });
    check('Relevant anemia or intake passage precedes unrelated UI text', ['anemia', 'intake'].includes(result.firstSearch.matches[0].id) && result.firstSearch.matches.findIndex(m => m.id === 'unrelated') > 1);
    check('Similarity scores are finite and ordered', result.firstSearch.matches.every((m, i, all) => Number.isFinite(m.score) && m.score <= 1 && m.score >= -1 && (i === 0 || all[i - 1].score >= m.score)));
    result.warmSearch = await page.evaluate(async () => {
      const t = performance.now();
      const matches = await BingliSemantic.search('Hb下降伴乏力，需考虑贫血原因', DOCS, { limit: 2 });
      return { elapsedMs: Math.round(performance.now() - t), matches, status: BingliSemantic.status() };
    });
    check('Document vectors are reused in memory', result.warmSearch.status.cachedChunks === result.firstSearch.status.cachedChunks);
    result.mixedReportSearch = await page.evaluate(async () => {
      const t = performance.now();
      const matches = await BingliSemantic.search('患者无发热，CT报告见新发磨玻璃影，需鉴别治疗相关肺损伤、感染及肿瘤变化', DOCS, { limit: 3 });
      return { elapsedMs: Math.round(performance.now() - t), matches };
    });
    check('Mixed report retrieves lung change differential passage', result.mixedReportSearch.matches[0].id === 'infection');
    result.negationProbe = await page.evaluate(async () => {
      const docs = [
        { id: 'negative', text: '患者无发热，无咳嗽，无咳痰。' },
        { id: 'positive', text: '患者有发热，有咳嗽，有咳痰。' },
        { id: 'unrelated', text: '患者下肢水肿，记录每日体重变化。' }
      ];
      return { query: '患者无发热，无咳嗽，无咳痰', matches: await BingliSemantic.search('患者无发热，无咳嗽，无咳痰', docs, { limit: 3 }), interpretation: '编码器相似度不保证否定识别；临床事实仍需原文规则与医师核对。' };
    });
    result.longPassage = await page.evaluate(async () => {
      const doc = '浏览器显示按钮和页面，文件可以保存。'.repeat(32) + ' 贫血导致相关乏力需要结合血红蛋白下降、网织红细胞与铁代谢复查评估。';
      const matches = await BingliSemantic.search('血红蛋白下降及乏力，复查网织红细胞和铁代谢', [{ id: 'long', text: doc }, { id: 'other', text: '天气晴朗，页面窗口和按钮可以移动。' }], { limit: 2 });
      return { matches, tokens: BingliSemantic.tokenize(doc).totalTokens };
    });
    check('Long documents search beyond first model window through chunks', result.longPassage.tokens > 512 && result.longPassage.matches[0].id === 'long' && result.longPassage.matches[0].chunkIndex > 0);
    await page.locator('#search').click();
    await page.waitForFunction(() => !document.getElementById('search').disabled, { timeout: 45000 });
    check('Visible demo uses search API and displays matches', await page.locator('#results li').count() === 4);
    await page.screenshot({ path: path.join(OUT, 'desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    check('390-pixel display fits viewport', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(OUT, 'mobile.png'), fullPage: true });
    result.browserWrites = await page.evaluate(() => window.__semanticWrites);
    result.httpRequests = http;
    result.requests = requests;
    result.pageErrors = errors;
    result.consoleMessages = consoleMessages;
    check('Completely offline execution emits zero HTTP requests', http.length === 0);
    check('No localStorage or IndexedDB writes', result.browserWrites.length === 0);
    check('No uncaught page errors', errors.length === 0);
    result.pass = true;
    fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ pass: true, checks: result.checks.length, chrome: result.chrome, firstEmbeddingMs: result.embedding.elapsedMs, firstSearchMs: result.firstSearch.elapsedMs, warmSearchMs: result.warmSearch.elapsedMs, httpRequests: http.length, result: path.join(OUT, 'result.json') }, null, 2));
  } catch (error) {
    result.pass = false;
    result.failure = error.stack;
    result.pageErrors = errors;
    result.consoleMessages = consoleMessages;
    result.httpRequests = http;
    await page.screenshot({ path: path.join(OUT, 'failure.png'), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
