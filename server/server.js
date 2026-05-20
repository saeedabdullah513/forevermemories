require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const Stripe = require('stripe');
const { z } = require('zod');
const { generateToc } = require('./services/bookGenerator');
const { readJson, writeJson } = require('./services/storage');
const { validateDiscount, redeemDiscount, listDiscounts, createDiscount, updateDiscount } = require('./services/discounts');
const { createInteriorPdf, createCoverPdf } = require('./services/pdfBuilder');
const { validateHumanFace } = require('./services/faceDetection');
const { luluRequest, buildLineItem, getCoverDimensions, validateCover, validateInterior } = require('./services/lulu');
const { sendOrderNotification } = require('./services/email');
const { generateCoverArtBrief } = require('./services/aiCoverArt');
const { loginAdmin, requireAdmin, updateAdminCredentials, getAdminProfile } = require('./services/adminAuth');

const app = express();
const port = process.env.PORT || 4242;
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const PRODUCT_OPTIONS = {
  paperback: {
    binding: 'paperback', label: 'Paperback', description: 'Custom 6 x 9 paperback gift book',
    priceCents: Number(process.env.PAPERBACK_PRICE_CENTS || 6900),
    podPackageId: process.env.LULU_PAPERBACK_POD_PACKAGE_ID || '0600X0900.BW.STD.PB.060UW444.MXX'
  },
  hardcover: {
    binding: 'hardcover', label: 'Hardcover', description: 'Custom 6 x 9 hardcover keepsake gift book',
    priceCents: Number(process.env.HARDCOVER_PRICE_CENTS || 8900),
    podPackageId: process.env.LULU_HARDCOVER_POD_PACKAGE_ID || '0600X0900.BW.STD.CW.060UW444.MXX'
  }
};

const photoUpload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => cb(null, `${uuidv4()}-recipient-photo${path.extname(file.originalname || '.jpg').toLowerCase()}`)
  }),
  limits: { fileSize: Number(process.env.MAX_IMAGE_UPLOAD_MB || 6) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMime = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/octet-stream'];
    const allowedExt = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname || '').toLowerCase();
    const ok = allowedMime.includes(file.mimetype) || allowedExt.includes(ext);
    cb(ok ? null : new Error('Please upload a JPG, PNG, or WebP image.'), ok);
  }
});

const storyUpload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => cb(null, `${uuidv4()}-story-upload${path.extname(file.originalname || '.txt').toLowerCase()}`)
  }),
  limits: { fileSize: Number(process.env.MAX_STORY_UPLOAD_MB || 12) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['text/plain', 'text/markdown', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedExt = ['.txt', '.md', '.pdf', '.doc', '.docx'];
    const ok = allowed.includes(file.mimetype) || allowedExt.includes(ext);
    cb(ok ? null : new Error('Please upload a TXT, MD, PDF, DOC, or DOCX file.'), ok);
  }
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'client')));
app.use('/uploads', express.static(uploadsDir));

const bookInputSchema = z.object({
  genre: z.string().min(2), recipientName: z.string().min(1), relationship: z.string().optional(), occasion: z.string().optional(), tone: z.string().optional(),
  customTitle: z.string().optional(), customSubtitle: z.string().optional(), coverTheme: z.string().optional(),
  coverSettings: z.any().optional(), lifeNotes: z.string().optional(),
  recipientPhoto: z.object({ fileName: z.string().optional(), publicUrl: z.string().optional(), originalName: z.string().optional(), mimetype: z.string().optional(), faceCheck: z.any().optional() }).nullable().optional(),
  storyUpload: z.object({ fileName: z.string().optional(), publicUrl: z.string().optional(), originalName: z.string().optional(), mimetype: z.string().optional(), extractedText: z.string().optional() }).nullable().optional(),
  answers: z.array(z.string()).optional()
});

function extractReadableText(filePath, mimetype) {
  const ext = path.extname(filePath).toLowerCase();
  if (mimetype === 'text/plain' || mimetype === 'text/markdown' || ext === '.txt' || ext === '.md') {
    return fs.readFileSync(filePath, 'utf8').slice(0, 12000);
  }
  return '';
}

function appUrl() { return process.env.APP_URL || `http://localhost:${port}`; }
function getProduct(binding) { return PRODUCT_OPTIONS[binding] || PRODUCT_OPTIONS.paperback; }
function publicBase() { return process.env.PUBLIC_FILE_BASE_URL || `${appUrl()}/uploads`; }
function getOrders() { return readJson('orders.json', []); }
function saveOrders(orders) { writeJson('orders.json', orders); }
function findOrder(orderId) { return getOrders().find(o => o.id === orderId); }
function updateOrder(order) { const orders = getOrders(); const i = orders.findIndex(o => o.id === order.id); if (i >= 0) orders[i] = order; else orders.push(order); saveOrders(orders); return order; }

