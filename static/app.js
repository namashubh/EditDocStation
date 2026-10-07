'use strict';

/* ------------------------------------------------------------------ helpers */
const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    e.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

const fmtSize = b => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const pct = v => `${v * 100}%`;

/* ------------------------------------------------------------------ tool catalogue */
const PDF = '.pdf';
const IMG = window.BrowserTools ? '.jpg,.jpeg,.png,.webp,.bmp,.gif' : '.jpg,.jpeg,.png,.webp,.bmp,.gif,.tif,.tiff';
const PAGES_HELP = 'Type "all" or ranges like 1-3, 5, 8-';
const FORMAT_CHOICES = [['same', 'Same as original'], ['jpeg', 'JPG'], ['png', 'PNG'], ['webp', 'WEBP']];

const CATS = [
  ['all', 'All'], ['organize', 'Organize & Optimize PDF'], ['to-pdf', 'Convert to PDF'],
  ['from-pdf', 'Convert from PDF'], ['edit', 'Edit PDF'], ['security', 'PDF Security'], ['image', 'Image Tools'],
];

const TOOLS = [
  { id: 'merge', cat: 'organize', name: 'Merge PDF', icon: 'MRG', color: '#e5322d', accept: PDF, multiple: true, min: 2, sortable: true,
    desc: 'Combine PDFs in the order you want with the easiest PDF merger available.' },
  { id: 'split', cat: 'organize', name: 'Split PDF', icon: 'SPL', color: '#e5322d', accept: PDF,
    desc: 'Separate one page or a whole set for easy conversion into independent PDF files.',
    options: [
      { name: 'mode', label: 'Split mode', type: 'select', choices: [['all', 'Extract every page as a separate PDF'], ['ranges', 'Custom ranges (one PDF per range)']] },
      { name: 'ranges', label: 'Ranges', placeholder: '1-3, 4-6, 7', help: 'Each comma-separated range becomes one PDF', showIf: { mode: 'ranges' } },
    ] },
  { id: 'remove-pages', cat: 'organize', name: 'Remove Pages', icon: 'DEL', color: '#e5322d', accept: PDF,
    desc: 'Delete the pages you do not need from your PDF document.',
    options: [{ name: 'pages', label: 'Pages to remove', placeholder: '2, 5-7', required: true }] },
  { id: 'rotate', cat: 'organize', name: 'Rotate PDF', icon: 'ROT', color: '#a2508c', accept: PDF, multiple: true,
    desc: 'Rotate your PDFs the way you need them. You can even rotate multiple PDFs at once!',
    options: [
      { name: 'angle', label: 'Rotation', type: 'select', choices: [['90', '90\u00b0 clockwise'], ['180', '180\u00b0'], ['270', '90\u00b0 counter-clockwise']] },
      { name: 'pages', label: 'Pages', value: 'all', help: PAGES_HELP },
    ] },
  { id: 'compress', cat: 'organize', name: 'Compress PDF', icon: 'CMP', color: '#6aa84f', accept: PDF, multiple: true, showSaving: true,
    desc: 'Reduce file size while optimizing for maximal PDF quality.',
    options: [{ name: 'level', label: 'Compression level', type: 'select', value: 'recommended', choices: [
      ['extreme', 'Extreme - smallest file, lower quality'], ['recommended', 'Recommended - good quality, good compression'], ['low', 'Less compression - high quality']] }] },
  { id: 'pdf-to-word', cat: 'from-pdf', name: 'PDF to Word', icon: 'W', color: '#2b579a', accept: PDF, multiple: true,
    desc: 'Easily convert your PDF files into easy to edit DOC and DOCX documents.' },
  { id: 'pdf-to-powerpoint', cat: 'from-pdf', name: 'PDF to PowerPoint', icon: 'P', color: '#d24726', accept: PDF, multiple: true,
    desc: 'Turn your PDF files into PPTX slideshows (page text is added to the speaker notes).' },
  { id: 'pdf-to-excel', cat: 'from-pdf', name: 'PDF to Excel', icon: 'X', color: '#1e7145', accept: PDF, multiple: true,
    desc: 'Pull data and tables straight from PDFs into Excel spreadsheets in a few short seconds.' },
  { id: 'pdf-to-jpg', cat: 'from-pdf', name: 'PDF to JPG', icon: 'JPG', color: '#c9a400', accept: PDF, multiple: true,
    desc: 'Convert each PDF page into a JPG or extract all images contained in a PDF.',
    options: [
      { name: 'mode', label: 'Mode', type: 'select', choices: [['pages', 'Page to image'], ['extract', 'Extract embedded images']] },
      { name: 'dpi', label: 'Image quality', type: 'select', value: '150', showIf: { mode: 'pages' },
        choices: [['72', 'Low (72 DPI)'], ['150', 'Normal (150 DPI)'], ['300', 'High (300 DPI)']] },
      { name: 'format', label: 'Format', type: 'select', showIf: { mode: 'pages' }, choices: [['jpg', 'JPG'], ['png', 'PNG']] },
    ] },
  { id: 'word-to-pdf', cat: 'to-pdf', name: 'Word to PDF', icon: 'W', color: '#2b579a', accept: '.doc,.docx,.odt,.rtf,.txt', multiple: true,
    desc: 'Make DOC and DOCX files easy to read by converting them to PDF.' },
  { id: 'powerpoint-to-pdf', cat: 'to-pdf', name: 'PowerPoint to PDF', icon: 'P', color: '#d24726', accept: '.ppt,.pptx,.odp', multiple: true,
    desc: 'Make PPT and PPTX slideshows easy to view by converting them to PDF.' },
  { id: 'excel-to-pdf', cat: 'to-pdf', name: 'Excel to PDF', icon: 'X', color: '#1e7145', accept: '.xls,.xlsx,.ods,.csv', multiple: true,
    desc: 'Make EXCEL spreadsheets easy to read by converting them to PDF.' },
  { id: 'jpg-to-pdf', cat: 'to-pdf', name: 'JPG to PDF', icon: 'JPG', color: '#c9a400', accept: IMG, multiple: true, sortable: true,
    desc: 'Convert JPG / PNG images to PDF in seconds. Easily adjust orientation and margins.',
    options: [
      { name: 'page_size', label: 'Page size', type: 'select', choices: [['a4', 'A4'], ['letter', 'US Letter'], ['legal', 'US Legal'], ['fit', 'Same as image']] },
      { name: 'orientation', label: 'Orientation', type: 'select', showIf: { page_size: ['a4', 'letter', 'legal'] },
        choices: [['auto', 'Automatic'], ['portrait', 'Portrait'], ['landscape', 'Landscape']] },
      { name: 'margin', label: 'Margin', type: 'select', value: '20', showIf: { page_size: ['a4', 'letter', 'legal'] },
        choices: [['0', 'No margin'], ['20', 'Small'], ['40', 'Big']] },
    ] },
  { id: 'html-to-pdf', cat: 'to-pdf', name: 'HTML to PDF', icon: 'HTML', color: '#c9a400', accept: '.html,.htm', optionalFile: true,
    desc: 'Convert webpages to PDF. Paste a URL or upload an HTML file and convert it with a click.',
    options: [{ name: 'url', label: 'Website URL', type: 'url', placeholder: 'https://example.com', help: 'Leave empty if you uploaded an HTML file' }] },
  { id: 'edit', cat: 'edit', name: 'Edit PDF', icon: 'EDIT', color: '#a2508c', accept: PDF, editor: 'edit',
    desc: 'Add text, images, shapes or freehand annotations to a PDF document. Erase content with whiteout.' },
  { id: 'sign', cat: 'edit', name: 'Sign PDF', icon: 'SIGN', color: '#3d6fb4', accept: PDF, editor: 'sign',
    desc: 'Draw, type or upload your signature and place it anywhere on your PDF.' },
  { id: 'watermark', cat: 'edit', name: 'Watermark', icon: 'WM', color: '#a2508c', accept: PDF, multiple: true,
    desc: 'Stamp an image or text over your PDF in seconds. Choose the typography, transparency and position.',
    options: [
      { name: '_type', label: 'Watermark type', type: 'select', choices: [['text', 'Text'], ['image', 'Image']] },
      { name: 'text', label: 'Text', value: 'CONFIDENTIAL', showIf: { _type: 'text' } },
      { name: 'font', label: 'Font', type: 'select', showIf: { _type: 'text' }, choices: [['helvetica', 'Helvetica'], ['times', 'Times'], ['courier', 'Courier']] },
      { name: 'font_size', label: 'Font size', type: 'number', value: 60, min: 6, max: 300, showIf: { _type: 'text' } },
      { name: 'color', label: 'Color', type: 'color', value: '#e5322d', showIf: { _type: 'text' } },
      { name: 'rotation', label: 'Rotation', type: 'select', value: '45', showIf: { _type: 'text' },
        choices: [['0', 'None'], ['45', '45\u00b0 diagonal'], ['-45', '-45\u00b0 diagonal'], ['90', '90\u00b0']] },
      { name: 'watermark_image', label: 'Image', type: 'file', accept: IMG, showIf: { _type: 'image' } },
      { name: 'image_scale', label: 'Image width (% of page)', type: 'range', min: 5, max: 100, value: 40, showIf: { _type: 'image' } },
      { name: 'opacity', label: 'Opacity (%)', type: 'range', min: 5, max: 100, value: 30 },
      { name: 'position', label: 'Position', type: 'select', value: 'center', choices: [
        ['center', 'Center'], ['top-left', 'Top left'], ['top-center', 'Top center'], ['top-right', 'Top right'],
        ['bottom-left', 'Bottom left'], ['bottom-center', 'Bottom center'], ['bottom-right', 'Bottom right']] },
      { name: 'pages', label: 'Pages', value: 'all', help: PAGES_HELP },
    ] },
  { id: 'page-numbers', cat: 'edit', name: 'Page Numbers', icon: '123', color: '#a2508c', accept: PDF, multiple: true,
    desc: 'Add page numbers into PDFs with ease. Choose position and starting number.',
    options: [
      { name: 'position', label: 'Position', type: 'select', value: 'bottom-center', choices: [
        ['bottom-center', 'Bottom center'], ['bottom-right', 'Bottom right'], ['bottom-left', 'Bottom left'],
        ['top-center', 'Top center'], ['top-right', 'Top right'], ['top-left', 'Top left']] },
      { name: 'start', label: 'First number', type: 'number', value: 1, min: 0 },
      { name: 'font_size', label: 'Font size', type: 'number', value: 11, min: 6, max: 48 },
    ] },
  { id: 'unlock', cat: 'security', name: 'Unlock PDF', icon: 'UNL', color: '#3d6fb4', accept: PDF, multiple: true,
    desc: 'Remove PDF password security, giving you the freedom to use your PDFs as you want.',
    options: [{ name: 'password', label: 'Password', type: 'password', help: 'Needed only if the PDF asks for a password to open' }] },
  { id: 'protect', cat: 'security', name: 'Protect PDF', icon: 'LOCK', color: '#3d6fb4', accept: PDF, multiple: true,
    desc: 'Encrypt your PDF with a password (AES-256) to prevent unauthorized access.',
    options: [{ name: 'password', label: 'Password', type: 'password', required: true, help: 'Minimum 4 characters' }] },
  { id: 'compress-image', cat: 'image', name: 'Compress Image', icon: 'CMP', color: '#0e9f8e', accept: IMG, multiple: true, showSaving: true,
    desc: 'Compress JPG, PNG and WEBP images by quality, or to an exact maximum file size (KB).',
    options: [
      { name: '_mode', label: 'Compress by', type: 'select', choices: [['quality', 'Quality level'], ['target', 'Target file size (KB)']] },
      { name: 'quality', label: 'Quality (%)', type: 'range', min: 5, max: 100, value: 70, showIf: { _mode: 'quality' } },
      { name: 'target_kb', label: 'Maximum size (KB)', type: 'number', value: 100, min: 5, showIf: { _mode: 'target' },
        help: 'e.g. 20, 50, 100, 200 KB for online forms' },
      { name: 'format', label: 'Output format', type: 'select', choices: FORMAT_CHOICES },
    ] },
  { id: 'resize-image', cat: 'image', name: 'Resize Image', icon: 'SIZE', color: '#0e9f8e', accept: IMG, multiple: true,
    desc: 'Resize images to any size you want: pixels, percentage, cm, mm or inches, with optional max file size.',
    options: [
      { name: '_presets', label: 'Quick sizes', type: 'presets', presets: [
        ['Passport 35x45 mm', { unit: 'mm', width: 35, height: 45, dpi: 300, fit: 'cover' }],
        ['Photo 2x2 in', { unit: 'in', width: 2, height: 2, dpi: 300, fit: 'cover' }],
        ['Signature 140x60 px', { unit: 'px', width: 140, height: 60, fit: 'pad' }],
        ['Instagram 1080x1080', { unit: 'px', width: 1080, height: 1080, fit: 'cover' }],
        ['HD 1920x1080', { unit: 'px', width: 1920, height: 1080, fit: 'contain' }],
        ['50%', { unit: 'percent', percent: 50 }],
      ] },
      { name: 'unit', label: 'Unit', type: 'select', choices: [['px', 'Pixels'], ['percent', 'Percentage'], ['cm', 'Centimeters'], ['mm', 'Millimeters'], ['in', 'Inches']] },
      { name: 'percent', label: 'Percentage of original (%)', type: 'number', value: 50, min: 1, max: 1000, showIf: { unit: 'percent' } },
      { name: 'width', label: 'Width', type: 'number', min: 0, step: 'any', placeholder: 'auto', showIf: { unit: ['px', 'cm', 'mm', 'in'] } },
      { name: 'height', label: 'Height', type: 'number', min: 0, step: 'any', placeholder: 'auto', showIf: { unit: ['px', 'cm', 'mm', 'in'] },
        help: 'Leave one empty to keep the aspect ratio' },
      { name: 'dpi', label: 'DPI', type: 'number', value: 300, min: 30, max: 1200, showIf: { unit: ['cm', 'mm', 'in'] } },
      { name: 'fit', label: 'When both width and height are given', type: 'select', showIf: { unit: ['px', 'cm', 'mm', 'in'] }, choices: [
        ['contain', 'Fit inside (keep ratio)'], ['cover', 'Fill and crop (exact size)'], ['pad', 'Fit and add background (exact size)'], ['stretch', 'Stretch (exact size)']] },
      { name: 'background', label: 'Background color', type: 'color', value: '#ffffff', showIf: { fit: 'pad' } },
      { name: 'format', label: 'Output format', type: 'select', choices: FORMAT_CHOICES },
      { name: 'target_kb', label: 'Max file size in KB (optional)', type: 'number', min: 0, placeholder: 'no limit' },
    ] },
  { id: 'remove-background', cat: 'image', name: 'Remove Background', icon: 'BG', color: '#7b4fd6', accept: IMG, multiple: true,
    desc: 'Remove the background from photos with AI, or replace it with any color, your own image/screen, or a blur.',
    options: [
      { name: 'background', label: 'New background', type: 'select', choices: [
        ['transparent', 'Transparent (no background)'], ['color', 'Solid color'], ['image', 'My own image / screen'], ['blur', 'Blur original background']] },
      { name: '_colors', label: 'Quick colors', type: 'presets', presets: [
        ['White', { background: 'color', color: '#ffffff' }], ['Passport blue', { background: 'color', color: '#4a90d9' }],
        ['Light blue', { background: 'color', color: '#cfe8ff' }], ['Red', { background: 'color', color: '#d32f2f' }],
        ['Green screen', { background: 'color', color: '#00b140' }], ['Black', { background: 'color', color: '#000000' }],
        ['Grey', { background: 'color', color: '#bdbdbd' }]] },
      { name: 'color', label: 'Background color', type: 'color', value: '#ffffff', showIf: { background: 'color' } },
      { name: 'bg_image', label: 'Background image', type: 'file', accept: IMG, showIf: { background: 'image' },
        help: 'It is resized and cropped to fit your photo' },
      { name: 'blur', label: 'Blur strength', type: 'range', min: 2, max: 60, value: 18, showIf: { background: 'blur' } },
      { name: 'model', label: 'Subject type', type: 'select', choices: [
        ['person', 'People / portraits / passport photos'], ['general', 'Anything (products, objects, people)'], ['fast', 'Fast (lower quality)']] },
      { name: 'trim', label: 'Photo borders', type: 'select', choices: [
        ['yes', 'Remove plain border strips (scanned / printed photos)'], ['no', 'Keep full image']] },
      { name: 'format', label: 'Output format', type: 'select', choices: [['png', 'PNG (keeps transparency)'], ['webp', 'WEBP'], ['jpeg', 'JPG (no transparency)']] },
    ] },
  { id: 'convert-image', cat: 'image', name: 'Convert Image', icon: 'IMG', color: '#0e9f8e', accept: IMG, multiple: true,
    desc: 'Convert images between JPG, PNG and WEBP formats.',
    options: [{ name: 'format', label: 'Convert to', type: 'select', choices: [['jpeg', 'JPG'], ['png', 'PNG'], ['webp', 'WEBP']] }] },
];

