'use strict';

window.renderBackgroundEditor = function (tool, body) {
  const controller = new AbortController();
  let state = null;
  let busy = false;
  let originalView = false;
  let brushMode = 'view';
  let drawing = false;
  let lastPoint = null;
  let frame = 0;
  let revision = 0;
  let history = [];
  let historyIndex = -1;
  let backgroundImage = null;
  let fileName = 'photo';
  const settings = { color: '', image: null, blur: 0, brightness: 100, contrast: 100, saturation: 100, feather: 0, shadow: false, cleanup: true };
  const colors = ['#ffffff', '#000000', '#2196f3', '#dceeff', '#f44336', '#e91e63', '#9c27b0', '#4054b8', '#00b140', '#ffce32', '#eeeeee'];
  const photos = [
    ['Forest', 'forest.jpg'], ['Beach', 'beach.jpg'], ['Mountains', 'mountains.jpg'], ['City', 'city.jpg'],
  ];
  const status = el('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const input = el('input', { type: 'file', accept: tool.accept, hidden: true });
  const backgroundInput = el('input', { type: 'file', accept: tool.accept, hidden: true });
  const preview = el('canvas', { class: 'bg-canvas', 'aria-label': 'Background removal image editor', tabindex: '0' });
  const cursor = el('div', { class: 'bg-brush-cursor', hidden: true });
  const stage = el('div', { class: 'bg-stage checker' }, preview, cursor);
  const dimensions = el('span', { class: 'muted' });
  const side = el('aside', { class: 'bg-sidebar' });
  const editor = el('div', { class: 'bg-editor', hidden: true }, stage, side);
  const imageUrl = el('input', { type: 'url', placeholder: 'https://...', 'aria-label': 'Image URL' });
  const loadUrl = iconButton('link', 'Load image URL', () => remoteImage(), 'Load');
  const upload = el('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => input.click() }, 'Upload image');
  const empty = el('div', { class: 'bg-upload' },
    upload, el('p', { class: 'muted' }, 'or drop an image'),
    el('form', { class: 'bg-url-form', onsubmit: event => { event.preventDefault(); remoteImage(); } }, imageUrl, loadUrl));

  function iconButton(icon, title, action, label) {
    return el('button', { class: 'btn bg-action', type: 'button', title, 'aria-label': title, onclick: action },
      el('i', { 'data-lucide': icon, 'aria-hidden': 'true' }), label || null);
  }
  const undo = iconButton('undo-2', 'Undo mask edit', () => restore(historyIndex - 1));
  const redo = iconButton('redo-2', 'Redo mask edit', () => restore(historyIndex + 1));
  const compare = iconButton('columns-2', 'Compare with original', () => { originalView = !originalView; compare.setAttribute('aria-pressed', String(originalView)); drawPreview(); });
  compare.setAttribute('aria-pressed', 'false');
  const newPhoto = iconButton('image-plus', 'Upload a new image', () => input.click());
  const format = el('select', { 'aria-label': 'Download format' },
    el('option', { value: 'png' }, 'PNG'), el('option', { value: 'webp' }, 'WebP'), el('option', { value: 'jpeg' }, 'JPG'));
  const save = iconButton('download', 'Download image', exportImage, 'Download');
  save.classList.add('btn-primary');
  const tabNames = ['Cutout', 'Background', 'Effects', 'Adjust'];
  const tabIcons = ['scissors', 'image', 'sparkles', 'sliders-horizontal'];
  const panes = {};
  const tabButtons = tabNames.map((name, index) => {
    const button = iconButton(tabIcons[index], name, () => selectTab(name), name);
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `bg-${name.toLowerCase()}`);
    button.id = `bg-tab-${name.toLowerCase()}`;
    panes[name] = el('div', { role: 'tabpanel', id: `bg-${name.toLowerCase()}`, 'aria-labelledby': button.id });
    return button;
  });
  const toolbar = el('div', { class: 'bg-toolbar' },
    el('div', { class: 'bg-tabs', role: 'tablist' }, tabButtons),
    el('div', { class: 'bg-commands' }, compare, undo, redo, newPhoto, format, save));
  side.append(...Object.values(panes));
  body.replaceChildren(input, backgroundInput, toolbar, empty, status, editor,
    el('div', { class: 'bg-meta' }, dimensions));

  function selectTab(name) {
    tabButtons.forEach((button, index) => {
      button.classList.toggle('active', tabNames[index] === name);
      button.setAttribute('aria-selected', String(tabNames[index] === name));
    });
    Object.entries(panes).forEach(([key, pane]) => { pane.hidden = key !== name; });
    if (name !== 'Cutout') brushMode = 'view';
    updateButtons();
  }

  function slider(label, min, max, value, change, step = 1) {
    const field = el('input', { type: 'range', min, max, step, value, 'aria-label': label });
    const output = el('output', {}, value);
    field.addEventListener('input', () => { output.textContent = field.value; change(Number(field.value)); });
    return el('label', { class: 'field' }, el('span', {}, label, output), field);
  }

  const brush = el('input', { type: 'range', min: 2, max: 150, value: 24, 'aria-label': 'Brush size' });
  const brushButtons = ['view', 'erase', 'restore'].map(mode => iconButton(
    { view: 'mouse-pointer-2', erase: 'eraser', restore: 'paintbrush' }[mode], mode[0].toUpperCase() + mode.slice(1),
    () => { brushMode = mode; originalView = false; compare.setAttribute('aria-pressed', 'false'); updateButtons(); drawPreview(); },
    mode[0].toUpperCase() + mode.slice(1)));
  const cleanup = el('input', { type: 'checkbox', checked: true });
  cleanup.addEventListener('change', () => { settings.cleanup = cleanup.checked; drawPreview(); });
  panes.Cutout.append(el('h3', {}, 'Cutout'), el('div', { class: 'bg-modes' }, brushButtons),
    el('label', { class: 'field' }, el('span', {}, 'Brush size'), brush),
    slider('Feather', 0, 4, 0, value => { settings.feather = value; drawPreview(); }, 0.25),
    el('label', { class: 'bg-check' }, cleanup, 'Remove color halo'),
    el('button', { class: 'btn btn-block', onclick: () => { if (state) { const context = state.mask.getContext('2d'); context.clearRect(0, 0, state.mask.width, state.mask.height); context.drawImage(state.initialMask, 0, 0); remember(); drawPreview(); } } }, 'Reset cutout'));

  const colorInput = el('input', { type: 'color', value: '#2196f3', 'aria-label': 'Custom background color' });
  const colorPane = el('div', {}, el('div', { class: 'bg-swatches' },
    iconButton('ban', 'Transparent background', () => setBackground('', null)),
    colors.map(color => el('button', { class: 'bg-swatch', type: 'button', 'data-color': color, 'aria-pressed': 'false', style: { background: color }, 'aria-label': `Background ${color}`, title: color,
      onclick: () => { colorInput.value = color; setBackground(color, null); } }))),
    el('label', { class: 'field' }, el('span', {}, 'Custom color'), colorInput));
  colorInput.addEventListener('input', () => setBackground(colorInput.value, null));
  const gallery = el('div', { class: 'bg-photo-grid' });
  const search = el('input', { type: 'search', placeholder: 'Search backgrounds', 'aria-label': 'Search backgrounds' });
  const photoPane = el('div', { hidden: true }, search,
    el('button', { class: 'btn btn-block', onclick: () => backgroundInput.click() }, '+ Upload background'), gallery);
  function drawGallery() {
    gallery.replaceChildren(...photos.filter(([name]) => name.toLowerCase().includes(search.value.toLowerCase())).map(([name, asset]) =>
      el('button', { type: 'button', class: 'bg-photo', title: name, 'aria-label': `${name} background`, onclick: () => chooseBackground(`static/backgrounds/${asset}`) },
        el('img', { src: `static/backgrounds/${asset}`, alt: name, loading: 'lazy' }), el('span', {}, name))));
    if (!gallery.childElementCount) gallery.append(el('p', { class: 'muted' }, 'No matching backgrounds.'));
  }
  search.addEventListener('input', drawGallery);
  const colorTab = el('button', { class: 'btn active', role: 'tab', 'aria-selected': 'true', onclick: () => switchBackgroundTab(false) }, 'Color');
  const photoTab = el('button', { class: 'btn', role: 'tab', 'aria-selected': 'false', onclick: () => switchBackgroundTab(true) }, 'Photo');
  function switchBackgroundTab(showPhoto) {
    photoPane.hidden = !showPhoto;
    colorPane.hidden = showPhoto;
    colorTab.classList.toggle('active', !showPhoto);
    photoTab.classList.toggle('active', showPhoto);
    colorTab.setAttribute('aria-selected', String(!showPhoto));
    photoTab.setAttribute('aria-selected', String(showPhoto));
    if (showPhoto) drawGallery();
  }
  panes.Background.append(el('h3', {}, 'Background'), el('div', { class: 'bg-modes', role: 'tablist' }, colorTab, photoTab), colorPane, photoPane);

  const blurOriginal = el('input', { type: 'checkbox' });
  blurOriginal.addEventListener('change', () => {
    if (!state) return;
    if (blurOriginal.checked) { setBackground('', state.original); blurOriginal.checked = true; settings.blur = 12; }
    else { settings.blur = 0; setBackground('', null); }
    blurSlider.querySelector('input').value = settings.blur;
    blurSlider.querySelector('output').textContent = settings.blur;
    drawPreview();
  });
  const blurSlider = slider('Background blur', 0, 30, 0, value => { settings.blur = value; drawPreview(); });
  const shadow = el('input', { type: 'checkbox' });
  shadow.addEventListener('change', () => { settings.shadow = shadow.checked; drawPreview(); });
  panes.Effects.append(el('h3', {}, 'Effects'),
    el('label', { class: 'bg-check' }, blurOriginal, 'Blur original background'),
    blurSlider,
    el('label', { class: 'bg-check' }, shadow, 'Subject shadow'));
  panes.Adjust.append(el('h3', {}, 'Adjust'),
    ...['brightness', 'contrast', 'saturation'].map(key => slider(key[0].toUpperCase() + key.slice(1), key === 'saturation' ? 0 : 25, 200, 100, value => { settings[key] = value; drawPreview(); })),
    el('button', { class: 'btn btn-block', onclick: () => { settings.brightness = settings.contrast = settings.saturation = 100; panes.Adjust.querySelectorAll('input[type=range]').forEach(field => { field.value = 100; field.previousElementSibling.querySelector('output').textContent = '100'; }); drawPreview(); } }, 'Reset adjustments'));

  function updateButtons() {
    [save, format, compare, ...tabButtons].forEach(button => { button.disabled = !state || busy; });
    input.disabled = backgroundInput.disabled = busy;
    upload.disabled = imageUrl.disabled = loadUrl.disabled = busy;
    newPhoto.disabled = busy;
    side.querySelectorAll('button, input').forEach(control => { control.disabled = !state || busy; });
    blurSlider.querySelector('input').disabled = !state || busy || !settings.image;
    if (typeof preview.getContext('2d').filter !== 'string') {
      side.querySelectorAll('input[type=range]').forEach(control => {
        if (control !== brush) { control.disabled = true; control.title = 'This effect requires browser Canvas filter support.'; }
      });
      blurOriginal.disabled = true;
    }
    undo.disabled = busy || historyIndex <= 0;
    redo.disabled = busy || historyIndex >= history.length - 1;
    brushButtons.forEach((button, index) => { button.classList.toggle('active', brushMode === ['view', 'erase', 'restore'][index]); button.setAttribute('aria-pressed', String(brushMode === ['view', 'erase', 'restore'][index])); });
    preview.style.cursor = brushMode === 'view' ? 'default' : 'crosshair';
  }

  function remember() {
    const pixels = state.mask.getContext('2d').getImageData(0, 0, state.mask.width, state.mask.height).data;
    const alpha = new Uint8Array(state.mask.width * state.mask.height);
    for (let index = 0; index < alpha.length; index++) alpha[index] = pixels[index * 4 + 3];
    history.splice(historyIndex + 1);
    history.push(alpha);
    const capacity = Math.max(2, Math.min(12, Math.floor(24000000 / alpha.length)));
    if (history.length > capacity) history.shift();
    historyIndex = history.length - 1;
    updateButtons();
  }

  function restore(index) {
    if (!state || index < 0 || index >= history.length) return;
    historyIndex = index;
    const context = state.mask.getContext('2d');
    const pixels = context.createImageData(state.mask.width, state.mask.height);
    history[index].forEach((alpha, pixel) => pixels.data.set([255, 255, 255, alpha], pixel * 4));
    context.putImageData(pixels, 0, 0);
    updateButtons();
    drawPreview();
  }

  function setBackground(color, image) {
    revision++;
    settings.color = color;
    settings.image = image;
    settings.blur = 0;
    blurOriginal.checked = false;
    blurSlider.querySelector('input').value = 0;
    blurSlider.querySelector('output').textContent = '0';
    side.querySelectorAll('.bg-swatch').forEach(button => button.setAttribute('aria-pressed', String(!image && button.dataset.color === color)));
    if (!busy) setStatus(status, '');
    updateButtons();
    drawPreview();
  }

  async function chooseBackground(source) {
    if (!state || busy) return;
    const token = ++revision;
    setStatus(status, 'Loading background...', 'busy');
    try {
      const blob = source instanceof Blob ? source : await (await fetch(source)).blob();
      if (blob.size > 30 * 1024 * 1024) throw new Error('Background image must be smaller than 30 MB.');
      const image = await createImageBitmap(blob);
      if (image.width * image.height > 12000000) { image.close(); throw new Error('Choose a background up to 12 megapixels.'); }
      if (controller.signal.aborted || token !== revision) { image.close(); return; }
      if (backgroundImage) backgroundImage.close();
      backgroundImage = image;
      setBackground('', image);
      setStatus(status, '');
    } catch (error) { if (!controller.signal.aborted && token === revision) setStatus(status, error.message, 'error'); }
  }

  function drawPreview() {
    if (!state || controller.signal.aborted) return;
    const maskContext = state.previewMask.getContext('2d');
    maskContext.clearRect(0, 0, state.previewMask.width, state.previewMask.height);
    maskContext.drawImage(state.mask, 0, 0, state.previewMask.width, state.previewMask.height);
    const scaled = { ...settings, feather: settings.feather * state.ratio, blur: settings.blur * state.ratio };
    const output = originalView ? state.previewOriginal : BackgroundEngine.compose(state.previewOriginal, state.previewMask, scaled);
    const context = preview.getContext('2d');
    context.clearRect(0, 0, preview.width, preview.height);
    context.drawImage(output, 0, 0, preview.width, preview.height);
    if (!originalView) output.width = output.height = 1;
  }

  async function open(file) {
    if (!file || busy) return;
    if (!acceptsFile(tool, file)) return setStatus(status, 'Choose a JPG, PNG, WEBP, BMP or GIF image.', 'error');
    busy = true;
    const token = ++revision;
    updateButtons();
    try {
      const result = await BackgroundEngine.remove(file, message => { if (!controller.signal.aborted) setStatus(status, message, message ? 'busy' : ''); });
      if (controller.signal.aborted || token !== revision) return;
      state = result;
      const ratio = Math.min(1, 1000 / Math.max(result.original.width, result.original.height));
      state.ratio = ratio;
      state.initialMask = BackgroundEngine.surface(result.mask.width, result.mask.height);
      state.initialMask.getContext('2d').drawImage(result.mask, 0, 0);
      state.previewOriginal = BackgroundEngine.surface(Math.max(1, Math.round(result.original.width * ratio)), Math.max(1, Math.round(result.original.height * ratio)));
      state.previewOriginal.getContext('2d').drawImage(result.original, 0, 0, state.previewOriginal.width, state.previewOriginal.height);
      state.previewMask = BackgroundEngine.surface(state.previewOriginal.width, state.previewOriginal.height);
      preview.width = state.previewOriginal.width;
      preview.height = state.previewOriginal.height;
      originalView = false;
      compare.setAttribute('aria-pressed', 'false');
      fileName = file.name.replace(/\.[^.]+$/, '') || 'photo';
      history = [];
      historyIndex = -1;
      empty.hidden = true;
      editor.hidden = false;
      dimensions.textContent = `${result.original.width} x ${result.original.height} px`;
      if (blurOriginal.checked) settings.image = state.original;
      remember();
      drawPreview();
      setStatus(status, '');
    } catch (error) { if (!controller.signal.aborted) setStatus(status, error.message, 'error'); }
    finally { busy = false; updateButtons(); }
  }

  async function remoteImage() {
    if (busy) return;
    try {
      const url = new URL(imageUrl.value);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Enter a public HTTP or HTTPS image URL.');
      busy = true;
      updateButtons();
      setStatus(status, 'Loading image...', 'busy');
      const response = await fetch(url.href, { credentials: 'omit', signal: controller.signal });
      if (!response.ok) throw new Error(`Image request failed (${response.status}).`);
      if (Number(response.headers.get('content-length')) > 30 * 1024 * 1024) throw new Error('Choose an image smaller than 30 MB.');
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 30 * 1024 * 1024) { await reader.cancel(); throw new Error('Choose an image smaller than 30 MB.'); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const blob = new Blob(chunks, { type: (response.headers.get('content-type') || '').split(';')[0].trim() });
      const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp' }[blob.type];
      if (!extension) throw new Error('The URL must point directly to a JPG, PNG, WEBP, BMP or GIF image.');
      busy = false;
      if (!controller.signal.aborted) await open(new File([blob], `url_photo.${extension}`, { type: blob.type }));
    } catch (error) {
      if (!controller.signal.aborted) setStatus(status, error.name === 'TypeError' ? 'This image URL is invalid or its host blocks browser access. Use Upload image instead.' : error.message, 'error');
    } finally { busy = false; updateButtons(); }
  }

  function point(event) {
    const rect = preview.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * state.original.width / rect.width, y: (event.clientY - rect.top) * state.original.height / rect.height };
  }
  function stroke(next) {
    const context = state.mask.getContext('2d');
    context.globalCompositeOperation = brushMode === 'erase' ? 'destination-out' : 'source-over';
    context.strokeStyle = context.fillStyle = '#ffffff';
    context.lineCap = context.lineJoin = 'round';
    context.lineWidth = Number(brush.value);
    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
    context.lineTo(next.x, next.y);
    context.stroke();
    context.beginPath();
    context.arc(next.x, next.y, Number(brush.value) / 2, 0, Math.PI * 2);
    context.fill();
    context.globalCompositeOperation = 'source-over';
    lastPoint = next;
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; drawPreview(); });
  }
  preview.addEventListener('pointerdown', event => {
    if (!state || busy || originalView || brushMode === 'view') return;
    event.preventDefault();
    preview.setPointerCapture(event.pointerId);
    drawing = true;
    lastPoint = point(event);
    stroke(lastPoint);
  });
  preview.addEventListener('pointermove', event => {
    if (!state || busy || brushMode === 'view' || originalView) { cursor.hidden = true; return; }
    const rect = stage.getBoundingClientRect();
    const size = Number(brush.value) * preview.getBoundingClientRect().width / state.original.width;
    cursor.hidden = false;
    Object.assign(cursor.style, { width: `${size}px`, height: `${size}px`, left: `${event.clientX - rect.left + stage.scrollLeft}px`, top: `${event.clientY - rect.top + stage.scrollTop}px` });
    if (drawing) stroke(point(event));
  });
  function finishStroke() {
    if (!drawing) return;
    drawing = false;
    remember();
    drawPreview();
  }
  preview.addEventListener('pointerup', finishStroke);
  preview.addEventListener('pointercancel', finishStroke);
  preview.addEventListener('lostpointercapture', finishStroke);
  preview.addEventListener('pointerleave', () => { cursor.hidden = true; });
  input.addEventListener('change', () => { open(input.files[0]); input.value = ''; });
  backgroundInput.addEventListener('change', () => { if (backgroundInput.files[0]) chooseBackground(backgroundInput.files[0]); backgroundInput.value = ''; });
  body.addEventListener('dragover', event => { event.preventDefault(); empty.classList.add('over'); });
  body.addEventListener('dragleave', () => empty.classList.remove('over'));
  body.addEventListener('drop', event => { event.preventDefault(); empty.classList.remove('over'); open(event.dataTransfer.files[0]); });
  document.addEventListener('paste', event => {
    if (/INPUT|TEXTAREA/.test(event.target.tagName) || event.target.isContentEditable) return;
    const image = [...event.clipboardData.files].find(file => file.type.startsWith('image/'));
    if (image) { event.preventDefault(); open(image); }
  }, { signal: controller.signal });

  async function exportImage() {
    if (!state || busy) return;
    busy = true;
    updateButtons();
    setStatus(status, 'Preparing download...', 'busy');
    try {
      const output = BackgroundEngine.compose(state.original, state.mask, settings);
      if (format.value === 'jpeg') {
        const opaque = BackgroundEngine.surface(output.width, output.height);
        const context = opaque.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, opaque.width, opaque.height);
        context.drawImage(output, 0, 0);
        output.getContext('2d').drawImage(opaque, 0, 0);
        opaque.width = opaque.height = 1;
      }
      const type = `image/${format.value}`;
      const blob = await new Promise(resolve => output.toBlob(resolve, type, 0.95));
      output.width = output.height = 1;
      if (!blob || blob.type !== type) throw new Error('Your browser cannot export this format. Choose PNG.');
      if (!controller.signal.aborted) { download(blob, `${fileName}_cutout.${format.value === 'jpeg' ? 'jpg' : format.value}`); setStatus(status, ''); }
    } catch (error) { setStatus(status, error.message, 'error'); }
    finally { busy = false; updateButtons(); }
  }

  window.disposeBackgroundEditor = () => {
    controller.abort();
    revision++;
    cancelAnimationFrame(frame);
    if (backgroundImage) backgroundImage.close();
    state = null;
    history = [];
    window.disposeBackgroundEditor = null;
  };
  selectTab('Background');
  updateButtons();
  if (window.lucide) lucide.createIcons();
};