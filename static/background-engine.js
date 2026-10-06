'use strict';

window.BackgroundEngine = (() => {
  const assetRoot = new URL('vendor/background/', document.currentScript.src);
  let runtimePromise;
  let sessionPromise;
  const limit = 12000000;

  function surface(width, height) {
    if (!width || !height || width * height > limit) throw new Error('Choose a photo up to 12 megapixels.');
    const result = document.createElement('canvas');
    result.width = width;
    result.height = height;
    return result;
  }

  async function runtime(progress) {
    progress('Loading AI engine...');
    runtimePromise ||= import(new URL('ort.wasm.min.mjs', assetRoot).href).catch(error => {
      runtimePromise = null;
      throw error;
    });
    const library = await runtimePromise;
    library.env.wasm.wasmPaths = assetRoot.href;
    library.env.wasm.numThreads = 1;
    library.env.wasm.proxy = false;
    return library;
  }

  async function remove(file, progress = () => {}) {
    if (!(file instanceof Blob) || file.size > 30 * 1024 * 1024) throw new Error('Choose an image smaller than 30 MB.');
    let image;
    try {
      image = await createImageBitmap(file);
      const original = surface(image.width, image.height);
      original.getContext('2d').drawImage(image, 0, 0);
      const resized = surface(320, 320);
      const context = resized.getContext('2d', { willReadFrequently: true });
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, 320, 320);
      context.drawImage(image, 0, 0, 320, 320);
      const rgba = context.getImageData(0, 0, 320, 320).data;
      let maximum = 1;
      for (let offset = 0; offset < rgba.length; offset += 4) maximum = Math.max(maximum, rgba[offset], rgba[offset + 1], rgba[offset + 2]);
      const input = new Float32Array(3 * 320 * 320);
      const mean = [0.485, 0.456, 0.406];
      const deviation = [0.229, 0.224, 0.225];
      for (let pixel = 0; pixel < 320 * 320; pixel++) {
        for (let channel = 0; channel < 3; channel++) input[channel * 320 * 320 + pixel] = (rgba[pixel * 4 + channel] / maximum - mean[channel]) / deviation[channel];
      }
      const library = await runtime(progress);
      if (!sessionPromise) {
        progress('Loading background model...');
        sessionPromise = library.InferenceSession.create(new URL('u2netp.onnx', assetRoot).href, { executionProviders: ['wasm'] }).catch(error => {
          sessionPromise = null;
          throw error;
        });
      }
      const session = await sessionPromise;
      progress('Separating subject and background...');
      const prediction = await session.run({ [session.inputNames[0]]: new library.Tensor('float32', input, [1, 3, 320, 320]) });
      const tensor = prediction[session.outputNames[0]];
      const values = tensor.data;
      let low = Infinity;
      let high = -Infinity;
      for (let index = 0; index < 320 * 320; index++) { low = Math.min(low, values[index]); high = Math.max(high, values[index]); }
      const pixels = context.createImageData(320, 320);
      for (let index = 0; index < 320 * 320; index++) {
        const alpha = Math.round(Math.max(0, Math.min(1, (values[index] - low) / Math.max(high - low, 1e-6))) * 255);
        pixels.data.set([255, 255, 255, alpha], index * 4);
      }
      context.putImageData(pixels, 0, 0);
      const mask = surface(image.width, image.height);
      mask.getContext('2d').drawImage(resized, 0, 0, mask.width, mask.height);
      Object.values(prediction).forEach(output => output.dispose());
      progress('');
      return { original, mask };
    } catch (error) {
      if (error.message.includes('megapixels') || error.message.includes('30 MB')) throw error;
      throw new Error('Background removal could not finish. Check your connection and try a smaller JPG or PNG. ' + error.message);
    } finally {
      if (image) image.close();
    }
  }

  function compose(original, mask, background = {}) {
    const subject = surface(original.width, original.height);
    const cutout = subject.getContext('2d');
    let source = original;
    if (background.cleanup) {
      const pixels = original.getContext('2d').getImageData(0, 0, original.width, original.height);
      const alpha = mask.getContext('2d').getImageData(0, 0, mask.width, mask.height).data;
      const corners = [0, original.width - 1, original.width * (original.height - 1), original.width * original.height - 1]
        .filter(index => alpha[index * 4 + 3] < 20 && pixels.data[index * 4 + 3] > 245);
      if (corners.length >= 2) {
        const color = [0, 1, 2].map(channel => corners.reduce((sum, index) => sum + pixels.data[index * 4 + channel], 0) / corners.length);
        const uniform = corners.every(index => color.every((value, channel) => Math.abs(pixels.data[index * 4 + channel] - value) < 20));
        if (uniform) {
          for (let index = 0; index < alpha.length; index += 4) {
            const opacity = alpha[index + 3] / 255;
            if (opacity < 0.05 || opacity > 0.98) continue;
            for (let channel = 0; channel < 3; channel++) pixels.data[index + channel] = Math.max(0, Math.min(255,
              (pixels.data[index + channel] - (1 - opacity) * color[channel]) / opacity));
          }
          source = surface(original.width, original.height);
          source.getContext('2d').putImageData(pixels, 0, 0);
        }
      }
    }
    cutout.filter = `brightness(${background.brightness || 100}%) contrast(${background.contrast || 100}%) saturate(${background.saturation ?? 100}%)`;
    cutout.drawImage(source, 0, 0);
    if (source !== original) source.width = source.height = 1;
    cutout.filter = background.feather ? `blur(${background.feather}px)` : 'none';
    cutout.globalCompositeOperation = 'destination-in';
    cutout.drawImage(mask, 0, 0);
    const output = surface(original.width, original.height);
    const context = output.getContext('2d');
    if (background.color) {
      context.fillStyle = background.color;
      context.fillRect(0, 0, output.width, output.height);
    }
    if (background.image) {
      const ratio = Math.max(output.width / background.image.width, output.height / background.image.height);
      const width = background.image.width * ratio;
      const height = background.image.height * ratio;
      context.filter = background.blur ? `blur(${background.blur}px)` : 'none';
      context.drawImage(background.image, (output.width - width) / 2, (output.height - height) / 2, width, height);
      context.filter = 'none';
    }
    if (background.shadow) {
      context.shadowColor = 'rgba(0,0,0,0.35)';
      context.shadowBlur = Math.max(4, output.width * 0.025);
      context.shadowOffsetY = output.height * 0.015;
    }
    context.drawImage(subject, 0, 0);
    return output;
  }

  return { remove, compose, surface };
})();