/* ------------------------------------------------------------------ routing */
if (window.BrowserTools) {
  for (const tool of TOOLS) {
    tool.desktopOnly = !BrowserTools.supported.has(tool.id);
    if (tool.accept === IMG) tool.accept = '.jpg,.jpeg,.png,.webp,.bmp,.gif';
    if (tool.id === 'pdf-to-jpg') {
      tool.desc = 'Render PDF pages as JPG or PNG images.';
      tool.options[0].choices = [['pages', 'Page to image']];
    }
    if (tool.id === 'compress') tool.desc = 'Create smaller, image-only PDFs. Searchable text, links, and forms are removed when compression is applied.';
    if (tool.id === 'edit') tool.desc = 'Change visible PDF text or add annotations. Pages with text replacements are flattened. Whiteout is not secure redaction.';
    if (tool.id === 'sign') tool.desc = 'Add a visual signature to a PDF. This is not a certificate-based digital signature.';
    if (tool.id === 'convert-image') tool.desc = 'Convert JPG, PNG, WEBP, BMP or GIF to JPG, PNG or WEBP. Animated images become a single frame.';
    if (tool.id === 'compress-image') tool.desc = 'Compress JPG and WEBP by quality or maximum KB. PNG output remains lossless.';
    if (tool.id === 'remove-background') { tool.multiple = false; tool.color = '#0e9f8e'; tool.desc = 'AI background removal with erase/restore brushes, photo or color backgrounds, and image adjustments.'; }
  }
}