function deleteFile(filePath) { try { fs.unlinkSync(filePath); } catch {} }

function cleanupOrderFiles(order) {
  if (order.files?.interiorFileName) deleteFile(path.join(uploadsDir, order.files.interiorFileName));
  if (order.files?.coverFileName) deleteFile(path.join(uploadsDir, order.files.coverFileName));
  if (order.input?.recipientPhoto?.fileName) deleteFile(path.join(uploadsDir, order.input.recipientPhoto.fileName));
  if (order.input?.storyUpload?.fileName) deleteFile(path.join(uploadsDir, order.input.storyUpload.fileName));
}

function cleanupPreviewFiles() {
  try {
    fs.readdirSync(uploadsDir).filter(f => f.startsWith('preview-')).forEach(f => deleteFile(path.join(uploadsDir, f)));
  } catch {}
}

async function generateProductionFiles(order) {
  const interior = await createInteriorPdf(order);
  if (!order.pageCount) order.pageCount = Number(process.env.LULU_DEFAULT_PAGE_COUNT || 160);
  let luluDims = null;
  try {
    const dims = await getCoverDimensions({ podPackageId: order.product.podPackageId, pageCount: order.pageCount });
    if (!dims.mock) luluDims = dims;
    order.luluCoverDimensions = dims;
  } catch (error) {
    order.luluCoverDimensionsError = error.message;
  }
  const cover = await createCoverPdf(order, luluDims);
  order.files = {
    interiorUrl: `${publicBase()}/${interior.fileName}`,
    interiorFileName: interior.fileName,
    coverUrl: `${publicBase()}/${cover.fileName}`,
    coverFileName: cover.fileName,
    coverPreviewUrl: `/uploads/${cover.fileName}`,
    recipientPhotoUrl: order.input.recipientPhoto?.publicUrl || null
  };
  order.coverSpecs = cover.specs;
  order.coverSettings = cover.coverSettings || order.coverSettings || {};
  return order;
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, mode: process.env.NODE_ENV || 'development', stripe: !!stripe, lulu: !!process.env.LULU_BASIC_AUTH, faceDetectionProvider: process.env.FACE_DETECTION_PROVIDER || 'local-preview', products: PRODUCT_OPTIONS });
});

app.post('/api/uploads/recipient-photo', photoUpload.single('recipientPhoto'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded.' });
    // Face detection temporarily disabled for local testing — accept uploads as-is.
    res.json({ file: { fileName: req.file.filename, originalName: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size, publicUrl: `/uploads/${req.file.filename}` } });
  } catch (error) { next(error); }
});

app.post('/api/uploads/story-file', storyUpload.single('storyFile'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No story or resume file uploaded.' });
    const extractedText = extractReadableText(req.file.path, req.file.mimetype);
    res.json({ file: { fileName: req.file.filename, originalName: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size, publicUrl: `/uploads/${req.file.filename}`, extractedText } });
  } catch (error) { next(error); }
});

app.post('/api/generate/toc', async (req, res, next) => {
  try {
    const input = bookInputSchema.parse(req.body.input || req.body);
    const attempt = Number(req.body.attempt || 1);
    if (attempt > 3) return res.status(400).json({ error: 'You can regenerate the table of contents up to 3 times.' });
    const toc = generateToc(input, attempt);
    res.json({ toc, attemptsRemaining: Math.max(0, 3 - attempt) });
  } catch (error) { next(error); }
});

app.post('/api/generate/cover-preview', async (req, res, next) => {
  try {
    const input = bookInputSchema.parse(req.body.input || {});
    const product = getProduct(req.body.product?.binding);
    const coverSettings = req.body.coverSettings || input.coverSettings || {};
    const order = {
      id: `preview-${uuidv4()}`,
      status: 'COVER_PREVIEW',
      input,
      toc: req.body.toc || { title: `${input.recipientName}: A Story Made Just for Them`, subtitle: `${input.genre} keepsake edition` },
      product,
      pageCount: Number(process.env.LULU_DEFAULT_PAGE_COUNT || 160),
      coverVariant: Number(req.body.coverVariant || 1),
      coverTheme: req.body.coverTheme || input.coverTheme || 'soft-keepsake',
      coverSettings,
      backCoverCopy: req.body.backCoverCopy
    };
    order.aiCover = await generateCoverArtBrief({ input, toc: order.toc, coverSettings, coverVariant: order.coverVariant });
    await generateProductionFiles(order);
    res.json({
      cover: {
        coverPreviewUrl: order.files.coverPreviewUrl,
        coverUrl: order.files.coverUrl,
        specs: order.coverSpecs,
        settings: order.coverSettings,
        variant: order.coverVariant,
        aiCover: order.aiCover
      },
      orderPreview: order
    });
    cleanupPreviewFiles();
  } catch (error) { next(error); }
});

