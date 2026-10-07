/* ONNX inference stays in this worker so the camera interface remains responsive. */
importScripts('./vendor/ort.wasm.min.js');
ort.env.wasm.wasmPaths = new URL('./vendor/', self.location.href).href;
ort.env.wasm.numThreads = 1;
const labels = {14:'Ave',15:'Gato',16:'Perro',17:'Caballo',18:'Oveja',19:'Vaca',20:'Elefante',21:'Oso',22:'Cebra',23:'Jirafa'};
let session;

async function loadModel() {
  if (session) return;
  self.postMessage({ type: 'status', text: 'Descargando YOLOv5 y su motor (~40 MB la primera vez)…' });
  const [modelResponse, manifestResponse] = await Promise.all([
    fetch('./models/yolov5s.onnx'), fetch('./models/manifest.json')
  ]);
  if (!modelResponse.ok || !manifestResponse.ok) throw new Error('No se pudo descargar el modelo. Revisa tu conexión y vuelve a intentar.');
  const manifest = await manifestResponse.json();
  const model = await modelResponse.arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', model));
  const hash = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== manifest.onnx_sha256) throw new Error('El modelo descargado no pasó la verificación de integridad.');
  self.postMessage({ type: 'status', text: 'Preparando YOLOv5 en tu dispositivo…' });
  session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
}

function overlap(a, b) {
  const intersection = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
    Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const area = box => Math.max(0, box[2] - box[0]) * Math.max(0, box[3] - box[1]);
  return intersection / Math.max(area(a) + area(b) - intersection, 1e-9);
}

function decode(data, geometry, threshold) {
  const detections = [];
  const { scale, padX, padY, width, height } = geometry;
  for (let offset = 0; offset < data.length; offset += 85) {
    if (data[offset + 4] < threshold) continue;
    let best = -1, classId = 0;
    for (let id = 0; id < 80; id++) {
      if (data[offset + 5 + id] > best) { best = data[offset + 5 + id]; classId = id; }
    }
    const confidence = data[offset + 4] * best;
    if (confidence < threshold || !labels[classId]) continue;
    const [x, y, w, h] = data.subarray(offset, offset + 4);
    const clamp = (value, limit) => Math.max(0, Math.min(limit, value));
    const box = [clamp((x - w / 2 - padX) / scale, width), clamp((y - h / 2 - padY) / scale, height),
      clamp((x + w / 2 - padX) / scale, width), clamp((y + h / 2 - padY) / scale, height)];
    detections.push({ label: labels[classId], class_id: classId, confidence, box });
  }
  detections.sort((a, b) => b.confidence - a.confidence);
  const selected = [];
  for (const detection of detections) {
    if (!selected.some(prior => prior.class_id === detection.class_id && overlap(prior.box, detection.box) > .45)) {
      selected.push(detection);
      if (selected.length === 100) break;
    }
  }
  return selected;
}

self.onmessage = async event => {
  try {
    await loadModel();
    self.postMessage({ type: 'status', text: 'Buscando animales en tu foto…' });
    const start = performance.now();
    const input = new ort.Tensor('float32', event.data.tensor, [1, 3, 640, 640]);
    const outputs = await session.run({ [session.inputNames[0]]: input });
    const output = outputs[session.outputNames[0]];
    if (output.dims[2] !== 85) throw new Error('El modelo tiene una salida inesperada.');
    const detections = decode(output.data, event.data.geometry, event.data.confidence);
    input.dispose();
    for (const tensor of Object.values(outputs)) tensor.dispose();
    self.postMessage({ type: 'result', detections, elapsed_ms: Math.round(performance.now() - start) });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message || 'El navegador no pudo ejecutar el modelo.' });
  }
};
