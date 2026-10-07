const $ = id => document.getElementById(id);
let selectedFile = null;
let previewUrl = null;
let busy = false;
function status(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}
function clearResults() {
  $('results').replaceChildren();
  $('total').textContent = '—';
  $('result-summary').textContent = 'Imagen lista. Pulsa Analizar imagen.';
  $('download').hidden = true;
  $('download').removeAttribute('href');
}
function choose(file) {
  if (!file || busy) return;
  if (file.size > 12 * 1024 * 1024) { status('La foto supera 12 MB. Elige una más pequeña.', true); return; }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    status('Usa JPG, PNG o WebP. Convierte las fotos HEIC a JPG.', true); return;
  }
  selectedFile = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  $('preview').src = previewUrl;
  $('preview').alt = 'Imagen seleccionada para detectar animales';
  $('preview').hidden = false;
  $('empty-state').hidden = true;
  $('photo-name').textContent = file.name;
  $('analyze-button').disabled = false;
  clearResults();
  status('Lista para analizar.');
}
$('upload-button').onclick = () => $('upload-input').click();
$('camera-button').onclick = () => $('camera-input').click();
for (const id of ['upload-input', 'camera-input']) {
  $(id).onchange = event => { choose(event.target.files[0]); event.target.value = ''; };
}
$('confidence').oninput = () => {
  $('confidence-value').textContent = $('confidence').value + '%';
  if (selectedFile) status('Pulsa Analizar imagen para aplicar esta confianza.');
};
$('analyze-button').onclick = async () => {
  if (!selectedFile || busy) return;
  busy = true;
  for (const id of ['analyze-button', 'camera-button', 'upload-button', 'confidence']) $(id).disabled = true;
  $('loading').hidden = false;
  clearResults();
  $('result-summary').textContent = 'Analizando tu imagen…';
  status('Buscando animales…');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const form = new FormData();
    form.append('file', selectedFile);
    form.append('confidence', Number($('confidence').value) / 100);
    const response = await fetch('/api/detect', { method: 'POST', body: form, signal: controller.signal });
    if (!response.ok) {
      let message = 'No pudimos analizar la foto. Intenta de nuevo.';
      try { const error = await response.json(); if (typeof error.detail === 'string') message = error.detail; } catch {}
      throw new Error(message);
    }
    const data = await response.json();
    $('preview').src = data.image;
    $('preview').alt = `Resultado: ${data.detections.length} animales detectados`;
    $('total').textContent = data.detections.length;
    $('result-summary').textContent = data.detections.length ? `${data.detections.length} ${data.detections.length === 1 ? 'animal detectado' : 'animales detectados'} en tu foto.` : 'No se detectaron animales con esta confianza. Prueba otra foto o baja el valor.';
    for (const detection of data.detections) {
      const row = document.createElement('div'); row.className = 'animal-row';
      const label = document.createElement('strong'); label.textContent = detection.label;
      const confidence = document.createElement('span'); confidence.textContent = `${Math.round(detection.confidence * 100)}% confianza`;
      row.append(label, confidence); $('results').append(row);
    }
    $('download').href = data.image;
    $('download').hidden = false;
    status(`Análisis completado · ${(data.elapsed_ms / 1000).toFixed(2)} s de detección.`);
  } catch (error) {
    $('result-summary').textContent = 'El análisis no se completó.';
    status(error.name === 'AbortError' ? 'El servidor tardó demasiado. Vuelve a intentarlo; el Space puede estar iniciándose.' : error.message, true);
  } finally {
    clearTimeout(timeout);
    busy = false;
    $('loading').hidden = true;
    for (const id of ['analyze-button', 'camera-button', 'upload-button', 'confidence']) $(id).disabled = false;
  }
};
