/* ── Toast notifications ── */
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.25s ease forwards';
    setTimeout(() => toast.remove(), 260);
  }, duration);
}

let currentStep = 0;
let currentToc = null;
let currentOrder = null;
let recipientPhoto = null;
let storyUpload = null;
let tocAttempts = 0;
let coverAttempts = 0;
let coverVariant = 1;
let subtotalCents = 6900;
let discount = { code: '', discountCents: 0, finalCents: subtotalCents };

const PRODUCT_OPTIONS = {
  paperback: { label: 'Paperback', priceCents: 6900, description: 'Custom 6 x 9 paperback gift book' },
  hardcover: { label: 'Hardcover', priceCents: 8900, description: 'Custom 6 x 9 hardcover keepsake gift book' }
};

const steps = [...document.querySelectorAll('.form-step')];
const progressItems = [...document.querySelectorAll('#progressList li')];
const form = document.getElementById('bookForm');
const nextBtn = document.getElementById('nextBtn');
const backBtn = document.getElementById('backBtn');
const generateBtn = document.getElementById('generateBtn');
const regenerateTocBtn = document.getElementById('regenerateTocBtn');
const regenerateCoverBtn = document.getElementById('regenerateCoverBtn');
const preview = document.getElementById('preview');
const tocEditor = document.getElementById('tocEditor');
const finalCoverFrame = document.getElementById('finalCoverFrame');
const tocStatus = document.getElementById('tocStatus');
const tocEditStatus = document.getElementById('tocEditStatus');
const coverStatus = document.getElementById('coverStatus');
const checkoutStatus = document.getElementById('checkoutStatus');
const photoInput = document.getElementById('recipientPhoto');
const storyFileInput = document.getElementById('storyFile');
const uploadStatus = document.getElementById('uploadStatus');
const storyUploadStatus = document.getElementById('storyUploadStatus');
const saveTocEditsBtn = document.getElementById('saveTocEditsBtn');

function money(cents) { return `$${(cents / 100).toFixed(2)}`; }
function selectedBinding() { return new FormData(form).get('binding') || 'paperback'; }
function selectedProduct() { const binding = selectedBinding(); return { binding, quantity: 1, shippingLevel: 'MAIL', ...PRODUCT_OPTIONS[binding] }; }

function numberField(name, fallback) {
  const data = new FormData(form);
  const value = Number(data.get(name));
  return Number.isFinite(value) ? value : fallback;
}

function collectCoverSettings() {
  const data = new FormData(form);
  return {
    paletteMode: data.get('coverPaletteMode') || 'auto',
    primaryColor: data.get('coverPrimaryColor') || '#F8D7DA',
    secondaryColor: data.get('coverSecondaryColor') || '#FFF1E6',
    accentColor: data.get('coverAccentColor') || '#5C4B51',
    photoScale: numberField('coverPhotoScale', 100) / 100,
    photoX: numberField('coverPhotoX', 50),
    photoY: numberField('coverPhotoY', 38),
    titleX: numberField('coverTitleX', 50),
    titleY: numberField('coverTitleY', 70),
    titleAlign: data.get('coverTitleAlign') || 'center',
    artDensity: numberField('coverArtDensity', 55),
    aiMode: data.get('aiCoverMode') || 'local-vector'
  };
}

function updateCoverControlLabels() {
  const map = [
    ['coverPhotoScale', 'photoScaleValue', value => `${value}%`],
    ['coverPhotoX', 'photoXValue', value => value],
    ['coverPhotoY', 'photoYValue', value => value],
    ['coverTitleX', 'titleXValue', value => value],
    ['coverTitleY', 'titleYValue', value => value],
    ['coverArtDensity', 'artDensityValue', value => value]
  ];
  map.forEach(([name, id, format]) => {
    const input = form.querySelector(`[name="${name}"]`);
    const output = document.getElementById(id);
    if (input && output) output.textContent = format(input.value);
  });
}

