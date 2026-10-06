'use strict';

window.runBrowserTests = async function () {
  const checks = [];
  window.browserTestProgress = checks;
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const pdf = await PDFLib.PDFDocument.create();
  for (let index = 0; index < 3; index++) {
    const page = pdf.addPage([240 + index * 20, 320]);
    page.drawText(`Page ${index + 1}`, { x: 30, y: 260, size: 20 });
  }
  const file = new File([await pdf.save()], 'sample.pdf', { type: 'application/pdf' });
  const surface = document.createElement('canvas');
  surface.width = 200;
  surface.height = 100;
  const context = surface.getContext('2d');
  context.fillStyle = '#ee2233';
  context.fillRect(0, 0, 100, 100);
  context.fillStyle = '#229955';
  context.fillRect(100, 0, 100, 100);
  const image = new File([await new Promise(resolve => surface.toBlob(resolve, 'image/png'))], 'photo.png', { type: 'image/png' });

  async function run(tool, options = {}, files = [file], expectError = false) {
    const form = new FormData();
    files.forEach(entry => form.append('files', entry));
    for (const [key, value] of Object.entries(options)) form.append(key, value);
    const response = await BrowserTools.post(`/api/tool/${tool}`, form);
    if (expectError) {
      assert(!response.ok && (await response.json()).error, `${tool}: expected actionable error`);
      return;
    }
    assert(response.ok, `${tool}: ${response.ok ? '' : await response.text()}`);
    return response.blob();
  }

  const merged = await PDFLib.PDFDocument.load(await (await run('merge', {}, [file, file])).arrayBuffer());
  assert(merged.getPageCount() === 6 && merged.getPages()[3].getWidth() === 240, 'merge: wrong order or count');
  await run('merge', {}, [file], true);
  checks.push('merge and minimum file count');

  const split = await JSZip.loadAsync(await run('split', { mode: 'ranges', ranges: '1-2,3' }));
  const parts = Object.values(split.files);
  assert(parts.length === 2, 'split: wrong archive count');
  assert((await PDFLib.PDFDocument.load(await parts[0].async('uint8array'))).getPageCount() === 2, 'split: wrong range');
  await run('split', { mode: 'ranges', ranges: '3-1' }, [file], true);
  await run('split', { mode: 'ranges', ranges: '1,,3' }, [file], true);
  checks.push('split and invalid ranges');

  const removed = await PDFLib.PDFDocument.load(await (await run('remove-pages', { pages: '2' })).arrayBuffer());
  assert(removed.getPageCount() === 2 && removed.getPages()[1].getWidth() === 280, 'remove: wrong remaining pages');
  await run('remove-pages', { pages: 'all' }, [file], true);
  await run('remove-pages', { pages: '9' }, [file], true);
  checks.push('remove and page bounds');

  const rotatedBlob = await run('rotate', { angle: '90', pages: '2-' });
  const rotated = await PDFLib.PDFDocument.load(await rotatedBlob.arrayBuffer());
  assert(rotated.getPages()[0].getRotation().angle === 0 && rotated.getPages()[2].getRotation().angle === 90, 'rotate: wrong selected pages');
  checks.push('rotate and open-ended ranges');

  const raster = await JSZip.loadAsync(await run('pdf-to-jpg', { dpi: '72', format: 'png' }));
  const rasterImage = await createImageBitmap(await Object.values(raster.files)[0].async('blob'));
  assert(rasterImage.width === 240 && rasterImage.height === 320, 'PDF to image: wrong dimensions');
  rasterImage.close();
  checks.push('PDF to image');

  const compressed = await run('compress', { level: 'recommended' });
  assert(compressed.size <= file.size && (await PDFLib.PDFDocument.load(await compressed.arrayBuffer())).getPageCount() === 3, 'compress: invalid output or increased size');
  checks.push('PDF compression');

  const imagesPdf = await PDFLib.PDFDocument.load(await (await run('jpg-to-pdf', { page_size: 'fit' }, [image, image])).arrayBuffer());
  assert(imagesPdf.getPageCount() === 2 && imagesPdf.getPages()[0].getWidth() === 150, 'image to PDF: wrong dimensions or count');
  checks.push('image to PDF');

  const numbered = await PDFLib.PDFDocument.load(await (await run('page-numbers', { start: '3', font_size: '11' })).arrayBuffer());
  assert(numbered.getPageCount() === 3, 'page numbering: invalid output');
  const watermark = await run('watermark', { text: 'TEST', opacity: '100', font_size: '24', pages: '1', position: 'center' });
  assert((await PDFLib.PDFDocument.load(await watermark.arrayBuffer())).getPageCount() === 3, 'watermark: invalid output');
  await run('watermark', { watermark_image: image, opacity: '40' });
  checks.push('page numbers, text and image watermarks');

  const items = [{ type: 'rect', page: 1, x: 0.05, y: 0.05, w: 0.2, h: 0.1, color: '#ff0000', stroke: 4 }];
  const edited = await run('edit', { items: JSON.stringify(items) }, [new File([rotatedBlob], 'rotated.pdf')]);
  const form = new FormData();
  form.append('files', edited, 'edited.pdf');
  form.append('page', '1');
  window.browserTestStep = 'annotation-preview';
  const response = await BrowserTools.post('/api/preview', form);
  assert(response.ok, 'edited rotated-page preview failed');
  const preview = await response.json();
  assert(preview.width === 320 && preview.height === 260, 'rotated preview dimensions');
  window.browserTestStep = 'annotation-pixel-check';
  const view = await createImageBitmap(await (await fetch(preview.image)).blob());
  const pixels = document.createElement('canvas');
  pixels.width = view.width;
  pixels.height = view.height;
  const pixelContext = pixels.getContext('2d');
  pixelContext.drawImage(view, 0, 0);
  view.close();
  const pixel = pixelContext.getImageData(Math.round(pixels.width * 0.15), Math.round(pixels.height * 0.05), 1, 1).data;
  assert(pixel[0] > 180 && pixel[1] < 100 && pixel[2] < 100, 'annotation misplaced on rotated page');
  await run('sign', { items: JSON.stringify([{ type: 'image', page: 0, x: 0.1, y: 0.1, w: 0.3, h: 0.1, image: 'signature' }]), signature: image });
  await run('edit', { items: JSON.stringify([{ type: 'text', page: 0, x: 0.1, y: 0.1, size: 16, text: 'Browser annotation' }]) });
  checks.push('annotations, rotated placement and signature');

  const textPreview = async (blob, index) => {
    const data = new FormData();
    data.append('files', blob, 'text.pdf');
    data.append('page', index);
    const result = await BrowserTools.post('/api/preview', data);
    assert(result.ok, 'text extraction preview failed');
    return result.json();
  };
  for (const [source, pageIndex] of [[file, 0], [new File([rotatedBlob], 'rotated.pdf'), 1]]) {
    const before = await textPreview(source, pageIndex);
    const line = before.lines.find(entry => entry.text === `Page ${pageIndex + 1}`);
    assert(line && line.w > 0 && line.h > 0, 'existing text box not extracted');
    const changed = await run('edit', { items: JSON.stringify([{ ...line, type: 'replace', page: pageIndex, text: 'Changed', color: '#ff00ff' }]) }, [source]);
    const after = await textPreview(changed, pageIndex);
    assert(after.lines.length === 0, 'original text retained on flattened page');
    const preserved = await textPreview(changed, 2);
    assert(preserved.lines.some(entry => entry.text === 'Page 3'), 'unedited text was flattened or lost');
    const replacementImage = await createImageBitmap(await (await fetch(after.image)).blob());
    const raster = document.createElement('canvas');
    raster.width = replacementImage.width;
    raster.height = replacementImage.height;
    const drawing = raster.getContext('2d');
    drawing.drawImage(replacementImage, 0, 0);
    replacementImage.close();
    const values = drawing.getImageData(0, 0, raster.width, raster.height).data;
    let replacementPixels = 0;
    for (let offset = 0; offset < values.length; offset += 4) {
      if (values[offset] > 180 && values[offset + 1] < 80 && values[offset + 2] > 180) replacementPixels++;
    }
    assert(replacementPixels > 20, 'replacement text missing from saved page');
    const deleted = await run('edit', { items: JSON.stringify([{ ...line, type: 'replace', page: pageIndex, text: '' }]) }, [source]);
    const cleared = await textPreview(deleted, pageIndex);
    const clearImage = await createImageBitmap(await (await fetch(cleared.image)).blob());
    drawing.clearRect(0, 0, raster.width, raster.height);
    drawing.drawImage(clearImage, 0, 0);
    clearImage.close();
    const clearValues = drawing.getImageData(0, 0, raster.width, raster.height).data;
    let darkPixels = 0;
    for (let offset = 0; offset < clearValues.length; offset += 4) {
      if (clearValues[offset] < 100 && clearValues[offset + 1] < 100 && clearValues[offset + 2] < 100) darkPixels++;
    }
    assert(darkPixels === 0, 'original text pixels remain after clearing text');
  }
  checks.push('existing text extraction, replacement, deletion, rotation and untouched page preservation');

  for (const [options, width, height] of [
    [{ unit: 'px', width: '100', height: '100', fit: 'cover', format: 'png' }, 100, 100],
    [{ unit: 'px', width: '100', height: '100', fit: 'contain', format: 'png' }, 100, 50],
    [{ unit: 'px', width: '100', height: '100', fit: 'pad', format: 'png' }, 100, 100],
    [{ unit: 'percent', percent: '50', format: 'png' }, 100, 50],
    [{ unit: 'mm', width: '25.4', dpi: '100', format: 'png' }, 100, 50],
  ]) {
    const resized = await createImageBitmap(await run('resize-image', options, [image]));
    assert(resized.width === width && resized.height === height, `resize dimensions: ${JSON.stringify(options)}`);
    resized.close();
  }
  await run('resize-image', { unit: 'px', width: '-1' }, [image], true);
  await run('resize-image', { unit: 'px', width: '16000', height: '16000', fit: 'stretch' }, [image], true);
  checks.push('resize: cover, contain, pad, percent, physical units and limits');

  for (const format of ['jpeg', 'png', 'webp']) {
    const converted = await run('convert-image', { format }, [image]);
    assert(converted.type === `image/${format}`, `convert: wrong MIME type for ${format}`);
  }
  const compressedImage = await run('compress-image', { format: 'jpeg', quality: '70', target_kb: '5' }, [image]);
  assert(compressedImage.size <= 5 * 1024, 'image compression exceeded target');
  await run('compress-image', { format: 'jpeg', target_kb: '0.01' }, [image], true);
  await run('compress-image', { format: 'png', target_kb: '0.01' }, [image], true);
  checks.push('image conversion, compression and impossible targets');

  const duplicateNames = await JSZip.loadAsync(await run('convert-image', { format: 'png' }, [image, image]));
  assert(Object.keys(duplicateNames.files).length === 2, 'duplicate filenames overwritten in ZIP');
  const invalid = new File(['not a PDF'], 'invalid.pdf');
  await run('rotate', {}, [invalid], true);
  await run('protect', {}, [file], true);
  checks.push('archive filename collisions, invalid input and desktop-only tools');
  return { passed: true, checks, supportedTools: BrowserTools.supported.size };
};