app.post('/api/discounts/validate', (req, res) => {
  const subtotalCents = Number(req.body.subtotalCents || PRODUCT_OPTIONS.paperback.priceCents);
  res.json(validateDiscount(req.body.code, subtotalCents));
});

app.post('/api/orders', async (req, res, next) => {
  try {
    const input = bookInputSchema.parse(req.body.input || {});
    if (!input.recipientPhoto?.publicUrl) return res.status(400).json({ error: 'Please upload and approve a human recipient photo before checkout.' });
    const selectedProduct = getProduct(req.body.product?.binding);
    const coverSettings = req.body.coverSettings || input.coverSettings || {};
    const order = {
      id: uuidv4(), status: 'DRAFT', createdAt: new Date().toISOString(), input, toc: req.body.toc,
      tocRegenerationCount: Number(req.body.tocRegenerationCount || 1), coverRegenerationCount: Number(req.body.coverRegenerationCount || 1), coverVariant: Number(req.body.coverVariant || 1), coverTheme: req.body.coverTheme || input.coverTheme || 'soft-keepsake', coverSettings,
      product: { ...selectedProduct, quantity: Number(req.body.product?.quantity || 1), shippingLevel: req.body.product?.shippingLevel || 'MAIL' },
      customer: req.body.customer || {}, shippingAddress: req.body.shippingAddress || {}, discountCode: req.body.discountCode || '', subtotalCents: selectedProduct.priceCents,
      futurePreferences: req.body.futurePreferences || {}, termsAccepted: req.body.termsAccepted === true, backCoverCopy: req.body.backCoverCopy || undefined, pageCount: Number(process.env.LULU_DEFAULT_PAGE_COUNT || 160)
    };
    const discount = order.discountCode ? validateDiscount(order.discountCode, order.subtotalCents) : { valid: true, discountCents: 0, finalCents: order.subtotalCents };
    order.discountCents = discount.valid ? discount.discountCents : 0;
    order.totalCents = Math.max(0, order.subtotalCents - order.discountCents);
    order.aiCover = await generateCoverArtBrief({ input, toc: order.toc, coverSettings, coverVariant: order.coverVariant });
    cleanupPreviewFiles();
    await generateProductionFiles(order);
    try {
      order.notification = await sendOrderNotification(order);
    } catch (emailErr) {
      console.error('[email] Failed to send order notification:', emailErr.message);
      order.notification = { sent: false, error: emailErr.message };
    }
    cleanupOrderFiles(order);
    updateOrder(order);
    res.json({ order });
  } catch (error) { next(error); }
});

app.get('/api/orders/:id', (req, res) => {
  const order = findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({ order });
});

app.post('/api/orders/:id/regenerate-cover', async (req, res, next) => {
  try {
    const order = findOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    order.coverRegenerationCount = Number(order.coverRegenerationCount || 1) + 1;
    order.coverVariant = ((Number(order.coverVariant || 1)) % 9) + 1;
    await generateProductionFiles(order);
    updateOrder(order);
    res.json({ order });
  } catch (error) { next(error); }
});

app.post('/api/checkout/create', async (req, res, next) => {
  try {
    const { orderId } = req.body;
    const orders = getOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!order.termsAccepted && req.body.termsAccepted !== true) return res.status(400).json({ error: 'Please accept the Terms and Conditions and Privacy Policy before checkout.' });
    order.termsAccepted = true;
    if (order.discountCode && order.discountCents > 0) redeemDiscount(order.discountCode);
    if (order.totalCents === 0) {
      order.status = 'PAID_FREE_DISCOUNT'; order.paidAt = new Date().toISOString(); saveOrders(orders);
      return res.json({ mode: 'free', redirectUrl: `/success.html?order=${order.id}` });
    }
    if (!stripe) {
      order.status = 'MOCK_PAID'; order.paidAt = new Date().toISOString(); saveOrders(orders);
      return res.json({ mode: 'mock', redirectUrl: `/success.html?order=${order.id}` });
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', customer_email: order.customer?.email,
      success_url: `${appUrl()}/success.html?order=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/?canceled=true`, metadata: { orderId: order.id, binding: order.product?.binding },
      line_items: [{ quantity: 1, price_data: { currency: process.env.CURRENCY || 'usd', unit_amount: order.totalCents, product_data: { name: `${order.toc?.title || 'Custom Gift Book'} - ${order.product?.label || 'Paperback'}` } } }]
    });
    order.status = 'CHECKOUT_CREATED'; order.stripeSessionId = session.id; saveOrders(orders);
    res.json({ mode: 'stripe', redirectUrl: session.url });
  } catch (error) { next(error); }
});