let coverRefreshTimer = null;
function scheduleCoverRefresh() {
  updateCoverControlLabels();
  currentOrder = null;
  if (!recipientPhoto || !currentToc) return;
  clearTimeout(coverRefreshTimer);
  coverRefreshTimer = setTimeout(() => generateCoverPreview(false).catch(e => coverStatus.textContent = e.message), 450);
}

function setStep(index) {
  currentStep = Math.max(0, Math.min(index, steps.length - 1));
  steps.forEach((step, i) => step.classList.toggle('active', i === currentStep));
  progressItems.forEach((item, i) => item.classList.toggle('active', i === currentStep));
  backBtn.style.visibility = currentStep === 0 ? 'hidden' : 'visible';
  nextBtn.style.display = currentStep === steps.length - 1 ? 'none' : 'inline-flex';
}

function collectInput() {
  const data = new FormData(form);
  return {
    genre: data.get('genre'),
    recipientName: data.get('recipientName'),
    relationship: data.get('relationship'),
    occasion: data.get('occasion'),
    tone: data.get('tone'),
    customTitle: data.get('customTitle') || document.getElementById('editableTitle')?.value || '',
    customSubtitle: data.get('customSubtitle') || document.getElementById('editableSubtitle')?.value || '',
    coverTheme: data.get('coverTheme') || 'soft-keepsake',
    coverSettings: collectCoverSettings(),
    recipientPhoto,
    storyUpload,
    lifeNotes: data.get('lifeNotes'),
    answers: [data.get('answer1'), data.get('answer2'), data.get('answer3'), data.get('answer4'), data.get('lifeNotes'), storyUpload?.extractedText].filter(Boolean)
  };
}
function collectCustomer() { const data = new FormData(form); return { email: data.get('email'), name: data.get('shipName'), phone: data.get('phone'), linkedinUrl: data.get('linkedinUrl') || '' }; }
function collectShippingAddress() {
  const data = new FormData(form);
  return { name: data.get('shipName') || data.get('recipientName') || 'Test Recipient', street1: data.get('street1') || '123 Test Street', city: data.get('city') || 'Austin', state_code: data.get('state') || 'TX', postcode: data.get('postcode') || '78701', country_code: data.get('country') || 'US', phone_number: data.get('phone') || '+15551234567', email: data.get('email') || 'customer@example.com' };
}
function collectFuturePreferences() {
  const data = new FormData(form);
  return { wantsPromotion: data.get('futurePromote') === 'yes', wantsGhostwriting: data.get('futureGhostwrite') === 'yes', wantsPublishing: data.get('futurePublish') === 'yes' };
}

function updateCoverText(title, subtitle) {
  const fallbackName = new FormData(form).get('recipientName') || 'Someone Special';
  const coverTitle = title || `${fallbackName}: A Story Made Just for Them`;
  const coverSubtitle = subtitle || 'Custom keepsake edition';
  ['coverTitle', 'miniCoverTitle'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = coverTitle; });
  ['coverSubtitle', 'miniCoverSubtitle'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = coverSubtitle; });
}
function updateCoverImage(src) {
  ['coverImagePreview', 'heroCoverImage'].forEach(id => { const img = document.getElementById(id); if (!img) return; img.src = src || ''; img.parentElement.classList.toggle('has-image', Boolean(src)); });
}

async function browserDetectFace(file) {
  // Browser FaceDetector is experimental and often rejects real human photos.
  // For local testing, this is intentionally non-blocking. Production strict
  // validation should happen on the server with AWS Rekognition.
  if (!('FaceDetector' in window)) {
    return { supported: false, detected: false, skipped: true, message: 'Browser face detection is not available. The photo will still be accepted for local testing.' };
  }
  try {
    const detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 3 });
    const bitmap = await createImageBitmap(file);
    const faces = await detector.detect(bitmap);
    return { supported: true, detected: faces.length >= 1, count: faces.length, message: faces.length >= 1 ? 'A face was detected.' : 'Browser could not confirm a face. The photo will still be accepted for local testing.' };
  } catch {
    return { supported: false, detected: false, skipped: true, message: 'Browser face detection failed. The photo will still be accepted for local testing.' };
  }
}