let homeQuery = '';
const DESKTOP_ONLY_REASONS = {
  'pdf-to-word': 'Needs the desktop document extraction and conversion engine.',
  'pdf-to-powerpoint': 'Needs the desktop document extraction and conversion engine.',
  'pdf-to-excel': 'Needs the desktop document extraction and conversion engine.',
  'word-to-pdf': 'Needs the desktop conversion service and a compatible office suite.',
  'powerpoint-to-pdf': 'Needs the desktop conversion service and a compatible office suite.',
  'excel-to-pdf': 'Needs the desktop conversion service and a compatible office suite.',
  'html-to-pdf': 'Needs a local browser-rendering service.',
  unlock: 'PDF password operations are currently handled by the desktop processor.',
  protect: 'PDF password operations are currently handled by the desktop processor.',
};
let installPromptEvent = null;
let appInstalled = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const LOCAL_DESKTOP_API = 'http://127.0.0.1:5000';
const localPage = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const canCheckLocalDesktop = !!window.BrowserTools && (localPage || appInstalled);
let localDesktopState = canCheckLocalDesktop ? 'checking' : 'unavailable';
let localDesktopTools = new Set();
let localInstallerAvailable = false;

async function checkLocalDesktop() {
  try {
    const response = await fetch(`${LOCAL_DESKTOP_API}/api/health`);
    if (!response.ok) throw new Error('Local service is unavailable.');
    const health = await response.json();
    localDesktopTools = new Set(health.tools);
    localInstallerAvailable = health.installer_available === true;
    localDesktopState = 'available';
  } catch {
    localDesktopState = 'unavailable';
  }
  for (const tool of TOOLS) {
    tool.desktopOnly = !BrowserTools.supported.has(tool.id) && !localDesktopTools.has(tool.id);
  }
  route();
}
if (canCheckLocalDesktop) checkLocalDesktop();

function updateInstallUI() {
  document.querySelectorAll('[data-install-app]').forEach(button => {
    button.disabled = appInstalled;
    const label = button.querySelector('span');
    if (label) label.textContent = appInstalled ? 'App installed' : 'Install app';
  });
}

async function installApp() {
  const status = $('[data-install-status]');
  if (appInstalled) {
    if (status) status.textContent = 'Edit Doc Station is installed on this device.';
    return;
  }
  if (!installPromptEvent) {
    if (status) status.textContent = 'To install, open your browser menu and choose "Install app" or "Add to Home Screen".';
    return;
  }
  installPromptEvent.prompt();
  const choice = await installPromptEvent.userChoice;
  installPromptEvent = null;
  if (status) status.textContent = choice.outcome === 'accepted' ? 'Edit Doc Station is being installed.' : 'Installation was dismissed.';
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPromptEvent = event;
  updateInstallUI();
});
window.addEventListener('appinstalled', () => {
  appInstalled = true;
  updateInstallUI();
  const status = $('[data-install-status]');
  if (status) status.textContent = 'Edit Doc Station is installed on this device.';
});
document.addEventListener('click', event => {
  if (event.target.closest('[data-install-app]')) installApp();
});
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js')
    .then(registration => registration.update())
    .catch(() => {});
}

function installPromo() {
  const description = localDesktopState === 'available'
    ? 'Local desktop service connected. All tools are available on this PC.'
    : 'Install the browser app for offline access to browser-ready tools. Desktop-only features require the local desktop service.';
  return el('section', { class: 'install-promo', 'aria-labelledby': 'install-title' },
    el('div', { class: 'install-mark', 'aria-hidden': 'true' }, svgIcon(['M12 3v12', 'M7 10l5 5 5-5', 'M5 20h14'])),
    el('div', { class: 'install-copy' },
      el('h2', { id: 'install-title' }, 'A workspace that goes where you go.'),
      el('p', {}, description)),
    el('div', { class: 'install-action' },
      el('button', { class: 'btn install-button', type: 'button', 'data-install-app': true },
        el('span', {}, 'Install app'), svgIcon(['M5 12h14', 'M13 6l6 6-6 6'])),
      localInstallerAvailable && el('a', { class: 'btn install-button', href: `${LOCAL_DESKTOP_API}/api/download/windows` },
        el('span', {}, 'Download Windows setup'), svgIcon(['M12 3v12', 'M7 10l5 5 5-5', 'M5 20h14'])),
      el('p', { class: 'install-status', 'data-install-status': true, role: 'status', 'aria-live': 'polite' })));
}

function renderDesktopOnly(tool) {
  const explanation = localDesktopState === 'checking'
    ? 'Checking for the local desktop service...'
    : localPage || appInstalled
      ? 'Start the Edit Doc Station desktop service on this PC, then reload this app.'
      : 'GitHub Pages serves static files and cannot run the local Python, Office, or browser-rendering services this tool needs.';
  $('#app').replaceChildren(
    el('a', { class: 'back', href: '#' }, '\u2190 All tools'),
    el('div', { class: 'tool-head' }, toolIcon(tool, true),
      el('div', {}, el('h1', {}, tool.name), el('p', {}, tool.desc))),
    el('section', { class: 'desktop-availability' },
      el('span', { class: 'availability-badge' }, 'Desktop only'),
      el('p', {}, DESKTOP_ONLY_REASONS[tool.id]),
      el('p', {}, explanation)));
}

