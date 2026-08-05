let adminToken = localStorage.getItem('adminToken') || '';
let currentAdminUsername = localStorage.getItem('adminUsername') || 'admin';
let allAdminProducts = [];
let allAdminOrders = [];

document.addEventListener('DOMContentLoaded', () => {
  if (adminToken) {
    verifyAdminToken();
  } else {
    showLoginOverlay();
  }

  const hiddenSwitch = document.getElementById('modalHidden');
  if (hiddenSwitch) {
    hiddenSwitch.addEventListener('change', (e) => {
      const statusText = document.getElementById('hiddenStatusText');
      if (statusText) {
        statusText.textContent = e.target.checked ? 'Hidden (Draft)' : 'Visible in Shop';
        statusText.style.color = e.target.checked ? 'var(--status-red)' : 'var(--status-green)';
      }
    });
  }
});

function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`
  };
}

function showLoginOverlay() {
  const overlay = document.getElementById('adminLoginOverlay');
  const dashboard = document.getElementById('adminDashboard');
  if (overlay) overlay.style.display = 'flex';
  if (dashboard) dashboard.style.display = 'none';
}

function hideLoginOverlay() {
  const overlay = document.getElementById('adminLoginOverlay');
  const dashboard = document.getElementById('adminDashboard');
  if (overlay) overlay.style.display = 'none';
  if (dashboard) dashboard.style.display = 'block';

  const userPill = document.getElementById('currentAdminName');
  if (userPill) userPill.textContent = currentAdminUsername;
}

async function verifyAdminToken() {
  try {
    const res = await fetch('/api/admin/verify', {
      headers: getAuthHeaders()
    });
    if (res.ok) {
      hideLoginOverlay();
      loadAdminDashboardData();
    } else {
      adminToken = '';
      localStorage.removeItem('adminToken');
      showLoginOverlay();
    }
  } catch (err) {
    console.error('Verify error:', err);
    showLoginOverlay();
  }
}

async function handleAdminLogin(event) {
  event.preventDefault();
  const user = document.getElementById('adminUser').value.trim();
  const pass = document.getElementById('adminPass').value.trim();
  const btn = document.getElementById('loginBtn');
  const errorAlert = document.getElementById('loginError');

  if (errorAlert) errorAlert.style.display = 'none';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';
  }

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass })
    });
    const data = await res.json();

    if (res.ok && data.token) {
      adminToken = data.token;
      currentAdminUsername = data.username || user;
      localStorage.setItem('adminToken', adminToken);
      localStorage.setItem('adminUsername', currentAdminUsername);
      hideLoginOverlay();
      showToast('Welcome to Admin Control Center');
      loadAdminDashboardData();
    } else {
      if (errorAlert) {
        document.getElementById('loginErrorText').textContent = data.error || 'Invalid credentials.';
        errorAlert.style.display = 'flex';
      }
    }
  } catch (err) {
    console.error('Login error:', err);
    if (errorAlert) {
      document.getElementById('loginErrorText').textContent = 'Server connection failed.';
      errorAlert.style.display = 'flex';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Login to Dashboard';
    }
  }
}

function handleAdminLogout() {
  adminToken = '';
  localStorage.removeItem('adminToken');
  showLoginOverlay();
  showToast('Logged out of Admin Panel');
}

function switchAdminTab(tabId, btn) {
  const tabs = document.querySelectorAll('.sidebar-link, .admin-tab');
  tabs.forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const contents = document.querySelectorAll('.admin-tab-content');
  contents.forEach(c => c.classList.remove('active'));

  const target = document.getElementById(`tab-${tabId}`);
  if (target) target.classList.add('active');

  const titleEl = document.getElementById('adminCurrentTabTitle');
  if (titleEl) {
    const titles = {
      overview: 'Overview & Revenue',
      products: 'Products & Stock Management',
      orders: 'Customer Orders & Sales',
      settings: 'Settings & Security'
    };
    titleEl.textContent = titles[tabId] || 'Admin Dashboard';
  }

  if (tabId === 'overview' || tabId === 'orders') {
    loadAdminDashboardData();
  } else if (tabId === 'products') {
    loadAdminProducts();
  }
}

async function loadAdminDashboardData() {
  try {
    const res = await fetch('/api/admin/stats', { headers: getAuthHeaders() });
    if (!res.ok) return;
    const data = await res.json();

    if (document.getElementById('statRevenue')) document.getElementById('statRevenue').textContent = '$' + data.totalRevenue.toFixed(2);
    if (document.getElementById('statOrders')) document.getElementById('statOrders').textContent = data.totalOrders;
    if (document.getElementById('statProducts')) document.getElementById('statProducts').textContent = data.totalProducts;

    allAdminOrders = data.recentOrders || [];
    renderOverviewOrdersTable(allAdminOrders);
    renderAllOrdersTable(allAdminOrders);
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

function renderOverviewOrdersTable(orders) {
  const tbody = document.getElementById('overviewOrdersTable');
  if (!tbody) return;

  if (!orders || orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-dim);">No orders recorded yet.</td></tr>';
    return;
  }

  let html = '';
  orders.slice(0, 5).forEach(ord => {
    const dateStr = new Date(ord.createdAt).toLocaleString();
    const keysStr = ord.dispensedKeys ? ord.dispensedKeys.join(', ') : 'N/A';
    const itemsStr = ord.items ? ord.items.map(i => `${i.qty}x ${i.title}`).join(', ') : 'Pass';

    html += `
      <tr>
        <td><strong>${ord.orderNumber || ord.id}</strong></td>
        <td>${escapeHtml(ord.email)}</td>
        <td>${escapeHtml(itemsStr)}</td>
        <td><span class="status-chip">${escapeHtml(ord.paymentMethod || 'Crypto')}</span></td>
        <td class="text-accent"><strong>$${ord.total ? ord.total.toFixed(2) : '0.00'}</strong></td>
        <td><code class="font-mono text-muted" style="font-size:0.8125rem;">${escapeHtml(keysStr)}</code></td>
        <td class="text-dim" style="font-size:0.8125rem;">${dateStr}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderAllOrdersTable(orders) {
  const tbody = document.getElementById('allOrdersTable');
  if (!tbody) return;

  if (!orders || orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-dim);">No customer orders found.</td></tr>';
    return;
  }

  let html = '';
  orders.forEach(ord => {
    const dateStr = new Date(ord.createdAt).toLocaleString();
    const keysStr = ord.dispensedKeys ? ord.dispensedKeys.join(', ') : 'N/A';
    const itemsStr = ord.items ? ord.items.map(i => `${i.qty}x ${i.title}`).join(', ') : 'Pass';

    html += `
      <tr>
        <td><strong>${ord.orderNumber || ord.id}</strong></td>
        <td>${escapeHtml(ord.email)}</td>
        <td>${escapeHtml(itemsStr)}</td>
        <td><span class="status-chip">${escapeHtml(ord.paymentMethod || 'Crypto')}</span></td>
        <td class="text-accent"><strong>$${ord.total ? ord.total.toFixed(2) : '0.00'}</strong></td>
        <td><code class="font-mono text-muted" style="font-size:0.8125rem;">${escapeHtml(keysStr)}</code></td>
        <td class="text-dim" style="font-size:0.8125rem;">${dateStr}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function filterOrdersTable() {
  const term = document.getElementById('orderSearchInput').value.toLowerCase().trim();
  if (!term) {
    renderAllOrdersTable(allAdminOrders);
    return;
  }
  const filtered = allAdminOrders.filter(ord => {
    const emailMatch = ord.email && ord.email.toLowerCase().includes(term);
    const keyMatch = ord.dispensedKeys && ord.dispensedKeys.some(k => k.toLowerCase().includes(term));
    const idMatch = ord.orderNumber && ord.orderNumber.toLowerCase().includes(term);
    return emailMatch || keyMatch || idMatch;
  });
  renderAllOrdersTable(filtered);
}

async function loadAdminProducts() {
  try {
    const res = await fetch('/api/products', { headers: getAuthHeaders() });
    if (!res.ok) return;
    allAdminProducts = await res.json();

    renderAdminProductGrid(allAdminProducts);
  } catch (err) {
    console.error('Error loading products:', err);
  }
}

function renderAdminProductGrid(products) {
  const container = document.getElementById('adminProductGrid');
  if (!container) return;

  if (!products || products.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-dim);">
        <i class="fa-solid fa-box-open" style="font-size: 3rem; margin-bottom: 1rem;"></i>
        <p>No products exist yet. Click "Create New Product" above.</p>
      </div>
    `;
    return;
  }

  let html = '';
  products.forEach(p => {
    const keyCount = p.stockKeys ? p.stockKeys.length : 0;
    const isHidden = Boolean(p.hidden);

    html += `
      <div class="admin-prod-card ${isHidden ? 'hidden-card' : ''}">
        <div class="admin-prod-img-wrap">
          <img src="${p.art}" alt="${escapeHtml(p.title)}">
          <span class="status-chip ${isHidden ? 'status-red' : 'status-green'}">
            ${isHidden ? 'Hidden (Draft)' : 'Visible'}
          </span>
        </div>
        <div class="admin-prod-body">
          <h3 class="admin-prod-title">${escapeHtml(p.title)}</h3>
          <p class="admin-prod-desc">${escapeHtml(p.description)}</p>

          <div class="admin-prod-meta">
            <div><strong class="text-accent">$${p.price.toFixed(2)}</strong></div>
            <div>
              <span class="status-chip ${keyCount > 0 ? 'status-cyan' : 'status-red'}">
                <i class="fa-solid fa-key"></i> ${keyCount} Keys in Stock
              </span>
            </div>
          </div>

          <div class="admin-prod-actions">
            <button class="btn btn-glass btn-sm" onclick="editProduct('${p.id}')">
              <i class="fa-solid fa-pen"></i> Edit
            </button>
            <button class="btn btn-glass btn-sm" onclick="toggleProductVisibility('${p.id}', ${!isHidden})">
              <i class="fa-solid ${isHidden ? 'fa-eye' : 'fa-eye-slash'}"></i> ${isHidden ? 'Show' : 'Hide'}
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderStockEngineList(products) {
  const container = document.getElementById('stockProductsContainer');
  if (!container) return;

  if (!products || products.length === 0) {
    container.innerHTML = '<p class="text-dim">No products found.</p>';
    return;
  }

  let html = '';
  products.forEach(p => {
    const keysArray = p.stockKeys || [];
    const keysText = keysArray.join('\n');
    const keyCount = keysArray.length;

    html += `
      <div class="admin-panel-card stock-card" style="margin-bottom: 1.5rem;">
        <div class="panel-header" style="align-items: center;">
          <div style="display:flex; align-items:center; gap: 1rem;">
            <img src="${p.art}" style="width: 48px; height: 48px; object-fit: cover; border-radius: var(--radius-sm);">
            <div>
              <h4 style="margin: 0; font-size: 1.125rem;">${escapeHtml(p.shortTitle || p.title)}</h4>
              <span class="text-dim" style="font-size: 0.8125rem;">Prefix: <code>${p.prefix}</code> &bull; Price: $${p.price.toFixed(2)}</span>
            </div>
          </div>
          <span class="status-chip ${keyCount > 0 ? 'status-green' : 'status-red'}">
            <i class="fa-solid fa-key"></i> <span id="stockCountBadge-${p.id}">${keyCount}</span> Keys Available
          </span>
        </div>

        <div style="margin-top: 1rem;">
          <label class="form-label" style="font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 0.5rem; display: block;">
            Enter Stock Keys (One key per line):
          </label>
          <textarea id="stockTextArea-${p.id}" class="form-input font-mono" rows="4" placeholder="BOT-XXXX-XXXX-XXXX-KEY" oninput="updateStockCountLive('${p.id}')">${escapeHtml(keysText)}</textarea>
          
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top: 0.75rem;">
            <span class="text-dim" style="font-size: 0.75rem;">Tip: Paste list of keys. Stock level updates dynamically upon purchase.</span>
            <button class="btn btn-primary btn-sm" onclick="saveProductStock('${p.id}')">
              <i class="fa-solid fa-floppy-disk"></i> Update Stock Keys
            </button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function updateStockCountLive(productId) {
  const area = document.getElementById(`stockTextArea-${productId}`);
  const badge = document.getElementById(`stockCountBadge-${productId}`);
  if (area && badge) {
    const lines = area.value.split('\n').map(k => k.trim()).filter(k => k.length > 0);
    badge.textContent = lines.length;
  }
}

async function saveProductStock(productId) {
  const area = document.getElementById(`stockTextArea-${productId}`);
  if (!area) return;

  const keysText = area.value;
  try {
    const res = await fetch(`/api/products/${productId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ keysText })
    });
    if (res.ok) {
      showToast('Stock keys saved successfully!');
      loadAdminProducts();
      loadAdminDashboardData();
    } else {
      showToast('Failed to save stock keys.');
    }
  } catch (err) {
    console.error('Save stock error:', err);
    showToast('Network error saving stock.');
  }
}

function openProductModal(product = null) {
  const modal = document.getElementById('productModal');
  const title = document.getElementById('productModalTitle');

  if (!modal) return;

  if (product) {
    title.textContent = 'Edit Product';
    document.getElementById('modalProductId').value = product.id;
    document.getElementById('modalTitle').value = product.title || '';
    document.getElementById('modalShortTitle').value = product.shortTitle || '';
    document.getElementById('modalPrice').value = product.price || '';
    document.getElementById('modalCategory').value = product.category || 'hourly';
    document.getElementById('modalDuration').value = product.duration || '';
    document.getElementById('modalPrefix').value = product.prefix || 'BOT-KEY';
    document.getElementById('modalArt').value = product.art || '';
    document.getElementById('modalDescription').value = product.description || '';
    document.getElementById('modalHidden').checked = Boolean(product.hidden);

    const keysArray = product.stockKeys || [];
    document.getElementById('modalKeysText').value = keysArray.join('\n');

    if (product.art) {
      document.getElementById('modalPreviewImg').src = product.art;
      document.getElementById('modalArtPreview').style.display = 'block';
    }
  } else {
    title.textContent = 'Create New Product';
    document.getElementById('modalProductId').value = '';
    document.getElementById('productForm').reset();
    document.getElementById('modalHidden').checked = false;
    document.getElementById('modalArtPreview').style.display = 'none';
  }

  const statusText = document.getElementById('hiddenStatusText');
  if (statusText) {
    const isHidden = document.getElementById('modalHidden').checked;
    statusText.textContent = isHidden ? 'Hidden (Draft)' : 'Visible in Shop';
    statusText.style.color = isHidden ? 'var(--status-red)' : 'var(--status-green)';
  }

  modal.classList.add('active');
}

function closeProductModal() {
  const modal = document.getElementById('productModal');
  if (modal) modal.classList.remove('active');
}

function editProduct(productId) {
  const prod = allAdminProducts.find(p => p.id === productId);
  if (prod) openProductModal(prod);
}

async function toggleProductVisibility(productId, hideState) {
  try {
    const res = await fetch(`/api/products/${productId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ hidden: hideState })
    });
    if (res.ok) {
      showToast(hideState ? 'Product set to Hidden' : 'Product set to Visible');
      loadAdminProducts();
    }
  } catch (err) {
    console.error('Toggle visibility error:', err);
  }
}

async function deleteProduct(productId) {
  if (!confirm('Are you sure you want to delete this product?')) return;

  try {
    const res = await fetch(`/api/products/${productId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (res.ok) {
      showToast('Product deleted');
      loadAdminProducts();
      loadAdminDashboardData();
    }
  } catch (err) {
    console.error('Delete product error:', err);
  }
}

async function handleThumbnailUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('thumbnail', file);

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      },
      body: formData
    });
    const data = await res.json();
    if (res.ok && data.url) {
      document.getElementById('modalArt').value = data.url;
      document.getElementById('modalPreviewImg').src = data.url;
      document.getElementById('modalArtPreview').style.display = 'block';
      showToast('Thumbnail uploaded successfully!');
    } else {
      showToast(data.error || 'Upload failed');
    }
  } catch (err) {
    console.error('Upload error:', err);
    showToast('Upload error');
  }
}

async function handleProductFormSubmit(event) {
  event.preventDefault();
  const id = document.getElementById('modalProductId').value;
  const payload = {
    title: document.getElementById('modalTitle').value.trim(),
    shortTitle: document.getElementById('modalShortTitle').value.trim(),
    price: parseFloat(document.getElementById('modalPrice').value) || 0,
    category: document.getElementById('modalCategory').value,
    duration: document.getElementById('modalDuration').value.trim(),
    prefix: document.getElementById('modalPrefix').value.trim(),
    art: document.getElementById('modalArt').value.trim() || 'assets/compact_pass_1h.jpg',
    description: document.getElementById('modalDescription').value.trim(),
    hidden: document.getElementById('modalHidden').checked,
    keysText: document.getElementById('modalKeysText').value
  };

  try {
    const url = id ? `/api/products/${id}` : '/api/products';
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      showToast(id ? 'Product updated!' : 'Product created!');
      closeProductModal();
      loadAdminProducts();
      loadAdminDashboardData();
    } else {
      const errData = await res.json();
      showToast(errData.error || 'Failed to save product');
    }
  } catch (err) {
    console.error('Product save error:', err);
    showToast('Network error saving product');
  }
}

async function handleUpdateCredentials(event) {
  event.preventDefault();
  const newUsername = document.getElementById('settingUsername').value.trim();
  const newPassword = document.getElementById('settingPassword').value.trim();

  if (!newUsername && !newPassword) {
    showToast('Please enter new username or password.');
    return;
  }

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ newUsername, newPassword })
    });
    if (res.ok) {
      showToast('Admin credentials updated! Please log in again.');
      setTimeout(() => handleAdminLogout(), 1500);
    } else {
      showToast('Failed to update credentials.');
    }
  } catch (err) {
    console.error('Settings error:', err);
  }
}

async function handleUpdateWallets(event) {
  event.preventDefault();
  const wallets = {
    btc: document.getElementById('walletBTC').value.trim(),
    usdt_trc20: document.getElementById('walletUSDT').value.trim(),
    eth: document.getElementById('walletETH').value.trim(),
    sol: document.getElementById('walletSOL').value.trim(),
    ltc: document.getElementById('walletLTC').value.trim()
  };

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ wallets })
    });
    if (res.ok) {
      showToast('Crypto wallet addresses updated!');
    } else {
      showToast('Failed to update wallet addresses.');
    }
  } catch (err) {
    console.error('Wallet save error:', err);
  }
}

function showToast(message) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.style.padding = '0.875rem 1.25rem';
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.gap = '0.75rem';
  toast.style.fontSize = '0.875rem';
  toast.style.fontWeight = '500';
  toast.style.color = '#fff';
  toast.style.transition = 'all 0.3s ease';

  toast.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--status-green); font-size: 1rem;"></i> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 2500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