async function uploadRecipientPhoto(file) {
  if (!file) return;
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const allowedExt = ['.jpg', '.jpeg', '.png', '.webp'];
  const fileExt = `.${(file.name || '').split('.').pop().toLowerCase()}`;
  if (!allowed.includes(file.type) && !allowedExt.includes(fileExt)) throw new Error('Please upload a JPG, PNG, or WebP image.');
  if (file.size > 6 * 1024 * 1024) throw new Error('Please upload an image smaller than 6MB.');
  uploadStatus.textContent = 'Preparing photo preview...';
  const faceResult = await browserDetectFace(file);
  uploadStatus.textContent = faceResult.detected ? 'Photo accepted. Uploading...' : `${faceResult.message} Uploading photo...`;
  const body = new FormData();
  body.append('recipientPhoto', file);
  body.append('browserFaceDetected', faceResult.detected ? 'true' : (faceResult.skipped ? 'skipped' : 'unconfirmed'));
  const response = await fetch('/api/uploads/recipient-photo', { method: 'POST', body });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Photo upload failed.');
  recipientPhoto = data.file;
  updateCoverImage(data.file.publicUrl);
  uploadStatus.textContent = `Photo accepted. ${data.file.faceCheck?.message || ''}`;
  currentOrder = null;
  showToast('Photo uploaded successfully.', 'success');
  await generateCoverPreview().catch(e => { coverStatus.textContent = e.message; showToast(e.message, 'error'); });
}

async function uploadStoryFile(file) {
  if (!file) return;
  if (file.size > 12 * 1024 * 1024) throw new Error('Please upload a file smaller than 12MB.');
  storyUploadStatus.textContent = 'Uploading story or resume...';
  const body = new FormData();
  body.append('storyFile', file);
  const response = await fetch('/api/uploads/story-file', { method: 'POST', body });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Story/resume upload failed.');
  storyUpload = data.file;
  storyUploadStatus.textContent = data.file.extractedText ? 'File uploaded and readable text was extracted for TOC generation.' : 'File uploaded and will be attached to the order for review. Paste text notes too for better local TOC generation.';
  currentToc = null;
  currentOrder = null;
}

function renderToc(toc) {
  updateCoverText(toc.title, toc.subtitle);
  preview.innerHTML = `<div class="toc-card"><h3>${toc.title}</h3><p>${toc.structureNote}</p></div>${toc.chapters.map(ch => `<article class="toc-card"><h4>Chapter ${ch.chapter}: ${ch.title} <span>${ch.pages}</span></h4><p>${ch.summary}</p></article>`).join('')}`;
  renderTocEditor(toc);
}
function renderTocEditor(toc) {
  if (!tocEditor) return;
  document.getElementById('editableTitle').value = toc.title || '';
  document.getElementById('editableSubtitle').value = toc.subtitle || '';
  tocEditor.innerHTML = (toc.chapters || []).map((ch, index) => `
    <article class="toc-card edit-card" data-index="${index}">
      <label>Chapter ${ch.chapter} title<input class="chapter-title" value="${escapeHtml(ch.title)}" /></label>
      <label>Summary<textarea class="chapter-summary">${escapeHtml(ch.summary)}</textarea></label>
      <small>${ch.pages}</small>
    </article>`).join('');
}
function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function syncTocFromEditor() {
  if (!currentToc) return;
  currentToc.title = document.getElementById('editableTitle').value.trim() || currentToc.title;
  currentToc.subtitle = document.getElementById('editableSubtitle').value.trim() || currentToc.subtitle;
  [...tocEditor.querySelectorAll('.edit-card')].forEach(card => {
    const i = Number(card.dataset.index);
    currentToc.chapters[i].title = card.querySelector('.chapter-title').value.trim() || currentToc.chapters[i].title;
    currentToc.chapters[i].summary = card.querySelector('.chapter-summary').value.trim() || currentToc.chapters[i].summary;
  });
  updateCoverText(currentToc.title, currentToc.subtitle);
  renderToc(currentToc);
  tocEditStatus.textContent = 'Title and table of contents edits saved.';
  currentOrder = null;
}