window.runEditorKeyboardTests = async function () {
  const pdf = await PDFLib.PDFDocument.create();
  pdf.addPage([300, 400]).drawText('Keyboard test', { x: 30, y: 300, size: 20 });
  renderTool(TOOLS.find(tool => tool.id === 'edit'));
  const input = document.querySelector('#app input[type=file]');
  const transfer = new DataTransfer();
  transfer.items.add(new File([await pdf.save()], 'keyboard-test.pdf', { type: 'application/pdf' }));
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  const waitFor = async selector => {
    const deadline = Date.now() + 10000;
    while (!document.querySelector(selector)) {
      if (Date.now() > deadline) throw new Error(`Editor test timed out: ${selector}`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    return document.querySelector(selector);
  };
  const line = await waitFor('.ed-line');
  const rect = line.getBoundingClientRect();
  line.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: rect.left + 2, clientY: rect.top + 2 }));
  const textbox = await waitFor('.ed-replace .ed-textbox');
  textbox.focus();
  for (const key of ['Backspace', 'Delete']) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    textbox.dispatchEvent(event);
    if (!textbox.isConnected || event.defaultPrevented) throw new Error(`${key} removed the text box or blocked text editing.`);
  }
  textbox.textContent = 'Changed with keyboard';
  textbox.dispatchEvent(new Event('input', { bubbles: true }));
  const previewSetting = localStorage.getItem(PREVIEW_KEY);
  localStorage.setItem(PREVIEW_KEY, '1');
  try {
    [...document.querySelectorAll('.ed-side button')].find(button => button.textContent === 'Save PDF').click();
    await waitFor('.result');
    await waitFor('.pv-pages img');
  } finally {
    if (previewSetting === null) localStorage.removeItem(PREVIEW_KEY);
    else localStorage.setItem(PREVIEW_KEY, previewSetting);
  }
  return { passed: true, keys: ['Backspace', 'Delete'], saved: document.querySelector('.result p').textContent };
};

