const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  let dog = process.env.CAMER_TEST_DOG_IMAGE;
  if (!dog) {
    dog = path.join(root, '.cache/test-dog.jpg');
    await fs.mkdir(path.dirname(dog), { recursive: true });
    const response = await fetch('https://raw.githubusercontent.com/pytorch/hub/master/images/dog.jpg');
    assert(response.ok, 'No se pudo descargar la foto de prueba');
    await fs.writeFile(dog, Buffer.from(await response.arrayBuffer()));
  }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const file = path.resolve(root, 'dist', '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
      assert(file.startsWith(path.join(root, 'dist') + path.sep));
      const data = await fs.readFile(file);
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); response.end(data);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    let executablePath = process.env.CAMER_BROWSER_EXECUTABLE;
    if (!executablePath) {
      try { await fs.access('/usr/bin/chromium'); executablePath = '/usr/bin/chromium'; } catch {}
    }
    browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push({ method: request.method(), url: request.url() }));
    page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
    await page.goto(process.env.CAMER_APP_URL || `http://127.0.0.1:${server.address().port}/`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Desbordamiento en pantalla de celular');
    await page.locator('#upload-input').setInputFiles(dog);
    await page.waitForFunction(() => !document.getElementById('analyze-button').disabled);
    async function analyze() {
      await page.locator('#analyze-button').click();
      await page.waitForFunction(() => !document.getElementById('analyze-button').disabled, null, { timeout: 180000 });
      const status = await page.locator('#status').innerText();
      assert(status.includes('Análisis completado'), status);
    }
    await analyze();
    const result = await page.locator('#results').innerText();
    assert(result.includes('Perro'), result);
    assert(Number(result.match(/(\d+)%/)[1]) >= 50, result);
    assert((await page.locator('#download').getAttribute('href')).startsWith('data:image/jpeg;base64,'));
    await page.screenshot({ path: path.join(root, '.cache/camer-static-mobile.png'), fullPage: true });
    console.log('PASS: foto real de perro, cajas, confianza y descarga en pantalla de celular:', result.replaceAll('\n', ' '));
    await page.locator('#confidence').evaluate(element => { element.value = '90'; element.dispatchEvent(new Event('input')); });
    await analyze();
    assert.equal(await page.locator('#total').innerText(), '0');
    console.log('PASS: el umbral de confianza filtra la detección');
    const blank = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 400;
      const context = canvas.getContext('2d'); context.fillStyle = 'white'; context.fillRect(0, 0, 800, 400);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.locator('#confidence').evaluate(element => { element.value = '35'; element.dispatchEvent(new Event('input')); });
    await page.locator('#upload-input').setInputFiles({ name: 'blank.png', mimeType: 'image/png', buffer: Buffer.from(blank, 'base64') });
    await page.waitForFunction(() => document.getElementById('photo-name').textContent === 'blank.png');
    await analyze();
    assert.equal(await page.locator('#total').innerText(), '0');
    console.log('PASS: imagen sin animales y reutilización del modelo cargado');
    await page.locator('#upload-input').setInputFiles({ name: 'bad.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image') });
    await page.waitForFunction(() => document.getElementById('status').classList.contains('error'));
    assert((await page.locator('#status').innerText()).includes('No pudimos leer'));
    console.log('PASS: imagen dañada rechazada');
    assert.deepEqual(errors, []);
    assert(requests.every(request => request.method === 'GET'), 'Se detectó envío de datos al servidor');
    if (!process.env.CAMER_APP_URL) assert(requests.every(request => {
      const url = new URL(request.url);
      return ['data:', 'blob:'].includes(url.protocol) || url.hostname === '127.0.0.1';
    }), 'Dependencia de servicios externos');
    console.log('PASS: sin errores JavaScript ni envío de fotografías al servidor');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