async function generateToc(regenerate = false) {
  if (!regenerate && currentToc) return currentToc;
  if (tocAttempts >= 3) { tocStatus.textContent = 'You have used all 3 table of contents generations.'; return currentToc; }
  tocAttempts += 1;
  tocStatus.textContent = `Generating table of contents... Attempt ${tocAttempts} of 3.`;
  const response = await fetch('/api/generate/toc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: collectInput(), attempt: tocAttempts }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not generate table of contents.');
  currentToc = data.toc;
  renderToc(currentToc);
  tocStatus.textContent = `Table of contents generated. Remaining regenerations: ${data.attemptsRemaining}. You can now edit the title and chapters.`;
  showToast('Table of contents generated.', 'success');
  regenerateTocBtn.disabled = tocAttempts >= 3;
  currentOrder = null;
  await generateCoverPreview().catch(() => {});
  return currentToc;
}

async function generateCoverPreview(regenerate = false) {
  if (!recipientPhoto) { coverStatus.textContent = 'Upload an approved human portrait to generate the final wrap cover.'; return; }
  if (!currentToc) await generateToc(false);
  syncTocFromEditor();
  if (regenerate) { coverAttempts += 1; coverVariant += 1; } else if (coverAttempts === 0) { coverAttempts = 1; }
  coverStatus.textContent = `Generating full front, spine, and back cover. Variant ${coverVariant}.`;
  const response = await fetch('/api/generate/cover-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: collectInput(), toc: currentToc, product: selectedProduct(), coverVariant, coverTheme: new FormData(form).get('coverTheme'), coverSettings: collectCoverSettings() }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not generate cover.');
  finalCoverFrame.src = data.cover.coverPreviewUrl;
  coverStatus.textContent = `Cover generated. Source: ${data.cover.specs.source}. Spine: ${Number(data.cover.specs.spineWidthIn).toFixed(3)} in.`;
  return data.cover;
}

