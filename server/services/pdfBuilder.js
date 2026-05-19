const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { fallbackCoverDimensions } = require('./coverSpecs');

// Generated PDFs must live in /server/uploads because server.js exposes that folder at /uploads.
// Earlier builds wrote PDFs to /server/generated while returning /uploads/<file>.pdf links, which caused Cannot GET /uploads/... errors.
const outputDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

function safeText(value, fallback = '') {
  return String(value || fallback || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
}

function hashSeed(value = '') {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rng(seed) {
  let state = seed || 123456789;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return ((state >>> 0) / 4294967296);
  };
}

function clamp(value, min, max) {
  const number = Number(value);
  if (Number.isNaN(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function normalizeHex(value, fallback) {
  const cleaned = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(cleaned) ? cleaned : fallback;
}

function normalizeCoverSettings(settings = {}) {
  return {
    paletteMode: settings.paletteMode || 'auto',
    primaryColor: normalizeHex(settings.primaryColor, '#F8D7DA'),
    secondaryColor: normalizeHex(settings.secondaryColor, '#FFF1E6'),
    accentColor: normalizeHex(settings.accentColor, '#5C4B51'),
    photoScale: clamp(settings.photoScale ?? 1, 0.65, 1.45),
    photoX: clamp(settings.photoX ?? 50, 18, 82),
    photoY: clamp(settings.photoY ?? 38, 18, 70),
    titleX: clamp(settings.titleX ?? 50, 18, 82),
    titleY: clamp(settings.titleY ?? 70, 20, 86),
    titleAlign: ['left', 'center', 'right'].includes(settings.titleAlign) ? settings.titleAlign : 'center',
    artDensity: clamp(settings.artDensity ?? 55, 15, 95),
    aiMode: settings.aiMode || 'local-vector'
  };
}

function genrePalette(genre = 'memoir', variant = 1, settings = {}) {
  const normalizedSettings = normalizeCoverSettings(settings);
  if (normalizedSettings.paletteMode === 'manual') {
    return [normalizedSettings.primaryColor, normalizedSettings.secondaryColor, normalizedSettings.accentColor];
  }

  const palettes = {
    memoir: [['#F6D7C3', '#FFF7ED', '#6B4F4F'], ['#E9D5FF', '#FFF7ED', '#4C1D95'], ['#C7D2FE', '#F8FAFC', '#3730A3']],
    romance: [['#FBCFE8', '#FFF1F2', '#9D174D'], ['#FECACA', '#FFF7ED', '#7F1D1D'], ['#DDD6FE', '#FFF1F2', '#6D28D9']],
    adventure: [['#BBF7D0', '#ECFDF5', '#166534'], ['#FDBA74', '#FFF7ED', '#9A3412'], ['#A7F3D0', '#EFF6FF', '#065F46']],
    fantasy: [['#C4B5FD', '#F5F3FF', '#4C1D95'], ['#BFDBFE', '#F0FDFA', '#1E3A8A'], ['#FDE68A', '#FEFCE8', '#92400E']],
    comedy: [['#FDE68A', '#FFFBEB', '#92400E'], ['#FDBA74', '#FFF7ED', '#9A3412'], ['#A7F3D0', '#F0FDF4', '#166534']],
    leadership: [['#DBEAFE', '#F8FAFC', '#1E3A8A'], ['#E0E7FF', '#F8FAFC', '#3730A3'], ['#D9F99D', '#F7FEE7', '#3F6212']]
  };
  const options = palettes[genre] || palettes.memoir;
  return options[(Number(variant || 1) - 1) % options.length];
}

function genreMotifs(genre = 'memoir') {
  return {
    memoir: ['memory rings', 'warm horizon lines', 'keepsake fragments'],
    romance: ['soft hearts', 'interlocking arcs', 'rose-petal movement'],
    adventure: ['map lines', 'compass points', 'trail marks'],
    fantasy: ['stars', 'moon gates', 'floating realms'],
    comedy: ['confetti', 'playful sparks', 'comic motion'],
    leadership: ['rising lines', 'quiet peaks', 'architectural rhythm']
  }[genre] || ['abstract personal symbols'];
}

function drawBackground(doc, specs, palette, seedText) {
  const seed = hashSeed(seedText);
  const random = rng(seed);
  const gradient = doc.linearGradient(0, 0, specs.width, specs.height);
  gradient.stop(0, palette[1]).stop(0.56, palette[0]).stop(1, '#ffffff');
  doc.rect(0, 0, specs.width, specs.height).fill(gradient);

  for (let i = 0; i < 18; i += 1) {
    const size = 70 + random() * 220;
    doc.save();
    doc.opacity(0.06 + random() * 0.08);
    doc.circle(random() * specs.width, random() * specs.height, size).fill(i % 2 ? palette[2] : palette[0]);
    doc.restore();
  }
}

function drawBackAbstractArt(doc, region, genre, title, palette, settings, variant) {
  const seed = hashSeed(`${title}-${genre}-back-${variant}`);
  const random = rng(seed);
  const density = Math.round(settings.artDensity / 9);
  const motifs = genreMotifs(genre);

  doc.save();
  doc.rect(region.x, region.y, region.w, region.h).clip();

  for (let i = 0; i < density + 6; i += 1) {
    const x = region.x + random() * region.w;
    const y = region.y + random() * region.h;
    const w = 25 + random() * 130;
    const h = 12 + random() * 80;
    doc.save();
    doc.opacity(0.10 + random() * 0.16);
    doc.rotate(-18 + random() * 36, { origin: [x, y] });
    if (genre === 'fantasy') {
      doc.polygon([x, y - h], [x + w * 0.4, y], [x, y + h], [x - w * 0.4, y]).fill(i % 2 ? palette[2] : palette[0]);
    } else if (genre === 'adventure') {
      doc.moveTo(x - w / 2, y).lineTo(x + w / 2, y + h / 3).lineTo(x - w / 5, y + h).lineWidth(2.2).stroke(i % 2 ? palette[2] : palette[0]);
    } else if (genre === 'romance') {
      doc.circle(x, y, Math.min(w, h) / 2).fill(i % 2 ? palette[0] : palette[2]);
    } else if (genre === 'leadership') {
      doc.roundedRect(x - w / 2, y - h / 2, w, h, 8).fill(i % 2 ? palette[2] : palette[0]);
    } else {
      doc.ellipse(x, y, w / 2, h / 2).fill(i % 2 ? palette[2] : palette[0]);
    }
    doc.restore();
  }

  doc.restore();

  doc.save();
  doc.opacity(0.45);
  doc.fontSize(8).fillColor(palette[2]).font('Helvetica-Bold');
  doc.text(motifs.join(' • '), region.x + 20, region.y + region.h - 38, { width: region.w - 40, align: 'center' });
  doc.restore();
}

function drawFrontArt(doc, region, genre, title, palette, settings, variant) {
  const seed = hashSeed(`${title}-${genre}-front-${variant}`);
  const random = rng(seed);
  const lines = Math.round(settings.artDensity / 10) + 6;

  doc.save();
  doc.rect(region.x, region.y, region.w, region.h).clip();

  for (let i = 0; i < lines; i += 1) {
    const startX = region.x + random() * region.w;
    const startY = region.y + random() * region.h;
    doc.save();
    doc.opacity(0.10 + random() * 0.14);
    doc.lineWidth(1 + random() * 3);
    if (genre === 'fantasy') {
      doc.moveTo(startX, startY)
        .bezierCurveTo(startX + 80, startY - 140, startX + 170, startY + 120, startX + 250, startY - 20)
        .stroke(i % 2 ? palette[2] : palette[0]);
      doc.circle(startX + 24, startY - 12, 3 + random() * 7).fill(palette[2]);
    } else if (genre === 'adventure') {
      doc.moveTo(region.x + 35, startY)
        .lineTo(region.x + region.w - 35, startY + random() * 90 - 45)
        .stroke(i % 2 ? palette[2] : palette[0]);
    } else if (genre === 'romance') {
      doc.ellipse(startX, startY, 45 + random() * 80, 18 + random() * 40).stroke(i % 2 ? palette[2] : palette[0]);
    } else if (genre === 'comedy') {
      doc.circle(startX, startY, 6 + random() * 18).fill(i % 2 ? palette[2] : palette[0]);
    } else if (genre === 'leadership') {
      doc.roundedRect(startX, startY, 15 + random() * 80, 5 + random() * 24, 5).fill(i % 2 ? palette[2] : palette[0]);
    } else {
      doc.moveTo(startX, startY)
        .bezierCurveTo(startX + 60, startY - 70, startX + 120, startY + 70, startX + 180, startY)
        .stroke(i % 2 ? palette[2] : palette[0]);
    }
    doc.restore();
  }

  doc.restore();
}

function photoPathFromOrder(order) {
  const photo = order.input?.recipientPhoto || order.recipientPhoto;
  if (!photo?.fileName) return null;
  return path.join(__dirname, '..', 'uploads', photo.fileName);
}

function drawPhoto(doc, photoPath, x, y, w, h, palette) {
  doc.save();
  doc.roundedRect(x, y, w, h, 28).fill('#ffffff');
  doc.roundedRect(x + 8, y + 8, w - 16, h - 16, 22).clip();
  if (photoPath && fs.existsSync(photoPath)) {
    doc.image(photoPath, x + 8, y + 8, { fit: [w - 16, h - 16], align: 'center', valign: 'center' });
  } else {
    doc.rect(x + 8, y + 8, w - 16, h - 16).fill(palette[1]);
    doc.fontSize(12).fillColor(palette[2]).text('Recipient Photo', x + 18, y + h / 2 - 8, { width: w - 36, align: 'center' });
  }
  doc.restore();
}

async function createInteriorPdf(order) {
  const fileName = `${order.id}-interior.pdf`;
  const filePath = path.join(outputDir, fileName);
  const doc = new PDFDocument({ size: [432, 648], margin: 54 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  doc.font('Helvetica-Bold').fontSize(28).fillColor('#221F20').text(safeText(order.toc?.title, 'Custom Gift Book'), { align: 'center' });
  doc.moveDown();
  doc.font('Helvetica').fontSize(14).fillColor('#6B5E62').text(safeText(order.toc?.subtitle, 'Created by Book As A Gift'), { align: 'center' });

  let pageCounter = 1;
  (order.toc?.chapters || []).forEach(chapter => {
    doc.addPage();
    pageCounter += 1;
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#221F20').text(`Chapter ${chapter.chapter}`);
    doc.moveDown(0.5);
    doc.fontSize(28).text(safeText(chapter.title, 'Chapter Title'));
    doc.moveDown();
    doc.font('Helvetica').fontSize(13).fillColor('#544A4E').text(safeText(chapter.summary, 'Chapter summary'), { lineGap: 5 });
  });

  const targetPages = Number(order.pageCount || 160);
  const localPageLimit = Math.min(targetPages, 170);
  while (pageCounter < localPageLimit) {
    doc.addPage();
    pageCounter += 1;
    doc.font('Helvetica').fontSize(12).fillColor('#7A6F73').text('Sample placeholder page for local testing. Final production will use the full manuscript generation process.', { align: 'center', valign: 'center' });
  }

  doc.end();
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
  return { fileName, filePath };
}

function drawBarcodeBox(doc, x, y, w, h) {
  doc.save();
  doc.roundedRect(x, y, w, h, 8).fill('#ffffff').stroke('#d6d3d1');
  doc.font('Helvetica').fontSize(7).fillColor('#777').text('Lulu barcode area', x + 8, y + 8, { width: w - 16, align: 'center' });
  doc.restore();
}

async function createCoverPdf(order, luluDimensions = null) {
  const fileName = `${order.id}-cover-v${order.coverVariant || 1}.pdf`;
  const filePath = path.join(outputDir, fileName);
  const specs = luluDimensions || fallbackCoverDimensions({
    pageCount: order.pageCount || 160,
    binding: order.product?.binding || 'paperback'
  });

  const settings = normalizeCoverSettings(order.coverSettings || order.input?.coverSettings || {});
  const palette = genrePalette(order.input?.genre, order.coverVariant, settings);
  const title = safeText(order.toc?.title, `${safeText(order.input?.recipientName, 'Someone Special')}: A Story Made Just for Them`);
  const subtitle = safeText(order.toc?.subtitle, 'Custom keepsake edition');
  const genre = order.input?.genre || 'memoir';
  const seedText = `${title}-${genre}-${order.coverVariant || 1}-${JSON.stringify(settings)}`;

  const doc = new PDFDocument({ size: [specs.width, specs.height], margin: 0 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  drawBackground(doc, specs, palette, seedText);

  const bleed = specs.bleedIn * 72;
  const backX = bleed;
  const backW = specs.trimWidthIn * 72;
  const frontX = specs.width - bleed - backW;
  const panelY = bleed;
  const panelH = specs.trimHeightIn * 72;
  const spineX = backX + backW;
  const spineW = specs.spineWidthIn * 72;

  doc.save();
  doc.opacity(0.88).roundedRect(backX + 16, panelY + 16, backW - 32, panelH - 32, 28).fill('#ffffff');
  doc.opacity(0.90).roundedRect(frontX + 16, panelY + 16, backW - 32, panelH - 32, 28).fill('#ffffff');
  doc.restore();

  drawBackAbstractArt(doc, { x: backX + 28, y: panelY + 28, w: backW - 56, h: panelH - 56 }, genre, title, palette, settings, order.coverVariant || 1);
  drawFrontArt(doc, { x: frontX + 22, y: panelY + 22, w: backW - 44, h: panelH - 44 }, genre, title, palette, settings, order.coverVariant || 1);

  // Back cover copy over abstract art.
  doc.save();
  doc.opacity(0.78).roundedRect(backX + 42, panelY + 64, backW - 84, 230, 18).fill('#ffffff');
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(16).fillColor(palette[2]).text('About this custom book', backX + 62, panelY + 86, { width: backW - 124 });
  const backCopy = safeText(
    order.backCoverCopy,
    `A personalized ${genre} gift book inspired by ${safeText(order.input?.recipientName, 'the recipient')}, their memories, their strengths, and the moments that make their story worth celebrating.`
  );
  doc.font('Helvetica').fontSize(10.5).fillColor('#51454A').text(backCopy, backX + 62, panelY + 116, { width: backW - 124, lineGap: 3 });
  drawBarcodeBox(doc, backX + backW - 156, panelY + panelH - 124, 112, 74);

  // Spine.
  doc.save();
  doc.rect(spineX, 0, spineW, specs.height).fill(palette[2]);
  doc.translate(spineX + spineW / 2, specs.height / 2);
  doc.rotate(90);
  doc.font('Helvetica-Bold').fontSize(Math.min(13, Math.max(8, spineW * 0.75))).fillColor('#ffffff')
    .text(title, -specs.height / 2 + 68, -6, { width: specs.height - 136, align: 'center', lineBreak: false });
  doc.restore();

  // Front portrait with customer controls.
  const basePhotoW = backW * 0.58 * settings.photoScale;
  const basePhotoH = panelH * 0.36 * settings.photoScale;
  const photoX = frontX + (settings.photoX / 100) * backW - basePhotoW / 2;
  const photoY = panelY + (settings.photoY / 100) * panelH - basePhotoH / 2;
  drawPhoto(doc, photoPathFromOrder(order), photoX, photoY, basePhotoW, basePhotoH, palette);

  // Front title with customer controls.
  const titleBoxW = backW * 0.78;
  const titleX = frontX + (settings.titleX / 100) * backW - titleBoxW / 2;
  const titleY = panelY + (settings.titleY / 100) * panelH - 28;
  doc.save();
  doc.opacity(0.82).roundedRect(titleX - 10, titleY - 18, titleBoxW + 20, 150, 18).fill('#ffffff');
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(title.length > 42 ? 25 : 31).fillColor('#221F20')
    .text(title, titleX, titleY, { width: titleBoxW, align: settings.titleAlign, lineGap: 2 });
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(12).fillColor(palette[2])
    .text(subtitle, titleX, titleY + 88, { width: titleBoxW, align: settings.titleAlign, lineGap: 2 });

  doc.font('Helvetica-Bold').fontSize(9).fillColor(palette[2]).text('Book As A Gift', frontX + 44, panelY + panelH - 52, { width: backW - 88, align: 'center' });

  // Safety/trim guide for local production review.
  doc.save();
  doc.opacity(0.16).lineWidth(0.5).strokeColor('#000000');
  doc.rect(bleed, bleed, specs.width - bleed * 2, specs.height - bleed * 2).stroke();
  doc.restore();

  doc.end();
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
  return { fileName, filePath, specs, coverSettings: settings };
}

module.exports = { createInteriorPdf, createCoverPdf, normalizeCoverSettings, genrePalette };
