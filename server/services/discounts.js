const { readJson, writeJson } = require('./storage');

function normalize(code) { return String(code || '').trim().toUpperCase(); }

function listDiscounts() {
  return readJson('discounts.json', []);
}

function saveDiscounts(discounts) {
  writeJson('discounts.json', discounts);
}

function validateDiscount(code, subtotalCents) {
  const normalized = normalize(code);
  if (!normalized) return { valid: false, discountCents: 0, message: 'No code entered.' };
  const discounts = listDiscounts();
  const item = discounts.find(d => normalize(d.code) === normalized);
  if (!item || !item.active) return { valid: false, discountCents: 0, message: 'This discount code is not active.' };
  if (item.maxRedemptions && Number(item.used || 0) >= Number(item.maxRedemptions)) return { valid: false, discountCents: 0, message: 'This discount code has reached its limit.' };
  const value = Math.max(0, Math.min(Number(item.value || 0), item.type === 'percent' ? 100 : subtotalCents));
  const discountCents = item.type === 'percent' ? Math.round(subtotalCents * (value / 100)) : Math.min(value, subtotalCents);
  return { valid: true, code: item.code, discountCents, finalCents: Math.max(0, subtotalCents - discountCents), message: item.type === 'percent' ? `${value}% discount applied.` : `$${(discountCents / 100).toFixed(2)} discount applied.` };
}

function redeemDiscount(code) {
  const normalized = normalize(code);
  const updated = listDiscounts().map(d => normalize(d.code) === normalized ? { ...d, used: Number(d.used || 0) + 1 } : d);
  saveDiscounts(updated);
}

function createDiscount(input = {}) {
  const code = normalize(input.code);
  if (!code) throw new Error('Discount code is required.');
  const discounts = listDiscounts();
  if (discounts.some(d => normalize(d.code) === code)) throw new Error('That discount code already exists.');
  const discount = {
    code,
    type: input.type === 'fixed' ? 'fixed' : 'percent',
    value: Number(input.value || 0),
    active: input.active !== false,
    maxRedemptions: input.maxRedemptions ? Number(input.maxRedemptions) : null,
    used: 0,
    createdAt: new Date().toISOString()
  };
  if (discount.type === 'percent') discount.value = Math.max(0, Math.min(discount.value, 100));
  if (discount.type === 'fixed') discount.value = Math.max(0, Math.round(discount.value));
  discounts.unshift(discount);
  saveDiscounts(discounts);
  return discount;
}

function updateDiscount(code, patch = {}) {
  const normalized = normalize(code);
  let updatedItem = null;
  const discounts = listDiscounts().map(d => {
    if (normalize(d.code) !== normalized) return d;
    updatedItem = { ...d, ...patch, code: d.code, updatedAt: new Date().toISOString() };
    if (updatedItem.type === 'percent') updatedItem.value = Math.max(0, Math.min(Number(updatedItem.value || 0), 100));
    if (updatedItem.type === 'fixed') updatedItem.value = Math.max(0, Math.round(Number(updatedItem.value || 0)));
    if (updatedItem.maxRedemptions) updatedItem.maxRedemptions = Number(updatedItem.maxRedemptions);
    return updatedItem;
  });
  saveDiscounts(discounts);
  return updatedItem;
}

module.exports = { validateDiscount, redeemDiscount, listDiscounts, createDiscount, updateDiscount };
