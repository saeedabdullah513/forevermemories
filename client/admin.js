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

let adminToken = localStorage.getItem('bagAdminToken') || '';

const loginCard = document.getElementById('loginCard');
const dashboard = document.getElementById('adminDashboard');
const loginMessage = document.getElementById('loginMessage');
const adminMessage = document.getElementById('adminMessage');
const statsGrid = document.getElementById('statsGrid');
const orderRows = document.getElementById('orderRows');
const discountRows = document.getElementById('discountRows');

function money(cents) { return `$${((Number(cents) || 0) / 100).toFixed(2)}`; }
function headers() { return { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }; }

function showLogin(message = '') {
  loginCard.classList.remove('hidden');
  dashboard.classList.add('hidden');
  loginMessage.textContent = message;
}

function showDashboard() {
  loginCard.classList.add('hidden');
  dashboard.classList.remove('hidden');
}

async function getJson(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      adminToken = '';
      localStorage.removeItem('bagAdminToken');
      showLogin('Please login again.');
    }
    throw new Error(data.error || 'Admin request failed.');
  }
  return data;
}

async function loginAdmin() {
  try {
    loginMessage.textContent = 'Logging in...';
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('adminUsername').value,
        password: document.getElementById('adminPassword').value
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Login failed.');
    adminToken = data.token;
    localStorage.setItem('bagAdminToken', adminToken);
    showDashboard();
    showToast('Logged in successfully.', 'success');
    await loadAdmin();
  } catch (error) {
    showLogin(error.message);
  }
}

async function loadAdmin() {
  try {
    showDashboard();
    adminMessage.textContent = 'Loading admin data...';
    const [stats, orders, discounts, me] = await Promise.all([
      getJson('/api/admin/stats'),
      getJson('/api/admin/orders'),
      getJson('/api/admin/discounts'),
      getJson('/api/admin/me')
    ]);
    document.getElementById('newAdminUsername').placeholder = me.admin?.username || 'New admin username';
    statsGrid.innerHTML = `
      <article class="admin-card stat-card"><span>Total orders</span><b>${stats.totalOrders}</b></article>
      <article class="admin-card stat-card"><span>Paid / checkout</span><b>${stats.paidOrCheckoutOrders}</b></article>
      <article class="admin-card stat-card"><span>Revenue</span><b>${money(stats.revenueCents)}</b></article>
      <article class="admin-card stat-card"><span>Statuses</span><b>${Object.keys(stats.ordersByStatus || {}).length}</b></article>
    `;
    orderRows.innerHTML = orders.orders.map(o => `<tr><td>${(o.createdAt || '').slice(0,19).replace('T',' ')}</td><td><strong>${o.toc?.title || ''}</strong><br><small>${o.input?.genre || ''}</small></td><td>${o.customer?.email || o.shippingAddress?.email || ''}<br><small>${o.shippingAddress?.name || ''}</small></td><td>${o.product?.label || ''}</td><td>${money(o.totalCents)}</td><td>${o.futurePreferences?.wantsPromotion ? 'Promotion ' : ''}${o.futurePreferences?.wantsGhostwriting ? 'Ghostwriting ' : ''}${o.futurePreferences?.wantsPublishing ? 'Publishing' : ''}</td><td>${o.status || ''}</td></tr>`).join('');
    renderDiscounts(discounts.discounts);
    adminMessage.textContent = 'Admin data loaded.';
  } catch (e) {
    adminMessage.textContent = e.message;
  }
}

function renderDiscounts(discounts) {
  discountRows.innerHTML = discounts.map(d => `<tr><td><strong>${d.code}</strong></td><td>${d.type}</td><td>${d.type === 'percent' ? d.value + '%' : money(d.value)}</td><td>${d.used || 0}${d.maxRedemptions ? '/' + d.maxRedemptions : ''}</td><td>${d.active ? 'Active' : 'Inactive'}</td><td><button class="button secondary toggle-discount" data-code="${d.code}" data-active="${d.active ? 'false' : 'true'}">${d.active ? 'Deactivate' : 'Activate'}</button></td></tr>`).join('');
  document.querySelectorAll('.toggle-discount').forEach(btn => btn.addEventListener('click', async () => {
    await getJson(`/api/admin/discounts/${btn.dataset.code}`, { method:'PATCH', body: JSON.stringify({ active: btn.dataset.active === 'true' }) });
    await loadAdmin();
  }));
}

async function changeCredentials() {
  try {
    const username = document.getElementById('newAdminUsername').value;
    const password = document.getElementById('newAdminPassword').value;
    const data = await getJson('/api/admin/change-password', { method: 'POST', body: JSON.stringify({ username, password }) });
    adminToken = data.token;
    localStorage.setItem('bagAdminToken', adminToken);
    document.getElementById('settingsMessage').textContent = 'Admin login updated. Your new session is active.';
    showToast('Admin credentials updated.', 'success');
    document.getElementById('newAdminPassword').value = '';
    await loadAdmin();
  } catch (error) {
    document.getElementById('settingsMessage').textContent = error.message;
  }
}

document.getElementById('adminLogin').addEventListener('click', loginAdmin);
document.getElementById('refreshAdmin').addEventListener('click', loadAdmin);
document.getElementById('adminLogout').addEventListener('click', () => {
  adminToken = '';
  localStorage.removeItem('bagAdminToken');
  showLogin('Logged out.');
});
document.getElementById('changeCredentials').addEventListener('click', changeCredentials);

document.getElementById('createDiscount').addEventListener('click', async () => {
  try {
    const payload = { code: document.getElementById('discountCodeInput').value, type: document.getElementById('discountType').value, value: Number(document.getElementById('discountValue').value || 0), maxRedemptions: document.getElementById('discountMax').value || null };
    const data = await getJson('/api/admin/discounts', { method:'POST', body: JSON.stringify(payload) });
    document.getElementById('discountAdminMessage').textContent = 'Discount created.';
    renderDiscounts(data.discounts);
  } catch (e) { document.getElementById('discountAdminMessage').textContent = e.message; }
});

if (adminToken) loadAdmin(); else showLogin();
