import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const manifest = JSON.parse(await readFile(path.join(root, 'models/manifest.json'), 'utf8'));
const model = await readFile(path.join(root, 'models/yolov5s.onnx'));
if (createHash('sha256').update(model).digest('hex') !== manifest.onnx_sha256) throw new Error('Modelo con huella incorrecta');
await mkdir(path.join(dist, 'vendor'), { recursive: true });
await mkdir(path.join(dist, 'models'), { recursive: true });
let html = await readFile(path.join(root, 'static/index.html'), 'utf8');
html = html.replaceAll('/static/', './').replace('href="/"', 'href="./"');
html = html.replace('Las fotos se envían al servidor para analizarlas y no se conservan después del análisis.',
  'Las fotos se analizan en tu dispositivo y no se suben al servidor. La primera carga descarga aproximadamente 40 MB del modelo y su motor.');
await writeFile(path.join(dist, 'index.html'), html);
for (const file of ['styles.css', 'icon.svg']) await cp(path.join(root, 'static', file), path.join(dist, file));
for (const file of ['app.js', 'worker.js']) await cp(path.join(root, 'web', file), path.join(dist, file));
for (const file of ['yolov5s.onnx', 'manifest.json']) await cp(path.join(root, 'models', file), path.join(dist, 'models', file));
for (const file of ['ort.wasm.min.js', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  await cp(path.join(root, 'node_modules/onnxruntime-web/dist', file), path.join(dist, 'vendor', file));
}
await cp(path.join(root, 'web/ONNX-Runtime-LICENSE.txt'), path.join(dist, 'vendor/ONNX-Runtime-LICENSE.txt'));
await cp(path.join(root, 'LICENSE'), path.join(dist, 'LICENSE'));
const readme = await readFile(path.join(root, 'README.md'), 'utf8');
await writeFile(path.join(dist, 'README.md'), readme.replace('app_file: dist/index.html', 'app_file: index.html').replace(/^app_build_command:.*\n/m, ''));
console.log('Static Space preparado en dist/; modelo YOLOv5s verificado.');