function route() {
  if (window.disposeBackgroundEditor) disposeBackgroundEditor();
  const tool = TOOLS.find(t => t.id === location.hash.slice(1));
  if (tool?.desktopOnly) renderDesktopOnly(tool);
  else tool ? renderTool(tool) : renderHome();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
document.addEventListener('DOMContentLoaded', route);

// Line icons on a 24x24 grid: strings are path data, {c:[cx,cy,r]} circles, {r:[x,y,w,h,rx]} rects.
const DOC = ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5'];
const PICTURE = [{ r: [3, 3, 18, 18, 2] }, { c: [9, 9, 2] }, 'M21 15l-5-5L5 21'];
const ICONS = {
  merge: ['M8 6l4-4 4 4', 'M12 2v10.3a4 4 0 0 1-1.2 2.8L4 22', 'M20 22l-5-5'],
  split: [{ c: [6, 6, 3] }, { c: [6, 18, 3] }, 'M20 4L8.1 15.9', 'M14.5 14.5L20 20', 'M8.1 8.1L12 12'],
  'remove-pages': [...DOC, 'M9 14h6'],
  rotate: ['M21 12a9 9 0 1 1-2.6-6.4', 'M21 3v6h-6'],
  compress: ['M4 14h6v6', 'M20 10h-6V4', 'M14 10l7-7', 'M3 21l7-7'],
  'pdf-to-word': [...DOC, 'M8 12l1.5 6 2.5-4 2.5 4 1.5-6'],
  'pdf-to-powerpoint': [...DOC, 'M10 18v-6h2.5a2 2 0 0 1 0 4H10'],
  'pdf-to-excel': [...DOC, 'M9 12l6 6', 'M15 12l-6 6'],
  'pdf-to-jpg': PICTURE,
  'word-to-pdf': [...DOC, 'M8 12l1.5 6 2.5-4 2.5 4 1.5-6'],
  'powerpoint-to-pdf': [...DOC, 'M10 18v-6h2.5a2 2 0 0 1 0 4H10'],
  'excel-to-pdf': [...DOC, 'M9 12l6 6', 'M15 12l-6 6'],
  'jpg-to-pdf': [...PICTURE],
  'html-to-pdf': ['M8 8l-5 4 5 4', 'M16 8l5 4-5 4', 'M14 4l-4 16'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  sign: ['M3 17c3-3 5-9 7-9s-1 9 2 9 3-4 5-4 2 2 4 2', 'M3 21h18'],
  watermark: ['M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z'],
  'page-numbers': ['M10 6h11', 'M10 12h11', 'M10 18h11', 'M4 6h1v4', 'M4 10h2', 'M6 18H4c0-1 2-2 2-3s-1-1.5-2-1'],
  unlock: [{ r: [4, 11, 16, 10, 2] }, 'M8 11V7a4 4 0 0 1 7.8-1.3'],
  protect: [{ r: [4, 11, 16, 10, 2] }, 'M8 11V7a4 4 0 0 1 8 0v4', 'M12 15v2'],
  'compress-image': [...PICTURE.slice(0, 2), 'M21 15l-5-5L5 21'],
  'resize-image': ['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7'],
  'remove-background': [{ c: [12, 9, 4] }, 'M4 21a8 8 0 0 1 16 0', 'M19 1.5l.8 1.7 1.7.8-1.7.8L19 6.5l-.8-1.7-1.7-.8 1.7-.8z'],
  'convert-image': ['M17 1l4 4-4 4', 'M3 11V9a4 4 0 0 1 4-4h14', 'M7 23l-4-4 4-4', 'M21 13v2a4 4 0 0 1-4 4H3'],
};

function svgIcon(spec) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
    .forEach(([k, v]) => svg.setAttribute(k, v));
  for (const part of spec) {
    let node;
    if (typeof part === 'string') {
      node = document.createElementNS(NS, 'path');
      node.setAttribute('d', part);
    } else if (part.c) {
      node = document.createElementNS(NS, 'circle');
      ['cx', 'cy', 'r'].forEach((k, i) => node.setAttribute(k, part.c[i]));
    } else {
      node = document.createElementNS(NS, 'rect');
      ['x', 'y', 'width', 'height', 'rx'].forEach((k, i) => node.setAttribute(k, part.r[i]));
    }
    svg.append(node);
  }
  return svg;
}

// Conversion tools get a small format badge (e.g. "PDF") on the icon.
const ICON_BADGE = {
  'pdf-to-word': 'DOC', 'pdf-to-powerpoint': 'PPT', 'pdf-to-excel': 'XLS', 'pdf-to-jpg': 'JPG',
  'word-to-pdf': 'PDF', 'powerpoint-to-pdf': 'PDF', 'excel-to-pdf': 'PDF', 'jpg-to-pdf': 'PDF', 'html-to-pdf': 'PDF',
};

const toolIcon = (t, big) => el('span', { class: 'icon' + (big ? ' big' : ''), style: { background: `${t.color}1a`, color: t.color } },
  ICONS[t.id] ? svgIcon(ICONS[t.id]) : t.icon,
  ICON_BADGE[t.id] && el('span', { class: 'icon-badge', style: { background: t.color } }, ICON_BADGE[t.id]));

function toolCard(tool) {
  const body = el('div', {},
    el('h3', {}, tool.name),
    el('p', {}, tool.desc),
    tool.desktopOnly && el('span', { class: 'availability-badge' }, 'Desktop only'));
  return el('a', { class: 'card' + (tool.desktopOnly ? ' desktop-only' : ''), href: '#' + tool.id },
    toolIcon(tool), body);
}

function renderHome() {
  const app = $('#app');
  const search = el('input', { type: 'search', class: 'search', placeholder: window.BrowserTools ? 'Search tools (e.g. merge, resize, watermark)' : 'Search tools (e.g. compress, word, background)', 'aria-label': 'Search tools' });
  search.value = homeQuery;
  const sections = el('div');
  const draw = () => {
    homeQuery = search.value;
    const q = homeQuery.trim().toLowerCase();
    const list = TOOLS.filter(t => !q || `${t.name} ${t.desc}`.toLowerCase().includes(q));
    sections.replaceChildren(...CATS.filter(([id]) => id !== 'all').map(([id, label]) => {
      const items = list.filter(t => t.cat === id);
      if (!items.length) return null;
      return el('section', { class: 'cat-section' },
        el('div', { class: 'cat-head' }, el('h2', {}, label), el('span', { class: 'count' }, `${items.length} tool${items.length > 1 ? 's' : ''}`)),
        el('div', { class: 'grid' }, items.map(toolCard)));
    }).filter(Boolean));
    if (!list.length) sections.append(el('p', { class: 'empty' }, 'No tools match your search.'));
  };
  search.addEventListener('input', draw);
  app.replaceChildren(
    el('section', { class: 'hero' },
      el('div', {},
        el('h1', {}, window.BrowserTools ? 'Edit Doc Station' : 'Document & Image Toolkit'),
        el('p', {}, window.BrowserTools ? 'Files stay in your browser.' : 'Convert, edit, organize and secure PDF documents, and optimize images. Everything is processed privately on this computer.')),
      search),
    sections,
    installPromo());
  draw();
  updateInstallUI();
}

/* ------------------------------------------------------------------ shared UI */
function acceptsFile(t, file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  return t.accept.split(',').includes(ext);
}

function dropZone(t, onFiles, compact) {
  const input = el('input', { type: 'file', accept: t.accept, multiple: !!t.multiple, hidden: true });
  input.addEventListener('change', () => { onFiles([...input.files]); input.value = ''; });
  const zone = el('div', { class: 'drop' + (compact ? ' compact' : ''), onclick: () => input.click() },
    el('button', { class: 'btn btn-primary ' + (compact ? '' : 'btn-lg'), type: 'button' },
      compact ? '+ Add more files' : `Select ${t.accept === PDF ? 'PDF ' : ''}file${t.multiple ? 's' : ''}`),
    !compact && el('p', {}, 'or drop files here'));
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('over'); onFiles([...e.dataTransfer.files]); });
  return el('div', {}, input, zone);
}

function setStatus(box, msg, kind) {
  box.className = 'status' + (kind === 'error' ? ' error' : '');
  box.replaceChildren(...(kind === 'busy' ? [el('div', { class: 'spinner' })] : []), msg || '');
}

function filenameFrom(cd) {
  if (!cd) return null;
  let m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (m) return decodeURIComponent(m[1]);
  m = /filename="?([^";]+)"?/i.exec(cd);
  return m ? m[1] : null;
}

function download(blob, name) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

const SERVER_DOWN = 'Cannot reach the Edit Doc Station server. Start it with run.bat and try again.';

async function post(url, fd) {
  const match = /^\/api\/tool\/(.+)$/.exec(url);
  const desktopTool = window.BrowserTools && match && !BrowserTools.supported.has(match[1]);
  if (window.BrowserTools && !(localDesktopState === 'available' && (desktopTool || url === '/api/render'))) {
    return BrowserTools.post(url, fd);
  }
  const target = window.BrowserTools ? `${LOCAL_DESKTOP_API}${url}` : url;
  try {
    return await fetch(target, { method: 'POST', body: fd });
  } catch {
    throw new Error(window.BrowserTools ? 'Could not reach the local desktop service on this PC.' : SERVER_DOWN);
  }
}