window.runBackgroundEditorTests = async function (file) {
  const checks = [];
  const source = BackgroundEngine.surface(10, 10);
  const mask = BackgroundEngine.surface(10, 10);
  const sourceContext = source.getContext('2d');
  sourceContext.fillStyle = '#ffffff';
  sourceContext.fillRect(0, 0, 10, 10);
  sourceContext.fillStyle = '#808080';
  sourceContext.fillRect(5, 5, 1, 1);
  sourceContext.fillStyle = '#123456';
  sourceContext.fillRect(6, 5, 1, 1);
  const maskContext = mask.getContext('2d');
  maskContext.fillStyle = 'rgba(255,255,255,0.5)';
  maskContext.fillRect(5, 5, 1, 1);
  maskContext.fillStyle = '#ffffff';
  maskContext.fillRect(6, 5, 1, 1);
  const cleaned = BackgroundEngine.compose(source, mask, { cleanup: true }).getContext('2d');
  const edge = cleaned.getImageData(5, 5, 1, 1).data;
  const opaque = cleaned.getImageData(6, 5, 1, 1).data;
  if (edge[0] > 5 || edge[3] < 125 || opaque[0] !== 18 || opaque[1] !== 52 || opaque[2] !== 86) throw new Error('Edge cleanup damaged opaque subject pixels.');
  checks.push('edge cleanup and opaque foreground preservation');
  if (window.disposeBackgroundEditor) disposeBackgroundEditor();
  renderTool(TOOLS.find(tool => tool.id === 'remove-background'));
  const wait = async predicate => {
    const deadline = Date.now() + 30000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error('Background editor test timed out.');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  };
  const transfer = new DataTransfer();
  transfer.items.add(new File([file], 'background-test.jpg', { type: file.type || 'image/jpeg' }));
  const input = document.querySelector('#app input[type=file]');
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(() => document.querySelector('.bg-editor') && !document.querySelector('.bg-editor').hidden);
  const preview = document.querySelector('.bg-canvas');
  const context = preview.getContext('2d', { willReadFrequently: true });
  const pixel = (x = 0, y = 0) => [...context.getImageData(x, y, 1, 1).data];
  const click = label => {
    const button = document.querySelector(`button[aria-label="${label}"]`);
    if (!button || button.disabled) throw new Error(`Unavailable control: ${label}`);
    button.click();
  };
  const transparent = pixel()[3];
  click('Compare with original');
  if (pixel()[3] !== 255) throw new Error('Original comparison is not opaque.');
  click('Compare with original');
  if (pixel()[3] !== transparent) throw new Error('Comparison changed the mask.');
  click('Background #2196f3');
  if (pixel()[2] < 200 || pixel()[3] !== 255) throw new Error('Solid background failed.');
  click('Transparent background');
  checks.push('AI cutout, before/after comparison and color backgrounds');

  click('Cutout');
  let x = Math.floor(preview.width / 2);
  let y = Math.floor(preview.height / 2);
  if (pixel(x, y)[3] < 100) {
    const data = context.getImageData(0, 0, preview.width, preview.height).data;
    const index = data.findIndex((value, offset) => offset % 4 === 3 && value > 200);
    if (index >= 0) { x = Math.floor(index / 4) % preview.width; y = Math.floor(Math.floor(index / 4) / preview.width); }
  }
  const before = pixel(x, y)[3];
  if (before < 100) throw new Error('Use a test image with a centered foreground subject.');
  const paint = mode => {
    click(mode);
    const rect = preview.getBoundingClientRect();
    const capture = preview.setPointerCapture;
    preview.setPointerCapture = () => {};
    try {
      const options = { bubbles: true, pointerId: 1, clientX: rect.left + x / preview.width * rect.width, clientY: rect.top + y / preview.height * rect.height };
      preview.dispatchEvent(new PointerEvent('pointerdown', options));
      preview.dispatchEvent(new PointerEvent('pointerup', options));
    } finally { preview.setPointerCapture = capture; }
  };
  paint('Erase');
  if (pixel(x, y)[3] > 10) throw new Error('Erase brush did not clear alpha.');
  click('Undo mask edit');
  if (Math.abs(pixel(x, y)[3] - before) > 2) throw new Error('Undo did not restore the mask.');
  click('Redo mask edit');
  if (pixel(x, y)[3] > 10) throw new Error('Redo did not restore erasure.');
  paint('Restore');
  if (pixel(x, y)[3] < 245) throw new Error('Restore brush did not restore subject pixels.');
  checks.push('erase, restore, undo and redo');

  click('Background');
  [...document.querySelectorAll('#bg-background button')].find(button => button.textContent === 'Photo').click();
  const template = document.querySelector('.bg-photo img');
  await wait(() => template.complete && template.naturalWidth > 0);
  click('Forest background');
  await wait(() => !document.querySelector('#app .status').textContent);
  if (pixel()[3] !== 255) throw new Error('Photo background failed.');
  checks.push('bundled photo background');

  click('Effects');
  const blur = document.querySelector('#bg-effects input[type=checkbox]');
  blur.checked = true;
  blur.dispatchEvent(new Event('change'));
  if (!blur.checked || document.querySelector('[aria-label="Background blur"]').disabled) throw new Error('Blur original controls lost state.');
  blur.checked = false;
  blur.dispatchEvent(new Event('change'));
  click('Adjust');
  const brightness = document.querySelector('[aria-label="Brightness"]');
  const luminance = () => {
    const values = context.getImageData(0, 0, preview.width, preview.height).data;
    let sum = 0;
    for (let offset = 0; offset < values.length; offset += 4) sum += values[offset] + values[offset + 1] + values[offset + 2];
    return sum;
  };
  const originalColor = luminance();
  brightness.value = '50';
  brightness.dispatchEvent(new Event('input'));
  if (luminance() >= originalColor) throw new Error('Brightness adjustment did not change output.');
  [...document.querySelectorAll('#bg-adjust button')].find(button => button.textContent === 'Reset adjustments').click();
  checks.push('background blur and image adjustments');

  const originalClick = HTMLAnchorElement.prototype.click;
  let captured;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) captured = { url: this.href, name: this.download };
    else originalClick.call(this);
  };
  try {
    for (const format of ['png', 'webp', 'jpeg']) {
      captured = null;
      document.querySelector('[aria-label="Download format"]').value = format;
      click('Download image');
      await wait(() => captured);
      const blob = await (await fetch(captured.url)).blob();
      if (blob.type !== `image/${format}`) throw new Error('Download has the wrong MIME type.');
      const bitmap = await createImageBitmap(blob);
      if (!bitmap.width || !bitmap.height) throw new Error('Exported image is blank.');
      bitmap.close();
      await wait(() => !document.querySelector('[aria-label="Download image"]').disabled);
    }
  } finally { HTMLAnchorElement.prototype.click = originalClick; }
  checks.push('PNG, WEBP and JPG exports');
  return { passed: true, checks, dimensions: [preview.width, preview.height] };
};