function resetDiscount() { discount = { code: '', discountCents: 0, finalCents: subtotalCents }; const message = document.getElementById('discountMessage'); if (message) message.textContent = ''; }
function updatePrice() {
  const product = selectedProduct(); subtotalCents = product.priceCents;
  if (!discount.code) discount.finalCents = subtotalCents;
  document.getElementById('subtotal').textContent = money(subtotalCents);
  document.getElementById('total').textContent = money(discount.finalCents ?? subtotalCents);
  document.getElementById('selectedProductText').textContent = product.description;
}
async function applyDiscount() {
  const code = document.getElementById('discountCode').value;
  const response = await fetch('/api/discounts/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, subtotalCents }) });
  const data = await response.json();
  discount = data.valid ? data : { code: '', discountCents: 0, finalCents: subtotalCents };
  document.getElementById('discountMessage').textContent = data.message;
  updatePrice();
}
async function createOrder() {
  if (!currentToc) await generateToc(false);
  syncTocFromEditor();
  if (!recipientPhoto) throw new Error('Please upload an approved human recipient photo before checkout.');
  const _fd = new FormData(form);
  if (!_fd.get('email')) throw new Error('Please enter your email address.');
  if (!_fd.get('shipName')) throw new Error('Please enter your full name.');
  if (!_fd.get('phone')) throw new Error('Please enter your phone number.');
  if (!document.getElementById('termsAccepted').checked) throw new Error('Please accept the Terms and Conditions and Privacy Policy before checkout.');
  checkoutStatus.textContent = 'Creating production-style order files...';
  const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: collectInput(), toc: currentToc, customer: collectCustomer(), shippingAddress: collectShippingAddress(), futurePreferences: collectFuturePreferences(), termsAccepted: document.getElementById('termsAccepted').checked, discountCode: document.getElementById('discountCode').value, subtotalCents, product: selectedProduct(), tocRegenerationCount: tocAttempts, coverRegenerationCount: coverAttempts, coverVariant, coverTheme: new FormData(form).get('coverTheme'), coverSettings: collectCoverSettings() }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not create order.');
  currentOrder = data.order;
  finalCoverFrame.src = data.order.files.coverPreviewUrl;
  return currentOrder;
}
async function checkout() {
  try {
    const order = currentOrder || await createOrder();
    checkoutStatus.textContent = 'Opening checkout...';
    showToast('Order created. Opening checkout…', 'info');
    const response = await fetch('/api/checkout/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.id, termsAccepted: document.getElementById('termsAccepted').checked }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not create checkout.');
    window.location.href = data.redirectUrl;
  } catch (error) {
    checkoutStatus.textContent = error.message;
    showToast(error.message, 'error');
  }
}
async function createLuluJob() {
  try { const order = currentOrder || await createOrder(); checkoutStatus.textContent = 'Creating Lulu sandbox print job or mock...'; const response = await fetch('/api/lulu/print-job', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.id }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not create Lulu job.'); currentOrder = data.order; checkoutStatus.textContent = data.lulu.mock ? 'Lulu mock created. Add sandbox credentials and a public HTTPS file URL for real tests.' : 'Lulu sandbox print job created.'; }
  catch (error) { checkoutStatus.textContent = error.message; }
}

nextBtn.addEventListener('click', () => setStep(currentStep + 1));
backBtn.addEventListener('click', () => setStep(currentStep - 1));
generateBtn.addEventListener('click', () => generateToc(true).catch(e => tocStatus.textContent = e.message));
regenerateTocBtn.addEventListener('click', () => generateToc(true).catch(e => tocStatus.textContent = e.message));
regenerateCoverBtn.addEventListener('click', () => generateCoverPreview(true).catch(e => coverStatus.textContent = e.message));
saveTocEditsBtn.addEventListener('click', syncTocFromEditor);
document.getElementById('applyDiscount').addEventListener('click', applyDiscount);
document.getElementById('checkoutBtn').addEventListener('click', checkout);
document.getElementById('luluBtn').addEventListener('click', createLuluJob);
photoInput.addEventListener('change', event => uploadRecipientPhoto(event.target.files[0]).catch(e => uploadStatus.textContent = e.message));
storyFileInput.addEventListener('change', event => uploadStoryFile(event.target.files[0]).catch(e => storyUploadStatus.textContent = e.message));
form.addEventListener('input', event => {
  currentOrder = null;
  const titleAffectingFields = ['genre', 'recipientName', 'relationship', 'occasion', 'tone', 'answer1', 'answer2', 'answer3', 'answer4', 'lifeNotes', 'customTitle', 'customSubtitle'];
  if (titleAffectingFields.includes(event.target.name)) {
    currentToc = null;
    regenerateTocBtn.disabled = tocAttempts >= 3;
    updateCoverText(null, null);
    tocStatus.textContent = tocAttempts > 0 ? 'Book details changed. Generate the table of contents again to create an updated custom title.' : 'You can generate or regenerate the table of contents up to 3 times.';
  }
  if (event.target.name === 'binding') { resetDiscount(); updatePrice(); generateCoverPreview().catch(() => {}); }
  if (event.target.classList && event.target.classList.contains('cover-control')) { scheduleCoverRefresh(); }
});
setStep(0); updatePrice(); updateCoverText(); updateCoverControlLabels();
