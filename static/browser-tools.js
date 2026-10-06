'use strict';

window.BrowserTools = (() => {
  const supported = new Set([
    'merge', 'split', 'remove-pages', 'rotate', 'compress', 'pdf-to-jpg',
    'jpg-to-pdf', 'edit', 'sign', 'watermark', 'page-numbers',
    'compress-image', 'resize-image', 'convert-image',
  ]);
  const maxBytes = 100 * 1024 * 1024;
  const maxPixels = 16000000;
  const maxPages = 300;
  const rendererRoot = new URL('vendor/pdfjs/', document.currentScript.src);
  let rendererModule;
  const mimeTypes = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const stem = name => (name.replace(/\.[^.]+$/, '').replace(/[^\w.-]/g, '_') || 'document').slice(0, 100);
  const number = (form, key, fallback, min, max) => {
    const raw = form.get(key);
    const value = raw === null || raw === '' ? fallback : Number(raw);
    if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${key}: enter a value between ${min} and ${max}.`);
    return value;
  };

  function canvas(width, height) {
    width = Math.max(1, Math.round(width));
    height = Math.max(1, Math.round(height));
    if (width * height > maxPixels || width > 16000 || height > 16000) {
      throw new Error('This image or page is too large for browser processing. Use smaller dimensions or a lower DPI.');
    }
    const surface = document.createElement('canvas');
    surface.width = width;
    surface.height = height;
    return surface;
  }

  async function encode(surface, format = 'png', quality = 0.9) {
    const type = mimeTypes[format];
    if (!type) throw new Error('Choose JPG, PNG, or WEBP as the output format.');
    const blob = await new Promise(resolve => surface.toBlob(resolve, type, quality));
    if (!blob || blob.type !== type) throw new Error(`Your browser cannot export ${format.toUpperCase()} images.`);
    return blob;
  }

  async function bitmap(file) {
    try {
      const image = await createImageBitmap(file);
      if (image.width * image.height > maxPixels) {
        image.close();
        throw new Error('Image exceeds the 16-megapixel browser limit.');
      }
      return image;
    } catch (error) {
      throw new Error(error.message.includes('limit') ? error.message : 'Could not open this image. Use a JPG, PNG, WEBP, BMP, or GIF file.');
    }
  }

  function pagesFor(value, total) {
    if (!value || value.trim().toLowerCase() === 'all') return Array.from({ length: total }, (_, index) => index);
    const selected = [];
    for (const token of value.split(',')) {
      const match = /^(\d+)(?:\s*-\s*(\d*))?$/.exec(token.trim());
      if (!match) throw new Error('Enter page numbers or ranges such as 1-3, 5, 8-.');
      const first = Number(match[1]);
      const last = match[2] === undefined ? first : match[2] === '' ? total : Number(match[2]);
      if (first < 1 || last < first || last > total) throw new Error(`Page ranges must be between 1 and ${total}.`);
      for (let index = first - 1; index < last; index++) selected.push(index);
    }
    return [...new Set(selected)];
  }

  async function loadPdf(file) {
    if (!window.PDFLib) throw new Error('The PDF library could not load. Refresh the page and try again.');
    try {
      const pdf = await PDFLib.PDFDocument.load(await file.arrayBuffer());
      if (pdf.getPageCount() > maxPages) throw new Error(`Browser processing supports at most ${maxPages} pages per PDF.`);
      return pdf;
    } catch (error) {
      if (error.name === 'EncryptedPDFError') throw new Error('Password-protected PDFs require the desktop app.');
      if (error.message.includes('at most')) throw error;
      throw new Error('Could not open this PDF. Check that it is a valid, unencrypted PDF.');
    }
  }

  async function renderer(file) {
    try {
      rendererModule ||= import(new URL('pdf.mjs', rendererRoot).href);
      const library = await rendererModule;
      library.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.mjs', rendererRoot).href;
      const pdf = await library.getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
        cMapUrl: new URL('cmaps/', rendererRoot).href,
        cMapPacked: true,
        standardFontDataUrl: new URL('standard_fonts/', rendererRoot).href,
        isEvalSupported: false,
      }).promise;
      if (pdf.numPages > maxPages) {
        await pdf.destroy();
        throw new Error(`Browser processing supports at most ${maxPages} pages per PDF.`);
      }
      return pdf;
    } catch (error) {
      if (error.name === 'PasswordException') throw new Error('Password-protected PDFs require the desktop app.');
      throw error;
    }
  }

  async function renderPage(pdf, index, scale) {
    const page = await pdf.getPage(index + 1);
    const viewport = page.getViewport({ scale });
    const surface = canvas(viewport.width, viewport.height);
    await page.render({ canvasContext: surface.getContext('2d'), viewport, intent: 'print' }).promise;
    page.cleanup();
    return surface;
  }

  async function preview(url, form) {
    const file = form.get('files') || form.get('file');
    if (!(file instanceof Blob)) throw new Error('Choose a PDF to preview.');
    const pdf = await renderer(file);
    try {
      if (url === '/api/preview') {
        const index = number(form, 'page', 0, 0, pdf.numPages - 1);
        if (!Number.isInteger(index)) throw new Error('Page number must be an integer.');
        const page = await pdf.getPage(index + 1);
        const viewport = page.getViewport({ scale: 1 });
        const library = await rendererModule;
        const content = await page.getTextContent();
        const lines = content.items.filter(item => item.str && item.str.trim()).map(item => {
          const transform = library.Util.transform(viewport.transform, item.transform);
          const size = Math.hypot(transform[2], transform[3]);
          const angle = Math.atan2(transform[1], transform[0]);
          const style = content.styles[item.fontName] || {};
          const ascent = size * (style.ascent ?? 0.8);
          const family = (style.fontFamily || '').toLowerCase();
          return {
            text: item.str,
            x: (transform[4] + Math.sin(angle) * ascent) / viewport.width,
            y: (transform[5] - Math.cos(angle) * ascent) / viewport.height,
            w: Math.max(item.width * viewport.scale, 1) / viewport.width,
            h: Math.max(size * ((style.ascent ?? 0.8) - (style.descent ?? -0.2)), size, 1) / viewport.height,
            size, angle: angle * 180 / Math.PI,
            font: family.includes('mono') ? 'courier' : family.includes('sans') ? 'helvetica' : 'times',
            color: '#000000', bold: family.includes('bold'),
          };
        }).filter(line => line.size > 0 && Number.isFinite(line.x) && Number.isFinite(line.y));
        const surface = await renderPage(pdf, index, 1.5);
        return Response.json({ page_count: pdf.numPages, width: viewport.width, height: viewport.height,
          image: surface.toDataURL('image/png'), lines });
      }
      const pages = [];
      for (let index = 0; index < Math.min(pdf.numPages, 6); index++) {
        const surface = await renderPage(pdf, index, 1);
        pages.push(surface.toDataURL('image/png'));
        surface.width = surface.height = 1;
      }
      return Response.json({ total: pdf.numPages, pages });
    } finally {
      await pdf.destroy();
    }
  }

  async function copiedPdf(source, indices) {
    if (!indices.length) throw new Error('A PDF must contain at least one page.');
    const output = await PDFLib.PDFDocument.create();
    (await output.copyPages(source, indices)).forEach(page => output.addPage(page));
    return new Blob([await output.save()], { type: 'application/pdf' });
  }

  async function pdfBlob(pdf) {
    return new Blob([await pdf.save({ useObjectStreams: true })], { type: 'application/pdf' });
  }

  function visibleSize(page) {
    const box = page.getCropBox();
    const angle = ((page.getRotation().angle % 360) + 360) % 360;
    return { box, angle, width: angle % 180 ? box.height : box.width, height: angle % 180 ? box.width : box.height };
  }

  async function overlay(pdf, page, surface) {
    const image = await pdf.embedPng(await (await encode(surface)).arrayBuffer());
    const { box, angle, width, height } = visibleSize(page);
    const positions = {
      0: [box.x, box.y], 90: [box.x + box.width, box.y],
      180: [box.x + box.width, box.y + box.height], 270: [box.x, box.y + box.height],
    };
    const [x, y] = positions[angle];
    page.drawImage(image, { x, y, width, height, rotate: PDFLib.degrees(angle) });
    surface.width = surface.height = 1;
  }

  function position(where, width, height, itemWidth, itemHeight, margin = 24) {
    const x = where.includes('left') ? margin : where.includes('right') ? width - itemWidth - margin : (width - itemWidth) / 2;
    const y = where.startsWith('top') ? margin : where.startsWith('bottom') ? height - itemHeight - margin : (height - itemHeight) / 2;
    return [x, y];
  }

  async function decorate(pdf, form, tool) {
    const indices = tool === 'page-numbers' ? pdf.getPageIndices() : pagesFor(form.get('pages'), pdf.getPageCount());
    const imageFile = form.get('watermark_image');
    const image = imageFile instanceof Blob && imageFile.size ? await bitmap(imageFile) : null;
    try {
      for (const index of indices) {
        const page = pdf.getPages()[index];
        const { width, height } = visibleSize(page);
        const surface = canvas(width * 2, height * 2);
        const context = surface.getContext('2d');
        context.scale(2, 2);
        const where = form.get('position') || (tool === 'page-numbers' ? 'bottom-center' : 'center');
        if (image) {
          const imageWidth = width * number(form, 'image_scale', 40, 5, 100) / 100;
          const imageHeight = imageWidth * image.height / image.width;
          const [x, y] = position(where, width, height, imageWidth, imageHeight);
          context.globalAlpha = number(form, 'opacity', 30, 5, 100) / 100;
          context.drawImage(image, x, y, imageWidth, imageHeight);
        } else {
          const size = number(form, 'font_size', tool === 'page-numbers' ? 11 : 60, 6, 300);
          const family = { helvetica: 'sans-serif', times: 'serif', courier: 'monospace' }[form.get('font')] || 'sans-serif';
          const text = tool === 'page-numbers' ? String(number(form, 'start', 1, 0, 1000000) + index) : form.get('text');
          if (!text) throw new Error('Enter watermark text or choose a watermark image.');
          context.font = `${size}px ${family}`;
          context.fillStyle = form.get('color') || '#000000';
          context.globalAlpha = tool === 'page-numbers' ? 1 : number(form, 'opacity', 30, 5, 100) / 100;
          const textWidth = Math.min(context.measureText(text).width, width - 48);
          const [x, y] = position(where, width, height, textWidth, size);
          context.translate(x + textWidth / 2, y + size / 2);
          context.rotate(number(form, 'rotation', 0, -360, 360) * Math.PI / 180);
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(text, 0, 0, width - 48);
        }
        await overlay(pdf, page, surface);
      }
    } finally {
      if (image) image.close();
    }
    return pdfBlob(pdf);
  }

  async function annotate(pdf, form) {
    const items = JSON.parse(form.get('items') || '[]');
    if (!Array.isArray(items) || !items.length) throw new Error('Add an annotation or signature first.');
    const replacedPages = new Map();
    for (const index of new Set(items.map(item => item.page))) {
      if (!Number.isInteger(index) || index < 0 || index >= pdf.getPageCount()) throw new Error('Invalid annotation page.');
      const page = pdf.getPages()[index];
      const { width, height } = visibleSize(page);
      const surface = canvas(width * 2, height * 2);
      const context = surface.getContext('2d');
      const replacements = items.filter(item => item.page === index && item.type === 'replace');
      if (replacements.length) {
        const rendered = await renderer(form.getAll('files')[0]);
        try {
          const original = await renderPage(rendered, index, 2);
          context.drawImage(original, 0, 0, surface.width, surface.height);
          original.width = original.height = 1;
        } finally { await rendered.destroy(); }
      }
      context.scale(2, 2);
      for (const item of replacements) {
        context.save();
        context.translate(item.x * width, item.y * height);
        context.rotate((item.angle || 0) * Math.PI / 180);
        context.fillStyle = '#ffffff';
        context.fillRect(-1, -1, item.w * width + 2, item.h * height + 2);
        context.restore();
      }
      for (const item of items.filter(entry => entry.page === index)) {
        context.fillStyle = context.strokeStyle = item.color || '#000000';
        context.lineWidth = item.stroke || 2;
        const x = item.x * width;
        const y = item.y * height;
        if (item.type === 'replace') {
          const family = { helvetica: 'sans-serif', times: 'serif', courier: 'monospace' }[item.font] || 'sans-serif';
          context.save();
          context.translate(x, y);
          context.rotate((item.angle || 0) * Math.PI / 180);
          context.font = `${item.bold ? 'bold ' : ''}${item.size || 16}px ${family}`;
          context.textBaseline = 'top';
          context.fillText(String(item.text || '').replace(/\n/g, ' '), 0, 0);
          context.restore();
        } else if (item.type === 'text') {
          const family = { helvetica: 'sans-serif', times: 'serif', courier: 'monospace' }[item.font] || 'sans-serif';
          context.font = `${item.size || 16}px ${family}`;
          context.textBaseline = 'top';
          String(item.text).split('\n').forEach((line, lineIndex) => context.fillText(line, x, y + lineIndex * (item.size || 16) * 1.17));
        } else if (item.type === 'rect') {
          context.strokeRect(x, y, item.w * width, item.h * height);
        } else if (item.type === 'whiteout') {
          context.fillStyle = '#ffffff';
          context.fillRect(x, y, item.w * width, item.h * height);
        } else if (item.type === 'draw') {
          context.beginPath();
          context.lineCap = context.lineJoin = 'round';
          item.points.forEach(([pointX, pointY], pointIndex) => {
            context[pointIndex ? 'lineTo' : 'moveTo'](pointX * width, pointY * height);
          });
          context.stroke();
        } else if (item.type === 'image') {
          const image = await bitmap(form.get(item.image));
          try { context.drawImage(image, x, y, item.w * width, item.h * height); }
          finally { image.close(); }
        } else {
          throw new Error('Unsupported annotation type.');
        }
      }
      if (replacements.length) replacedPages.set(index, await encode(surface));
      else await overlay(pdf, page, surface);
    }
    if (replacedPages.size) {
      const output = await PDFLib.PDFDocument.create();
      for (const index of pdf.getPageIndices()) {
        if (replacedPages.has(index)) {
          const { width, height } = visibleSize(pdf.getPages()[index]);
          const page = output.addPage([width, height]);
          const image = await output.embedPng(await replacedPages.get(index).arrayBuffer());
          page.drawImage(image, { x: 0, y: 0, width, height });
        } else {
          const [page] = await output.copyPages(pdf, [index]);
          output.addPage(page);
        }
      }
      return pdfBlob(output);
    }
    return pdfBlob(pdf);
  }

  async function imageTool(file, form, tool) {
    const image = await bitmap(file);
    try {
      let width = image.width;
      let height = image.height;
      const format = form.get('format');
      const sourceFormat = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' }[file.type] || 'png';
      const outputFormat = !format || format === 'same' ? sourceFormat : format;
      const fit = form.get('fit') || 'contain';
      if (tool === 'resize-image') {
        const unit = form.get('unit') || 'px';
        if (unit === 'percent') {
          const ratio = number(form, 'percent', 50, 1, 1000) / 100;
          width *= ratio;
          height *= ratio;
        } else {
          const dpi = number(form, 'dpi', 300, 30, 1200);
          const factor = { px: 1, in: dpi, cm: dpi / 2.54, mm: dpi / 25.4 }[unit];
          if (!factor) throw new Error('Choose a supported size unit.');
          const wantedWidth = number(form, 'width', 0, 0, 16000) * factor;
          const wantedHeight = number(form, 'height', 0, 0, 16000) * factor;
          if (!wantedWidth && !wantedHeight) throw new Error('Enter a width or height.');
          width = wantedWidth || wantedHeight * image.width / image.height;
          height = wantedHeight || wantedWidth * image.height / image.width;
          if (wantedWidth && wantedHeight && fit === 'contain') {
            const ratio = Math.min(width / image.width, height / image.height);
            width = image.width * ratio;
            height = image.height * ratio;
          }
        }
      }
      const surface = canvas(width, height);
      const context = surface.getContext('2d');
      if (outputFormat === 'jpeg' || fit === 'pad') {
        context.fillStyle = form.get('background') || '#ffffff';
        context.fillRect(0, 0, surface.width, surface.height);
      }
      if (tool === 'resize-image' && (fit === 'cover' || fit === 'pad')) {
        const ratio = (fit === 'cover' ? Math.max : Math.min)(surface.width / image.width, surface.height / image.height);
        const drawWidth = image.width * ratio;
        const drawHeight = image.height * ratio;
        context.drawImage(image, (surface.width - drawWidth) / 2, (surface.height - drawHeight) / 2, drawWidth, drawHeight);
      } else {
        context.drawImage(image, 0, 0, surface.width, surface.height);
      }
      let blob = await encode(surface, outputFormat, number(form, 'quality', tool === 'compress-image' ? 70 : 90, 5, 100) / 100);
      const target = number(form, 'target_kb', 0, 0, 100000) * 1024;
      if (target && blob.size > target) {
        if (outputFormat === 'png') throw new Error('PNG is lossless. Choose JPG or WEBP, or smaller dimensions, to meet a file-size limit.');
        let low = 0.05;
        let high = 1;
        let best = await encode(surface, outputFormat, low);
        if (best.size > target) throw new Error('This size limit is too small. Reduce image dimensions or increase the maximum KB.');
        for (let iteration = 0; iteration < 9; iteration++) {
          const quality = (low + high) / 2;
          const candidate = await encode(surface, outputFormat, quality);
          if (candidate.size <= target) { best = candidate; low = quality; }
          else high = quality;
        }
        blob = best;
      }
      return { blob, name: `${stem(file.name)}_${tool === 'resize-image' ? 'resized' : tool === 'compress-image' ? 'compressed' : 'converted'}.${outputFormat === 'jpeg' ? 'jpg' : outputFormat}` };
    } finally {
      image.close();
    }
  }

  async function imagesPdf(files, form) {
    const pdf = await PDFLib.PDFDocument.create();
    const sizes = { a4: [595.28, 841.89], letter: [612, 792], legal: [612, 1008] };
    const size = form.get('page_size') || 'a4';
    const margin = number(form, 'margin', 20, 0, 100);
    for (const file of files) {
      const image = await bitmap(file);
      try {
        const surface = canvas(image.width, image.height);
        surface.getContext('2d').drawImage(image, 0, 0);
        const embedded = await pdf.embedPng(await (await encode(surface)).arrayBuffer());
        let dimensions = size === 'fit' ? [image.width * 0.75, image.height * 0.75] : [...(sizes[size] || sizes.a4)];
        const orientation = form.get('orientation') || 'auto';
        if (size !== 'fit' && (orientation === 'landscape' || (orientation === 'auto' && image.width > image.height))) dimensions.reverse();
        const page = pdf.addPage(dimensions);
        const padding = size === 'fit' ? 0 : margin;
        const ratio = Math.min((dimensions[0] - padding * 2) / image.width, (dimensions[1] - padding * 2) / image.height);
        const width = image.width * ratio;
        const height = image.height * ratio;
        page.drawImage(embedded, { x: (dimensions[0] - width) / 2, y: (dimensions[1] - height) / 2, width, height });
      } finally { image.close(); }
    }
    return pdfBlob(pdf);
  }

  async function renderTool(file, form, tool) {
    const pdf = await renderer(file);
    const outputs = [];
    try {
      const compression = { extreme: [1, 0.5], recommended: [1.5, 0.72], low: [2, 0.9] }[form.get('level') || 'recommended'];
      const format = form.get('format') === 'png' ? 'png' : 'jpeg';
      const scale = tool === 'compress' ? compression[0] : number(form, 'dpi', 150, 72, 300) / 72;
      const outputPdf = tool === 'compress' ? await PDFLib.PDFDocument.create() : null;
      for (let index = 0; index < pdf.numPages; index++) {
        const surface = await renderPage(pdf, index, scale);
        const blob = await encode(surface, tool === 'compress' ? 'jpeg' : format, tool === 'compress' ? compression[1] : 0.92);
        if (outputPdf) {
          const embedded = await outputPdf.embedJpg(await blob.arrayBuffer());
          const page = outputPdf.addPage([surface.width / scale, surface.height / scale]);
          page.drawImage(embedded, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
        } else {
          outputs.push({ blob, name: `${stem(file.name)}_page_${index + 1}.${format === 'jpeg' ? 'jpg' : 'png'}` });
        }
        surface.width = surface.height = 1;
      }
      if (outputPdf) {
        const result = await pdfBlob(outputPdf);
        outputs.push({ blob: result.size < file.size ? result : file, name: `${stem(file.name)}_compressed.pdf` });
      }
      return outputs;
    } finally { await pdf.destroy(); }
  }

  async function process(tool, form, files) {
    const outputs = [];
    if (tool === 'jpg-to-pdf') return [{ blob: await imagesPdf(files, form), name: 'images.pdf' }];
    if (tool === 'merge') {
      if (files.length < 2) throw new Error('Select at least two PDFs to merge.');
      const output = await PDFLib.PDFDocument.create();
      for (const file of files) {
        const source = await loadPdf(file);
        if (output.getPageCount() + source.getPageCount() > maxPages) throw new Error(`The merged PDF must not exceed ${maxPages} pages.`);
        (await output.copyPages(source, source.getPageIndices())).forEach(page => output.addPage(page));
      }
      return [{ blob: await pdfBlob(output), name: 'merged.pdf' }];
    }
    for (const file of files) {
      if (tool.endsWith('-image')) {
        outputs.push(await imageTool(file, form, tool));
        continue;
      }
      if (tool === 'pdf-to-jpg' || tool === 'compress') {
        outputs.push(...await renderTool(file, form, tool));
        continue;
      }
      const pdf = await loadPdf(file);
      const name = `${stem(file.name)}_${tool}.pdf`;
      if (tool === 'split') {
        const groups = form.get('mode') === 'ranges' ? (form.get('ranges') || '').split(',') : pdf.getPageIndices().map(index => String(index + 1));
        if (groups.some(group => !group.trim())) throw new Error('Enter at least one page range.');
        for (let index = 0; index < groups.length; index++) {
          outputs.push({ blob: await copiedPdf(pdf, pagesFor(groups[index], pdf.getPageCount())), name: `${stem(file.name)}_part_${index + 1}.pdf` });
        }
      } else if (tool === 'remove-pages') {
        if (!form.get('pages')) throw new Error('Enter the pages to remove.');
        const removed = new Set(pagesFor(form.get('pages'), pdf.getPageCount()));
        outputs.push({ blob: await copiedPdf(pdf, pdf.getPageIndices().filter(index => !removed.has(index))), name });
      } else if (tool === 'rotate') {
        const angle = number(form, 'angle', 90, 0, 270);
        if (angle % 90) throw new Error('Rotation must be a multiple of 90 degrees.');
        for (const index of pagesFor(form.get('pages'), pdf.getPageCount())) {
          const page = pdf.getPages()[index];
          page.setRotation(PDFLib.degrees((page.getRotation().angle + angle) % 360));
        }
        outputs.push({ blob: await pdfBlob(pdf), name });
      } else if (tool === 'edit' || tool === 'sign') {
        outputs.push({ blob: await annotate(pdf, form), name });
      } else {
        outputs.push({ blob: await decorate(pdf, form, tool), name });
      }
    }
    return outputs;
  }

  async function packageResult(outputs, files, tool) {
    let result = outputs[0];
    if (outputs.length > 1) {
      if (!window.JSZip) throw new Error('The ZIP library could not load. Refresh the page and try again.');
      const zip = new JSZip();
      const used = new Set();
      for (const output of outputs) {
        let name = output.name;
        let suffix = 2;
        while (used.has(name)) name = output.name.replace(/(\.[^.]+)$/, `_${suffix++}$1`);
        used.add(name);
        zip.file(name, await output.blob.arrayBuffer());
      }
      result = { blob: await zip.generateAsync({ type: 'blob', compression: 'STORE' }), name: `${tool}_results.zip` };
    }
    if (!result) throw new Error('No output files were generated.');
    return new Response(result.blob, { headers: {
      'Content-Type': result.blob.type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${result.name}"`,
      'X-Original-Size': String(files.reduce((size, file) => size + file.size, 0)),
      'X-Result-Size': String(result.blob.size),
    } });
  }

  async function post(url, form) {
    try {
      const uploads = [...form.values()].filter(value => value instanceof Blob);
      if (uploads.reduce((size, file) => size + file.size, 0) > maxBytes) throw new Error('Choose files totaling less than 100 MB for browser processing.');
      if (url === '/api/preview' || url === '/api/render') return await preview(url, form);
      const tool = url.replace('/api/tool/', '');
      if (!url.startsWith('/api/tool/') || !supported.has(tool)) throw new Error('This tool requires the desktop app and is not available on GitHub Pages.');
      const files = form.getAll('files');
      if (!files.length || files.some(file => !(file instanceof Blob))) throw new Error('Choose at least one file.');
      if (files.length > 100) throw new Error('Choose at most 100 files at once.');
      if (!window.PDFLib || !window.JSZip) throw new Error('A processing library could not load. Refresh the page and check your connection.');
      return await packageResult(await process(tool, form, files), files, tool);
    } catch (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
  }

  return { supported, post };
})();