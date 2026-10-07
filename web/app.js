const $ = id => document.getElementById(id);
let selectedImage = null, previewUrl = null, worker = null, busy = false, selection = 0;
function status(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}
function clearResults() {
  $('results').replaceChildren();
  $('total').textContent = '—';
  $('download').hidden = true;
  $('download').removeAttribute('href');
}
async function choose(file) {
  if (!file || busy) return;
  if (file.size > 12 * 1024 * 1024) { status('La foto supera 12 MB. Elige una más pequeña.', true); return; }
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { status('Usa JPG, PNG o WebP. Convierte las fotos HEIC a JPG.', true); return; }
  const current = ++selection;
  const url = URL.createObjectURL(file);
  const image = new Image(); image.src = url;
  try {
    await image.decode();
    if (current !== selection) { URL.revokeObjectURL(url); return; }
    if (image.naturalWidth * image.naturalHeight > 24000000) throw new Error('Usa una foto de hasta 24 megapíxeles.');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = url; selectedImage = image;
    $('preview').src = url; $('preview').hidden = false;
    $('preview').alt = 'Foto seleccionada para detectar animales';
    $('empty-state').hidden = true;
    $('photo-name').textContent = file.name;
    $('analyze-button').disabled = false;
    clearResults();
    $('result-summary').textContent = 'Imagen lista. Pulsa Analizar imagen.';
    status('Lista. Tu foto se analizará aquí, sin subirla.');
  } catch (error) {
    URL.revokeObjectURL(url);
    status(error.message.includes('megapíxeles') ? error.message : 'No pudimos leer esa foto. Prueba otra imagen.', true);
  }
}
$('upload-button').onclick = () => $('upload-input').click();
$('camera-button').onclick = () => $('camera-input').click();
for (const id of ['upload-input', 'camera-input']) {
  $(id).onchange = event => { choose(event.target.files[0]); event.target.value = ''; };
}
$('confidence').oninput = () => {
  $('confidence-value').textContent = $('confidence').value + '%';
  if (selectedImage) status('Pulsa Analizar imagen para aplicar esta confianza.');
};

function prepare(image) {
  const canvas = document.createElement('canvas');
  const ratio = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.round(image.naturalWidth * ratio);
  canvas.height = Math.round(image.naturalHeight * ratio);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const square = document.createElement('canvas'); square.width = square.height = 640;
  const squareContext = square.getContext('2d', { willReadFrequently: true });
  squareContext.fillStyle = 'rgb(114,114,114)'; squareContext.fillRect(0, 0, 640, 640);
  const scale = Math.min(640 / canvas.width, 640 / canvas.height);
  const width = Math.round(canvas.width * scale), height = Math.round(canvas.height * scale);
  const padX = Math.floor((640 - width) / 2), padY = Math.floor((640 - height) / 2);
  squareContext.drawImage(canvas, padX, padY, width, height);
  const pixels = squareContext.getImageData(0, 0, 640, 640).data;
  const tensor = new Float32Array(3 * 640 * 640);
  const plane = 640 * 640;
  for (let i = 0; i < plane; i++) {
    tensor[i] = pixels[i * 4] / 255;
    tensor[i + plane] = pixels[i * 4 + 1] / 255;
    tensor[i + 2 * plane] = pixels[i * 4 + 2] / 255;
  }
  return { canvas, tensor, geometry: { scale, padX, padY, width: canvas.width, height: canvas.height } };
}

function infer(input) {
  return new Promise((resolve, reject) => {
    worker ||= new Worker('./worker.js');
    const timeout = setTimeout(() => {
      worker.terminate(); worker = null;
      reject(new Error('El análisis tardó demasiado. Revisa tu conexión o prueba en un dispositivo más reciente.'));
    }, 180000);
    worker.onmessage = event => {
      const message = event.data;
      if (message.type === 'status') { status(message.text); $('loading').querySelector('p').textContent = message.text; return; }
      clearTimeout(timeout);
      if (message.type === 'error') { worker.terminate(); worker = null; reject(new Error(message.message)); }
      else resolve(message);
    };
    worker.onerror = () => {
      clearTimeout(timeout); worker.terminate(); worker = null;
      reject(new Error('No se pudo iniciar el motor. Abre la app en Chrome o Safari actualizado y vuelve a intentar.'));
    };
    worker.postMessage({ tensor: input.tensor, geometry: input.geometry, confidence: Number($('confidence').value) / 100 }, [input.tensor.buffer]);
  });
}

function annotate(canvas, detections) {
  const context = canvas.getContext('2d');
  const fontSize = Math.max(18, Math.round(canvas.width / 32));
  context.font = `bold ${fontSize}px Arial`;
  context.lineWidth = Math.max(3, Math.round(canvas.width / 300));
  for (const detection of detections) {
    const [x, y, x2, y2] = detection.box;
    context.strokeStyle = '#a3e635'; context.strokeRect(x, y, x2 - x, y2 - y);
    const text = `${detection.label} ${Math.round(detection.confidence * 100)}%`;
    const top = Math.max(0, y - fontSize - 10);
    context.fillStyle = '#a3e635'; context.fillRect(x, top, context.measureText(text).width + 12, fontSize + 10);
    context.fillStyle = '#152d23'; context.fillText(text, x + 6, top + fontSize);
  }
  return canvas.toDataURL('image/jpeg', .88);
}

$('analyze-button').onclick = async () => {
  if (!selectedImage || busy) return;
  busy = true;
  for (const id of ['analyze-button','upload-button','camera-button','confidence']) $(id).disabled = true;
  clearResults(); $('loading').hidden = false;
  $('loading').querySelector('p').textContent = 'Preparando tu foto…';
  $('result-summary').textContent = 'Analizando en tu dispositivo…';
  try {
    if (!window.Worker || !WebAssembly || !window.crypto?.subtle) throw new Error('Abre la aplicación mediante HTTPS en un navegador actualizado.');
    const input = prepare(selectedImage);
    const result = await infer(input);
    const image = annotate(input.canvas, result.detections);
    $('preview').src = image;
    $('preview').alt = `Resultado: ${result.detections.length} animales detectados`;
    $('total').textContent = result.detections.length;
    $('result-summary').textContent = result.detections.length ? `${result.detections.length} ${result.detections.length === 1 ? 'animal detectado' : 'animales detectados'} en tu foto.` : 'No se detectaron animales con esta confianza. Prueba otra foto o baja el valor.';
    for (const detection of result.detections) {
      const row = document.createElement('div'); row.className = 'animal-row';
      const label = document.createElement('strong'); label.textContent = detection.label;
      const confidence = document.createElement('span'); confidence.textContent = `${Math.round(detection.confidence * 100)}% confianza`;
      row.append(label, confidence); $('results').append(row);
    }
    $('download').href = image; $('download').hidden = false;
    status(`Análisis completado en tu dispositivo · ${(result.elapsed_ms / 1000).toFixed(2)} s.`);
  } catch (error) {
    $('result-summary').textContent = 'El análisis no se completó.';
    status(error.message, true);
  } finally {
    busy = false; $('loading').hidden = true;
    for (const id of ['analyze-button','upload-button','camera-button','confidence']) $(id).disabled = false;
  }
};
