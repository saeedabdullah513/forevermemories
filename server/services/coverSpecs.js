function inchesToPoints(value) { return Number(value) * 72; }

function parseTrimFromPodPackage(podPackageId = '0600X0900.BW.STD.PB.060UW444.MXX') {
  const trim = podPackageId.split('.')[0] || '0600X0900';
  const [w, h] = trim.split('X');
  return { trimWidthIn: Number(w) / 100, trimHeightIn: Number(h) / 100 };
}

function parseBinding(podPackageId = '') {
  if (podPackageId.includes('.PB.')) return 'paperback';
  if (podPackageId.includes('.CW.')) return 'casewrap';
  if (podPackageId.includes('.LW.')) return 'linenwrap';
  return 'paperback';
}

function estimateSpineWidthIn(pageCount = 160, podPackageId = '') {
  const paperSegment = (podPackageId.split('.')[4] || '060UW444').toUpperCase();
  const match = paperSegment.match(/(\d{3})[A-Z]{2}(\d{3})/);
  const ppi = match ? Number(match[2]) : 444;
  const raw = Number(pageCount) / ppi;
  return Math.max(raw, 0.12);
}

function fallbackCoverDimensions({ podPackageId, pageCount = 160 }) {
  const { trimWidthIn, trimHeightIn } = parseTrimFromPodPackage(podPackageId);
  const binding = parseBinding(podPackageId);
  const bleedIn = Number(process.env.COVER_BLEED_IN || 0.125);
  const wrapIn = binding === 'casewrap' || binding === 'linenwrap' ? Number(process.env.HARDCOVER_WRAP_IN || 0.75) : 0;
  const spineWidthIn = estimateSpineWidthIn(pageCount, podPackageId);
  const fullWidthIn = (trimWidthIn * 2) + spineWidthIn + (bleedIn * 2) + (wrapIn * 2);
  const fullHeightIn = trimHeightIn + (bleedIn * 2) + (wrapIn * 2);
  return {
    source: 'local-fallback',
    unit: 'PT',
    trimWidthIn,
    trimHeightIn,
    bleedIn,
    wrapIn,
    spineWidthIn,
    width: inchesToPoints(fullWidthIn),
    height: inchesToPoints(fullHeightIn),
    frontX: inchesToPoints(bleedIn + wrapIn + trimWidthIn + spineWidthIn),
    backX: inchesToPoints(bleedIn + wrapIn),
    spineX: inchesToPoints(bleedIn + wrapIn + trimWidthIn),
    panelY: inchesToPoints(bleedIn + wrapIn),
    panelWidth: inchesToPoints(trimWidthIn),
    panelHeight: inchesToPoints(trimHeightIn),
    spineWidth: inchesToPoints(spineWidthIn)
  };
}

module.exports = { fallbackCoverDimensions };