app.post('/api/lulu/validate-files', async (req, res, next) => {
  try {
    const order = findOrder(req.body.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const interior = await validateInterior({ sourceUrl: order.files.interiorUrl, podPackageId: order.product.podPackageId });
    const cover = await validateCover({ sourceUrl: order.files.coverUrl, podPackageId: order.product.podPackageId, pageCount: order.pageCount });
    order.luluValidation = { interior, cover, checkedAt: new Date().toISOString() };
    updateOrder(order);
    res.json({ order, validation: order.luluValidation });
  } catch (error) { next(error); }
});

app.post('/api/lulu/shipping-options', async (req, res, next) => {
  try {
    const product = getProduct(req.body.binding);
    const payload = { currency: (process.env.CURRENCY || 'usd').toUpperCase(), line_items: [buildLineItem({ quantity: req.body.quantity || 1, pageCount: req.body.pageCount || 160, podPackageId: product.podPackageId })], shipping_address: req.body.shippingAddress };
    res.json(await luluRequest('/shipping-options/', payload));
  } catch (error) { next(error); }
});

app.post('/api/lulu/cost', async (req, res, next) => {
  try {
    const product = getProduct(req.body.binding);
    const payload = { line_items: [buildLineItem({ quantity: req.body.quantity || 1, pageCount: req.body.pageCount || 160, podPackageId: product.podPackageId })], shipping_address: req.body.shippingAddress };
    res.json(await luluRequest('/print-job-cost-calculations/', payload));
  } catch (error) { next(error); }
});

app.post('/api/lulu/print-job', async (req, res, next) => {
  try {
    const order = findOrder(req.body.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const payload = {
      external_id: order.id, contact_email: process.env.LULU_CONTACT_EMAIL || order.customer?.email,
      shipping_level: order.product?.shippingLevel || process.env.LULU_DEFAULT_SHIPPING_LEVEL || 'MAIL', shipping_address: order.shippingAddress,
      line_items: [buildLineItem({ quantity: order.product?.quantity || 1, pageCount: order.pageCount || 160, podPackageId: order.product?.podPackageId, title: order.toc?.title, interiorUrl: order.files?.interiorUrl, coverUrl: order.files?.coverUrl, externalId: order.id })]
    };
    const lulu = await luluRequest('/print-jobs/', payload);
    order.lulu = lulu; order.status = lulu.mock ? 'LULU_MOCK_CREATED' : 'LULU_SANDBOX_PRINT_JOB_CREATED'; updateOrder(order);
    res.json({ order, lulu });
  } catch (error) { next(error); }
});



app.post('/api/admin/login', (req, res) => {
  const result = loginAdmin(req.body?.username, req.body?.password);
  if (!result) return res.status(401).json({ error: 'Invalid admin username or password.' });
  res.json(result);
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ admin: getAdminProfile() });
});

app.post('/api/admin/change-password', requireAdmin, (req, res) => {
  try {
    const result = updateAdminCredentials(req.body?.username, req.body?.password);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const orders = getOrders();
  const paidOrders = orders.filter(o => String(o.status || '').includes('PAID') || String(o.status || '').includes('CHECKOUT') || String(o.status || '').includes('LULU'));
  const revenueCents = orders.reduce((sum, o) => sum + Number(o.totalCents || 0), 0);
  res.json({ totalOrders: orders.length, paidOrCheckoutOrders: paidOrders.length, revenueCents, ordersByStatus: orders.reduce((acc, o) => { acc[o.status || 'UNKNOWN'] = (acc[o.status || 'UNKNOWN'] || 0) + 1; return acc; }, {}) });
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const orders = getOrders().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  res.json({ orders });
});

app.get('/api/admin/discounts', requireAdmin, (req, res) => {
  res.json({ discounts: listDiscounts() });
});

app.post('/api/admin/discounts', requireAdmin, (req, res) => {
  const discount = createDiscount(req.body || {});
  res.json({ discount, discounts: listDiscounts() });
});

app.patch('/api/admin/discounts/:code', requireAdmin, (req, res) => {
  const discount = updateDiscount(req.params.code, req.body || {});
  if (!discount) return res.status(404).json({ error: 'Discount code not found.' });
  res.json({ discount, discounts: listDiscounts() });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(400).json({ error: error.message || 'Something went wrong.' });
});

app.listen(port, () => console.log(`Forever Memories running at http://localhost:${port}`));
