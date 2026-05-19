async function getLuluToken() {
  const basicAuth = process.env.LULU_BASIC_AUTH;
  if (!basicAuth) return null;
  const tokenUrl = process.env.LULU_TOKEN_URL || 'https://api.sandbox.lulu.com/auth/realms/glasstree/protocol/openid-connect/token';
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicAuth },
    body: new URLSearchParams({ grant_type: 'client_credentials' })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Lulu token failed: ${response.status} ${JSON.stringify(data)}`);
  return data.access_token;
}

async function luluRequest(path, payload, method = 'POST') {
  const token = await getLuluToken();
  if (!token) return { mock: true, message: 'Lulu credentials are not configured. This is a local mock response.', payload };
  const baseUrl = process.env.LULU_BASE_URL || 'https://api.sandbox.lulu.com';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: method === 'GET' ? undefined : JSON.stringify(payload || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Lulu API failed: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

function buildLineItem({ quantity = 1, pageCount, podPackageId, title, interiorUrl, coverUrl, externalId }) {
  const item = {
    external_id: externalId,
    title: title || 'Custom Gift Book',
    quantity,
    pod_package_id: podPackageId || process.env.LULU_DEFAULT_POD_PACKAGE_ID,
    page_count: Number(pageCount || process.env.LULU_DEFAULT_PAGE_COUNT || 160)
  };
  if (interiorUrl && coverUrl) {
    item.interior = { source_url: interiorUrl };
    item.cover = { source_url: coverUrl };
  }
  return item;
}

async function getCoverDimensions({ podPackageId, pageCount }) {
  return luluRequest('/cover-dimensions/', {
    pod_package_id: podPackageId,
    page_count: Number(pageCount || 160),
    unit: 'PT'
  });
}

async function validateCover({ sourceUrl, podPackageId, pageCount }) {
  return luluRequest('/validate-cover/', {
    source_url: sourceUrl,
    pod_package_id: podPackageId,
    page_count: Number(pageCount || 160)
  });
}

async function validateInterior({ sourceUrl, podPackageId }) {
  return luluRequest('/validate-interior/', {
    source_url: sourceUrl,
    pod_package_id: podPackageId
  });
}

module.exports = { luluRequest, buildLineItem, getCoverDimensions, validateCover, validateInterior };