async function runTool(toolId, fd) {
  const res = await post(`/api/tool/${toolId}`, fd);
  if (!res.ok) {
    let msg = `Something went wrong (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return {
    blob: await res.blob(),
    name: filenameFrom(res.headers.get('Content-Disposition')) || 'result',
    original: Number(res.headers.get('X-Original-Size')) || 0,
    size: Number(res.headers.get('X-Result-Size')) || 0,
  };
}

/* ------------------------------------------------------------------ result + preview */
const PREVIEW_KEY = 'eds_preview_before_download';
const previewEnabled = () => localStorage.getItem(PREVIEW_KEY) !== '0';

function previewToggle() {
  const box = el('input', { type: 'checkbox' });
  box.checked = previewEnabled();
  box.addEventListener('change', () => localStorage.setItem(PREVIEW_KEY, box.checked ? '1' : '0'));
  return el('label', { class: 'preview-toggle' }, box, 'Preview result before download');
}

const extOf = name => name.split('.').pop().toLowerCase();
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
const DOC_EXT = ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'odt', 'odp', 'ods', 'rtf', 'csv', 'txt'];

function showResult(t, body, result, originals = []) {
  const auto = !previewEnabled();
  if (auto) download(result.blob, result.name);
  let saving = null;
  if (t.showSaving && result.original) {
    const diff = Math.round((1 - result.size / result.original) * 100);
    saving = el('div', { class: 'saving' },
      `${fmtSize(result.original)} \u2192 ${fmtSize(result.size)} ` + (diff > 0 ? `(saved ${diff}%)` : '(already optimized)'));
  }
  const preview = el('div', { class: 'preview' });
  body.replaceChildren(el('div', { class: 'panel result' },
    el('h2', {}, auto ? 'Your file has been downloaded' : 'Your file is ready - preview it below'),
    el('p', {}, `${result.name} \u00b7 ${fmtSize(result.blob.size)}`),
    saving,
    el('div', { class: 'actions' },
      el('button', { class: 'btn btn-primary btn-lg', onclick: () => download(result.blob, result.name) }, auto ? 'Download again' : 'Download'),
      el('button', { class: 'btn btn-lg', onclick: () => renderTool(t) }, `${t.name} again`),
      el('a', { class: 'btn btn-lg', href: '#' }, 'All tools')),
    previewToggle()),
    preview);
  if (!auto) {
    const original = originals.length === 1 && IMAGE_EXT.includes(extOf(result.name)) && originals[0].type.startsWith('image/') ? originals[0] : null;
    renderPreview(preview, result.blob, result.name, original);
  }
}

async function renderPreview(box, blob, name, original) {
  const ext = extOf(name);
  box.replaceChildren(el('div', { class: 'status' }, el('div', { class: 'spinner' }), 'Preparing preview...'));
  try {
    if (IMAGE_EXT.includes(ext)) {
      box.replaceChildren(original
        ? el('div', { class: 'pv-compare' }, await imageCard(original, 'Before'), await imageCard(blob, 'After'))
        : await imageCard(blob, name));
    } else if (ext === 'zip') {
      await zipPreview(box, blob);
    } else if (DOC_EXT.includes(ext)) {
      box.replaceChildren(await documentPages(blob, name));
    } else {
      box.replaceChildren(el('p', { class: 'muted' }, 'Preview is not available for this file type.'));
    }
  } catch (err) {
    box.replaceChildren(el('p', { class: 'status error' }, `Preview not available: ${err.message}`));
  }
}

async function imageCard(blob, label) {
  const url = URL.createObjectURL(blob);
  const img = el('img', { src: url, alt: label });
  await img.decode().catch(() => {});
  return el('figure', { class: 'pv-image' },
    el('div', { class: 'checker' }, img),
    el('figcaption', {}, `${label} \u00b7 ${img.naturalWidth} \u00d7 ${img.naturalHeight} px \u00b7 ${fmtSize(blob.size)}`));
}

async function documentPages(blob, name) {
  const fd = new FormData();
  fd.append('file', blob, name);
  const res = await post('/api/render', fd);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'could not render');
  return el('div', { class: 'pv-doc' },
    el('div', { class: 'pv-info' }, data.total > data.pages.length
      ? `Showing first ${data.pages.length} of ${data.total} pages` : `${data.total} page${data.total > 1 ? 's' : ''}`),
    el('div', { class: 'pv-pages' }, data.pages.map((src, i) =>
      el('figure', {}, el('img', { src, alt: `Page ${i + 1}`, loading: 'lazy' }), el('figcaption', {}, `Page ${i + 1}`)))));
}

async function zipPreview(box, blob) {
  const entries = await unzip(blob);
  const viewer = el('div', { class: 'pv-zip-view' });
  const list = el('div', { class: 'pv-zip-list' });
  const open = async (entry, btn) => {
    list.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const file = await entryBlob(entry);
    viewer.replaceChildren(el('div', { class: 'pv-entry-head' }, el('b', {}, entry.name),
      el('button', { class: 'btn', onclick: () => download(file, entry.name) }, 'Download this file')), el('div'));
    await renderPreview(viewer.lastChild, file, entry.name, null);
  };
  entries.forEach(entry => {
    const btn = el('button', { class: 'btn', title: entry.name, onclick: () => open(entry, btn) }, entry.name);
    list.append(btn);
  });
  box.replaceChildren(el('div', { class: 'pv-info' }, `ZIP with ${entries.length} file${entries.length > 1 ? 's' : ''} - click a file to preview it`),
    el('div', { class: 'pv-zip' }, list, viewer));
  if (entries.length) open(entries[0], list.firstChild);
}

// Minimal ZIP reader (stored + deflate) using the browser's DecompressionStream.
async function unzip(blob) {
  const buf = await blob.arrayBuffer();
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = v.byteLength - 22; i >= Math.max(0, v.byteLength - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('invalid ZIP file');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const files = [];
  for (let n = 0; n < count; n++) {
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const offset = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const start = offset + 30 + v.getUint16(offset + 26, true) + v.getUint16(offset + 28, true);
    files.push({ name, method, data: new Uint8Array(buf, start, size) });
  }
  return files;
}

async function entryBlob(entry) {
  const type = IMAGE_EXT.includes(extOf(entry.name)) ? `image/${extOf(entry.name).replace('jpg', 'jpeg')}` : '';
  if (entry.method === 0) return new Blob([entry.data], { type });
  const stream = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Blob([await new Response(stream).arrayBuffer()], { type });
}

/* ------------------------------------------------------------------ generic tool page */
function renderTool(t) {
  if (window.disposeBackgroundEditor) disposeBackgroundEditor();
  const app = $('#app');
  const body = el('div');
  app.replaceChildren(
    el('a', { class: 'back', href: '#' }, '\u2190 All tools'),
    el('div', { class: 'tool-head' }, toolIcon(t, true), el('div', {}, el('h1', {}, t.name), el('p', {}, t.desc))),
    body);
  if (window.BrowserTools && t.id === 'remove-background') return renderBackgroundEditor(t, body);
  if (t.editor) return renderEditorStart(t, body);

  const files = [];
  const listBox = el('div', { class: 'file-list' });
  const dropBox = el('div');
  const optionsBox = el('div', { class: 'options' });
  const status = el('div', { class: 'status' });
  const goBtn = el('button', { class: 'btn btn-primary btn-lg btn-block' }, t.name);
  const fields = buildOptions(t, optionsBox);
  const sidePanel = el('div', { class: 'panel' }, el('h3', {}, 'Options'), optionsBox, previewToggle(), goBtn, status);
  const work = el('div', { class: 'workspace' }, el('div', {}, dropBox, listBox), sidePanel);
  body.append(work);

  function addFiles(list) {
    const ok = list.filter(f => acceptsFile(t, f));
    if (ok.length < list.length) setStatus(status, `Some files were skipped. Allowed: ${t.accept}`, 'error');
    else setStatus(status, '');
    if (!t.multiple) files.length = 0;
    files.push(...(t.multiple ? ok : ok.slice(0, 1)));
    refresh();
  }

  function refresh() {
    dropBox.replaceChildren(dropZone(t, addFiles, files.length > 0));
    const ready = files.length > 0 || !!t.optionalFile;
    work.classList.toggle('single', !ready);
    sidePanel.hidden = !ready;
    listBox.replaceChildren(...files.map((f, i) => {
      const isImg = f.type.startsWith('image/');
      const thumb = isImg ? el('img', { class: 'thumb', src: URL.createObjectURL(f), alt: '' })
        : el('div', { class: 'thumb' }, f.name.split('.').pop().toUpperCase());
      const move = d => { const j = i + d; if (j < 0 || j >= files.length) return; [files[i], files[j]] = [files[j], files[i]]; refresh(); };
      return el('div', { class: 'file-row' }, thumb,
        el('span', { class: 'name', title: f.name }, `${t.sortable ? (i + 1) + '. ' : ''}${f.name}`),
        el('span', { class: 'size' }, fmtSize(f.size)),
        t.sortable && el('button', { class: 'icon-btn', title: 'Move up', onclick: () => move(-1) }, '\u2191'),
        t.sortable && el('button', { class: 'icon-btn', title: 'Move down', onclick: () => move(1) }, '\u2193'),
        el('button', { class: 'icon-btn', title: 'Remove', onclick: () => { files.splice(i, 1); refresh(); } }, '\u00d7'));
    }));
  }

  goBtn.addEventListener('click', async () => {
    const min = t.optionalFile ? 0 : (t.min || 1);
    if (files.length < min) return setStatus(status, `Please add at least ${min} file${min > 1 ? 's' : ''}`, 'error');
    const fd = new FormData();
    files.forEach(f => fd.append('files', f));
    for (const { o, input } of fields) {
      if (input.disabled || o.name.startsWith('_')) continue;
      if (o.required && !input.value) return setStatus(status, `Please fill in "${o.label}"`, 'error');
      if (o.type === 'file') { if (input.files[0]) fd.append(o.name, input.files[0]); }
      else fd.append(o.name, input.value);
    }
    goBtn.disabled = true;
    setStatus(status, 'Processing, please wait...', 'busy');
    try {
      showResult(t, body, await runTool(t.id, fd), files.slice());
    } catch (err) {
      setStatus(status, err.message, 'error');
    } finally {
      goBtn.disabled = false;
    }
  });

  refresh();
}

function buildOptions(t, box) {
  const fields = [];
  for (const o of t.options || []) {
    if (o.type === 'presets') {
      box.append(el('div', { class: 'field' }, el('span', {}, o.label),
        el('div', { class: 'presets' }, o.presets.map(([label, values]) => el('button', {
          class: 'btn', type: 'button', onclick: () => {
            for (const [k, v] of Object.entries(values)) {
              const input = box.querySelector(`[name="${k}"]`);
              if (input) input.value = v;
            }
            box.dispatchEvent(new Event('change'));
          },
        }, label)))));
      continue;
    }
    let input;
    const valueLabel = el('b');
    if (o.type === 'select') {
      input = el('select', { name: o.name }, o.choices.map(([v, l]) => el('option', { value: v }, l)));
      if (o.value != null) input.value = o.value;
    } else {
      input = el('input', {
        type: o.type || 'text', name: o.name, placeholder: o.placeholder, min: o.min, max: o.max,
        step: o.step, accept: o.accept, autocomplete: o.type === 'password' ? 'off' : null,
      });
      if (o.value != null) input.value = o.value;
      if (o.type === 'range') {
        const sync = () => { valueLabel.textContent = ` ${input.value}`; };
        input.addEventListener('input', sync);
        sync();
      }
    }
    const wrap = el('label', { class: 'field' }, el('span', {}, o.label, o.type === 'range' ? valueLabel : null), input,
      o.help && el('small', {}, o.help));
    fields.push({ o, wrap, input });
    box.append(wrap);
  }
  const update = () => {
    for (const f of fields) {
      const visible = !f.o.showIf || Object.entries(f.o.showIf).every(([k, v]) => {
        const ctrl = box.querySelector(`[name="${k}"]`);
        const val = ctrl && !ctrl.disabled ? ctrl.value : null;
        return Array.isArray(v) ? v.includes(val) : val === v;
      });
      f.wrap.hidden = !visible;
      f.input.disabled = !visible;
    }
  };
  box.addEventListener('change', update);
  box.addEventListener('input', update);
  update();
  update(); // second pass resolves chained conditions (e.g. background depends on fit)
  return fields;
}

/* ------------------------------------------------------------------ PDF editor (Edit / Sign) */
const FONT_CSS = { helvetica: 'Helvetica, Arial, sans-serif', times: '"Times New Roman", Times, serif', courier: '"Courier New", Courier, monospace' };

function renderEditorStart(t, body) {
  body.replaceChildren(dropZone(t, list => {
    const f = list.find(x => acceptsFile(t, x));
    if (f) openEditor(t, f, body);
  }));
}

function openEditor(t, file, body) {
  const isSign = t.editor === 'sign';
  const S = {
    page: 0, count: 1, pageW: 595, pageH: 842, cache: {}, items: [], sel: null,
    mode: isSign ? 'signature' : 'edittext', images: {}, imgN: 0, pending: null, signature: null,
    props: { font: 'helvetica', size: 16, color: '#000000', stroke: 2 },
  };

  const img = el('img', { class: 'ed-img', alt: 'PDF page', draggable: 'false' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ed-svg');
  svg.setAttribute('viewBox', '0 0 1 1');
  svg.setAttribute('preserveAspectRatio', 'none');
  const overlay = el('div', { class: 'ed-overlay' });
  const pageLabel = el('span');
  const status = el('div', { class: 'status' });
  const saveBtn = el('button', { class: 'btn btn-primary btn-lg btn-block' }, isSign ? 'Sign PDF' : 'Save PDF');
  const help = el('div', { class: 'ed-help' });
  const side = el('aside', { class: 'panel ed-side' });

  body.replaceChildren(el('div', { class: 'editor' }, side,
    el('div', { class: 'ed-main' },
      el('div', { class: 'ed-nav' },
        el('button', { class: 'btn', onclick: () => goto(S.page - 1) }, '\u2039 Prev'), pageLabel,
        el('button', { class: 'btn', onclick: () => goto(S.page + 1) }, 'Next \u203a')),
      el('div', { class: 'ed-stage' }, el('div', { class: 'ed-page' }, img, overlay)))));

  /* ---- side panel ---- */
  const MODES = isSign
    ? [['signature', 'Signature'], ['text', 'Text / Date']]
    : [['edittext', 'Edit text'], ['text', 'Add text'], ['image', 'Image'], ['rect', 'Box'], ['whiteout', 'Whiteout'], ['draw', 'Draw']];
  const HELP = {
    edittext: window.BrowserTools
      ? 'Click highlighted text to change it. Text replacements flatten the edited page and use a substitute font on a white background. Scanned text requires OCR.'
      : 'Existing text is highlighted in yellow. Click a line to change it. Clear it to delete the text; use \u00d7 to restore the original.',
    text: 'Click on the page to add text, then type. Drag the blue square to move it.',
    image: 'Choose an image, then click on the page to place it. Drag to move, use the corner to resize.',
    rect: 'Drag on the page to draw a box.',
    whiteout: 'Drag over content to cover (erase) it with white. Then add new text on top.',
    draw: 'Hold and drag on the page to draw freehand.',
    signature: 'Create your signature below, then click on the page to place it. Drag to move, use the corner to resize.',
  };
  const modeBtns = MODES.map(([m, label]) => el('button', { class: 'btn', type: 'button', onclick: () => setMode(m) }, label));

  const fontSel = el('select', {}, Object.keys(FONT_CSS).map(f => el('option', { value: f }, f[0].toUpperCase() + f.slice(1))));
  const sizeIn = el('input', { type: 'number', min: 4, max: 200, value: S.props.size });
  const colorIn = el('input', { type: 'color', value: S.props.color });
  const strokeIn = el('input', { type: 'number', min: 1, max: 20, value: S.props.stroke });
  const onProp = () => {
    Object.assign(S.props, { font: fontSel.value, size: +sizeIn.value || 16, color: colorIn.value, stroke: +strokeIn.value || 2 });
    const it = S.sel;
    if (it) {
      if (it.type === 'text' || it.type === 'replace') Object.assign(it, { font: S.props.font, size: S.props.size, color: S.props.color });
      if (it.type === 'rect' || it.type === 'draw') Object.assign(it, { color: S.props.color, stroke: S.props.stroke });
      render();
    }
  };
  [fontSel, sizeIn, colorIn, strokeIn].forEach(i => i.addEventListener('change', onProp));
  const textProps = [el('label', {}, 'Font', fontSel), el('label', {}, 'Size', sizeIn)];
  const strokeProp = el('label', {}, 'Line width', strokeIn);
  const props = el('div', { class: 'ed-props' }, ...textProps, el('label', {}, 'Color', colorIn), strokeProp);
  const styleHead = el('h4', {}, 'Style');

  const imgInput = el('input', { type: 'file', accept: IMG });
  imgInput.addEventListener('change', async () => {
    const f = imgInput.files[0];
    if (!f) return;
    S.pending = await registerImage(f);
    setMode('image');
  });
  const imageBox = el('div', {}, el('h4', {}, 'Image'), imgInput);
  const sigBox = isSign ? signaturePad(async blob => { S.signature = await registerImage(blob); setMode('signature'); }) : null;

  side.append(
    el('h4', {}, 'Tool'), el('div', { class: 'ed-modes' }, modeBtns),
    styleHead, props,
    imageBox, ...(sigBox ? [sigBox] : []), help,
    el('div', { class: 'sig-row', style: { marginTop: '12px' } },
      el('button', { class: 'btn', onclick: () => { S.items.pop(); S.sel = null; render(); } }, 'Undo'),
      el('button', { class: 'btn', onclick: () => { S.items = S.items.filter(i => i.page !== S.page); S.sel = null; render(); } }, 'Clear page')),
    el('div', { style: { marginTop: '14px' } }, previewToggle(), saveBtn), status);

  function setMode(m) {
    S.mode = m;
    modeBtns.forEach((b, i) => b.classList.toggle('active', MODES[i][0] === m));
    help.textContent = HELP[m];
    textProps.forEach(p => { p.hidden = m !== 'text' && m !== 'edittext'; });
    strokeProp.hidden = !['rect', 'draw'].includes(m);
    styleHead.hidden = props.hidden = ['whiteout', 'image', 'signature'].includes(m);
    imageBox.hidden = m !== 'image';
    if (window.BrowserTools) {
      setStatus(status, m === 'edittext' && S.cache[S.page] && !S.cache[S.page].lines.length
        ? 'No selectable text found on this page. Scanned pages require OCR.' : '');
    }
    render();
  }

  function showProps(it) {
    fontSel.value = it.font;
    sizeIn.value = it.size;
    colorIn.value = it.color;
  }

  async function registerImage(blob) {
    const key = `img_${S.imgN++}`;
    const url = URL.createObjectURL(blob);
    const im = new Image();
    im.src = url;
    await im.decode();
    S.images[key] = blob;
    return { key, url, w: im.naturalWidth, h: im.naturalHeight };
  }

  /* ---- page loading ---- */
  async function loadPage(n) {
    if (!S.cache[n]) {
      const fd = new FormData();
      fd.append('files', file);
      fd.append('page', n);
      const res = await post('/api/preview', fd);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not open PDF');
      S.cache[n] = data;
    }
    return S.cache[n];
  }

  async function goto(n) {
    if (n < 0 || n >= S.count) return;
    setStatus(status, 'Loading page...', 'busy');
    try {
      const data = await loadPage(n);
      Object.assign(S, { page: n, count: data.page_count, pageW: data.width, pageH: data.height, sel: null });
      pageLabel.textContent = `Page ${n + 1} / ${S.count}`;
      img.onload = () => render();
      img.src = data.image;
      setStatus(status, window.BrowserTools && S.mode === 'edittext' && !data.lines.length
        ? 'No selectable text found on this page. Scanned pages require OCR.' : '');
    } catch (err) {
      setStatus(status, err.message, 'error');
    }
  }

  /* ---- items ---- */
  const scale = () => overlay.clientWidth / S.pageW;
  const rel = e => {
    const r = overlay.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };
  function drag(onMove, onUp) {
    const move = ev => onMove(rel(ev));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (onUp) onUp();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  function addItem(it) {
    it.page = S.page;
    S.items.push(it);
    S.sel = it;
    render();
    return it;
  }
  function removeItem(it) {
    S.items = S.items.filter(i => i !== it);
    if (S.sel === it) S.sel = null;
    render();
  }

  overlay.addEventListener('pointerdown', e => {
    if (e.target.closest('.ed-item')) return;
    e.preventDefault();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const p = rel(e);
    const m = S.mode;
    const color = S.props.color;
    const stroke = S.props.stroke;
    if (m === 'edittext') {
      const hit = e.target.closest('.ed-line');
      if (!hit) return;
      const ln = S.cache[S.page].lines[+hit.dataset.idx];
      addItem({ type: 'replace', lineId: `${S.page}:${hit.dataset.idx}`, ...ln, _focus: true });
    } else if (m === 'text') {
      addItem({ type: 'text', x: p.x, y: p.y, text: '', size: S.props.size, color, font: S.props.font, _focus: true });
    } else if (m === 'image' || m === 'signature') {
      const src = m === 'image' ? S.pending : S.signature;
      if (!src) return setStatus(status, m === 'image' ? 'Choose an image first' : 'Create your signature first', 'error');
      const w = m === 'signature' ? 0.25 : 0.3;
      const h = w * (src.h / src.w) * (overlay.clientWidth / overlay.clientHeight);
      addItem({ type: 'image', image: src.key, url: src.url, x: clamp(p.x - w / 2, 0, 1 - w), y: clamp(p.y - h / 2, 0, Math.max(0, 1 - h)), w, h });
    } else if (m === 'rect' || m === 'whiteout') {
      const it = addItem({ type: m, x: p.x, y: p.y, w: 0, h: 0, color, stroke });
      drag(q => {
        Object.assign(it, { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w: Math.abs(q.x - p.x), h: Math.abs(q.y - p.y) });
        render();
      }, () => { if (it.w < 0.005 || it.h < 0.005) removeItem(it); });
    } else if (m === 'draw') {
      const it = addItem({ type: 'draw', points: [[p.x, p.y]], color, stroke });
      drag(q => { it.points.push([q.x, q.y]); render(); }, () => { if (it.points.length < 2) removeItem(it); });
    }
  });

  function itemEl(it) {
    const s = scale();
    const e = el('div', { class: `ed-item ed-${it.type}${S.sel === it ? ' sel' : ''}`, style: { left: pct(it.x), top: pct(it.y) } });
    const startMove = ev => {
      ev.preventDefault();
      ev.stopPropagation();
      S.sel = it;
      const start = rel(ev);
      const ox = it.x;
      const oy = it.y;
      drag(q => {
        it.x = clamp(ox + q.x - start.x, 0, 1 - (it.w || 0));
        it.y = clamp(oy + q.y - start.y, 0, 1 - (it.h || 0));
        e.style.left = pct(it.x);
        e.style.top = pct(it.y);
      });
    };
    if (it.type === 'replace') {
      Object.assign(e.style, { minWidth: pct(it.w), height: pct(it.h), transform: `rotate(${it.angle || 0}deg)`, transformOrigin: 'top left' });
      const txt = el('div', {
        class: 'ed-textbox', contenteditable: 'true', spellcheck: 'false',
        style: {
          fontSize: `${it.size * s}px`, color: it.color, fontFamily: FONT_CSS[it.font],
          fontWeight: it.bold ? '700' : '400', lineHeight: `${it.h * overlay.clientHeight}px`,
        },
      });
      txt.textContent = it.text;
      txt.addEventListener('input', () => { it.text = txt.innerText; });
      txt.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); txt.blur(); } });
      txt.addEventListener('paste', ev => { ev.preventDefault(); document.execCommand('insertText', false, ev.clipboardData.getData('text/plain').replace(/\s*\n\s*/g, ' ')); });
      txt.addEventListener('focus', () => { S.sel = it; e.classList.add('sel'); showProps(it); });
      txt.addEventListener('blur', () => { it.text = txt.innerText.replace(/\n/g, ' '); });
      e.append(txt);
      if (it._focus) { delete it._focus; requestAnimationFrame(() => txt.focus()); }
      e.append(el('button', { class: 'ed-del', title: 'Restore original text', onpointerdown: ev => ev.stopPropagation(), onclick: () => removeItem(it) }, '\u00d7'));
      return e;
    }
    if (it.type === 'text') {
      const txt = el('div', {
        class: 'ed-textbox', contenteditable: 'true', spellcheck: 'false',
        style: { fontSize: `${it.size * s}px`, color: it.color, fontFamily: FONT_CSS[it.font] },
      });
      txt.textContent = it.text;
      txt.addEventListener('input', () => { it.text = txt.innerText; });
      txt.addEventListener('paste', ev => { ev.preventDefault(); document.execCommand('insertText', false, ev.clipboardData.getData('text/plain')); });
      txt.addEventListener('focus', () => { S.sel = it; e.classList.add('sel'); showProps(it); });
      txt.addEventListener('blur', () => {
        it.text = txt.innerText.replace(/\n+$/, '');
        if (!it.text.trim()) { S.items = S.items.filter(i => i !== it); e.remove(); }
      });
      e.append(el('span', { class: 'ed-move', title: 'Drag to move', onpointerdown: startMove }), txt);
      if (it._focus) { delete it._focus; requestAnimationFrame(() => txt.focus()); }
    } else {
      Object.assign(e.style, { width: pct(it.w), height: pct(it.h) });
      if (it.type === 'image') e.append(el('img', { src: it.url, alt: '' }));
      if (it.type === 'rect') e.style.border = `${Math.max(1, it.stroke * s)}px solid ${it.color}`;
      e.addEventListener('pointerdown', ev => { if (ev.target === e || ev.target.tagName === 'IMG') startMove(ev); });
      const ratio = it.h / it.w;
      e.append(el('span', {
        class: 'ed-resize', title: 'Resize', onpointerdown: ev => {
          ev.preventDefault();
          ev.stopPropagation();
          drag(q => {
            it.w = clamp(q.x - it.x, 0.01, 1 - it.x);
            it.h = it.type === 'image' ? it.w * ratio : clamp(q.y - it.y, 0.005, 1 - it.y);
            if (it.type === 'image' && it.y + it.h > 1) { it.h = 1 - it.y; it.w = it.h / ratio; }
            e.style.width = pct(it.w);
            e.style.height = pct(it.h);
          });
        },
      }));
    }
    e.append(el('button', { class: 'ed-del', title: 'Delete', onpointerdown: ev => ev.stopPropagation(), onclick: () => removeItem(it) }, '\u00d7'));
    return e;
  }

  function render() {
    const s = scale();
    svg.replaceChildren();
    for (const it of S.items.filter(i => i.page === S.page && i.type === 'draw')) {
      const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      pl.setAttribute('points', it.points.map(([x, y]) => `${x},${y}`).join(' '));
      pl.setAttribute('fill', 'none');
      pl.setAttribute('stroke', it.color);
      pl.setAttribute('stroke-width', Math.max(1, it.stroke * s));
      pl.setAttribute('stroke-linecap', 'round');
      pl.setAttribute('stroke-linejoin', 'round');
      pl.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.append(pl);
    }
    const hotspots = [];
    const page = S.cache[S.page];
    if (S.mode === 'edittext' && page && page.lines) {
      const taken = new Set(S.items.filter(i => i.type === 'replace').map(i => i.lineId));
      page.lines.forEach((ln, idx) => {
        if (taken.has(`${S.page}:${idx}`)) return;
        hotspots.push(el('div', {
          class: 'ed-line', title: ln.text, 'data-idx': idx,
          style: { left: pct(ln.x), top: pct(ln.y), width: pct(ln.w), height: pct(ln.h), transform: `rotate(${ln.angle || 0}deg)`, transformOrigin: 'top left' },
        }));
      });
    }
    overlay.classList.toggle('editing-text', S.mode === 'edittext');
    overlay.replaceChildren(svg, ...hotspots, ...S.items.filter(i => i.page === S.page && i.type !== 'draw').map(itemEl));
  }

  new ResizeObserver(() => render()).observe(overlay);
  document.addEventListener('keydown', function onKey(e) {
    if (!document.body.contains(overlay)) return document.removeEventListener('keydown', onKey);
    if (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel && S.sel.type !== 'text') {
      e.preventDefault();
      removeItem(S.sel);
    }
  });

  saveBtn.addEventListener('click', async () => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const items = S.items
      .filter(i => i.type !== 'text' || i.text.trim())
      .map(({ url, _focus, ...rest }) => rest);
    if (!items.length) return setStatus(status, 'Add something to the page first', 'error');
    const fd = new FormData();
    fd.append('files', file);
    fd.append('items', JSON.stringify(items));
    for (const key of new Set(items.filter(i => i.type === 'image').map(i => i.image))) fd.append(key, S.images[key], `${key}.png`);
    saveBtn.disabled = true;
    setStatus(status, 'Saving your PDF...', 'busy');
    try {
      showResult(t, body, await runTool(t.id, fd));
    } catch (err) {
      setStatus(status, err.message, 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });

  setMode(S.mode);
  goto(0);
}

/* ------------------------------------------------------------------ signature pad */
function signaturePad(onReady) {
  const canvas = el('canvas', { class: 'sig-canvas', width: 600, height: 220 });
  const ctx = canvas.getContext('2d');
  const colorSel = el('select', {}, [['#000000', 'Black'], ['#1a3fa8', 'Blue'], ['#c0261f', 'Red']].map(([v, l]) => el('option', { value: v }, l)));
  const typed = el('input', { type: 'text', placeholder: 'Type your name' });
  const fontSel = el('select', {}, ['Segoe Script', 'Brush Script MT', 'Lucida Handwriting', 'Freestyle Script', 'cursive']
    .map(f => el('option', { value: f }, f)));
  const upload = el('input', { type: 'file', accept: IMG });
  const preview = el('img', { class: 'sig-preview', alt: 'Signature preview', hidden: true });
  let tab = 'draw';
  let drawing = false;

  const drawPane = el('div', {}, canvas, el('div', { class: 'sig-row' }, colorSel,
    el('button', { class: 'btn', type: 'button', onclick: () => ctx.clearRect(0, 0, canvas.width, canvas.height) }, 'Clear')));
  const typePane = el('div', { hidden: true }, typed, el('div', { class: 'sig-row' }, fontSel));
  const uploadPane = el('div', { hidden: true }, upload, el('small', {}, 'Use a PNG with transparent background for best results'));
  const panes = { draw: drawPane, type: typePane, upload: uploadPane };
  const tabBtns = Object.keys(panes).map(k => el('button', {
    class: 'btn' + (k === tab ? ' active' : ''), type: 'button', onclick: () => {
      tab = k;
      tabBtns.forEach(b => b.classList.toggle('active', b.textContent.toLowerCase() === k));
      Object.entries(panes).forEach(([n, p]) => { p.hidden = n !== k; });
    },
  }, k[0].toUpperCase() + k.slice(1)));

  const pos = e => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height];
  };
  canvas.addEventListener('pointerdown', e => {
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    ctx.strokeStyle = colorSel.value;
    ctx.lineWidth = 4;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(...pos(e));
  });
  canvas.addEventListener('pointermove', e => { if (drawing) { ctx.lineTo(...pos(e)); ctx.stroke(); } });
  canvas.addEventListener('pointerup', () => { drawing = false; });

  async function build() {
    let source;
    if (tab === 'draw') source = canvas;
    else if (tab === 'type') {
      const name = typed.value.trim();
      if (!name) return;
      source = document.createElement('canvas');
      const c = source.getContext('2d');
      const font = `72px "${fontSel.value}", cursive`;
      c.font = font;
      source.width = Math.ceil(c.measureText(name).width) + 40;
      source.height = 120;
      c.font = font;
      c.fillStyle = colorSel.value;
      c.textBaseline = 'middle';
      c.fillText(name, 20, 60);
    } else {
      const f = upload.files[0];
      if (!f) return;
      source = await createImageBitmap(f);
      const c = document.createElement('canvas');
      c.width = source.width;
      c.height = source.height;
      c.getContext('2d').drawImage(source, 0, 0);
      source = c;
    }
    const trimmed = trimCanvas(source);
    if (!trimmed) return;
    trimmed.toBlob(blob => {
      preview.src = URL.createObjectURL(blob);
      preview.hidden = false;
      onReady(blob);
    }, 'image/png');
  }

  return el('div', {},
    el('h4', {}, 'Your signature'),
    el('div', { class: 'sig-tabs' }, tabBtns),
    drawPane, typePane, uploadPane,
    el('button', { class: 'btn btn-block', type: 'button', style: { marginTop: '8px' }, onclick: build }, 'Use this signature'),
    preview);
}

function trimCanvas(c) {
  const { width: w, height: h } = c;
  const data = c.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 9;
  out.height = y1 - y0 + 9;
  out.getContext('2d').drawImage(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 4, 4, x1 - x0 + 1, y1 - y0 + 1);
  return out;
}
