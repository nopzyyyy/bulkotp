let allAdminProducts = [];
let allAdminOrders = [];
let allAdminUsers = [];
let allAdminTickets = [];
let activeAdminTicketId = null;

let progressTimer = null;

function startTopProgress() {
  let bar = document.getElementById('topProgressBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'topProgressBar';
    document.body.prepend(bar);
  }

  if (progressTimer) clearInterval(progressTimer);

  bar.style.width = '0%';
  bar.classList.add('active');

  let currentW = 10;
  bar.style.width = currentW + '%';

  progressTimer = setInterval(() => {
    if (currentW < 80) {
      currentW += (80 - currentW) * 0.15;
      bar.style.width = currentW + '%';
    }
  }, 100);
}

function finishTopProgress() {
  const bar = document.getElementById('topProgressBar');
  if (!bar) return;

  if (progressTimer) clearInterval(progressTimer);

  bar.style.width = '100%';

  setTimeout(() => {
    bar.classList.remove('active');
    setTimeout(() => {
      bar.style.width = '0%';
    }, 300);
  }, 250);
}

let loadingOverlayTimer = null;

function showGlobalLoading(text = 'Loading...') {
  let overlay = document.getElementById('globalLoadingOverlay');
  if (!overlay) return;

  const textEl = overlay.querySelector('.spinner-loading-text');
  if (textEl) textEl.textContent = text;

  overlay.classList.add('active');

  if (loadingOverlayTimer) clearTimeout(loadingOverlayTimer);

  loadingOverlayTimer = setTimeout(() => {
    hideGlobalLoading();
  }, 2500);
}

function hideGlobalLoading() {
  const overlay = document.getElementById('globalLoadingOverlay');
  if (!overlay) return;

  if (loadingOverlayTimer) clearTimeout(loadingOverlayTimer);
  overlay.classList.remove('active');
}

document.addEventListener('DOMContentLoaded', () => {
  checkAdminAuth();
});

async function checkAdminAuth() {
  startTopProgress();
  try {
    const token = localStorage.getItem('market_session_token');
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res = await fetch('/api/auth/me?t=' + Date.now(), { credentials: 'include', headers });
    const data = await res.json();
    if (!res.ok || !data.authenticated || data.user.role !== 'ADMIN') {
      window.location.href = 'login.html?redirect=/admin.html';
      return;
    }
    const userEl = document.getElementById('adminUsernameDisplay');
    if (userEl) userEl.textContent = data.user.email;
    loadAdminDashboardData();
  } catch (err) {
    window.location.href = 'login.html?redirect=/admin.html';
  } finally {
    finishTopProgress();
  }
}

async function logoutAdmin() {
  if (window.SiteShell && typeof window.SiteShell.logout === 'function') {
    await window.SiteShell.logout();
    return;
  }
  startTopProgress();
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch (_) {}
  window.location.href = '/api/auth/logout';
}

function toggleMobileSidebar() {
  const sidebar = document.querySelector('.admin-sidebar');
  const overlay = document.getElementById('adminSidebarOverlay');
  if (sidebar) sidebar.classList.toggle('mobile-open');
  if (overlay) overlay.classList.toggle('active');
}

async function switchAdminTab(tabId, btn) {
  startTopProgress();
  showGlobalLoading('Loading section...');
  const tabs = document.querySelectorAll('.sidebar-link');
  tabs.forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const contents = document.querySelectorAll('.admin-tab-content');
  contents.forEach(c => c.classList.remove('active'));

  const target = document.getElementById(`tab-${tabId}`);
  if (target) target.classList.add('active');

  const titleEl = document.getElementById('adminCurrentTabTitle');
  if (titleEl) {
    const titles = {
      overview: 'Revenue Analytics',
      products: 'Products & Stock Management',
      orders: 'Customer Orders & History',
      users: 'Users & Balances Manager',
      vouchers: 'Vouchers & Gift Codes Manager',
      tickets: 'Customer Support Tickets',
      payments: 'Payment Gateway Settings',
      audit: 'Security Audit Logs'
    };
    titleEl.textContent = titles[tabId] || 'Admin Dashboard';
  }

  // Auto-close mobile sidebar
  const sidebar = document.querySelector('.admin-sidebar');
  const overlay = document.getElementById('adminSidebarOverlay');
  if (sidebar && sidebar.classList.contains('mobile-open')) sidebar.classList.remove('mobile-open');
  if (overlay && overlay.classList.contains('active')) overlay.classList.remove('active');

  try {
    if (tabId === 'overview') await loadAdminDashboardData();
    else if (tabId === 'products') await loadAdminProducts();
    else if (tabId === 'orders') await loadAdminOrders();
    else if (tabId === 'users') await loadAdminUsers();
    else if (tabId === 'vouchers') await loadAdminVouchers();
    else if (tabId === 'tickets') await loadAdminTickets();
    else if (tabId === 'payments') await loadAdminPaymentSettings();
    else if (tabId === 'audit') await loadAdminAuditLogs();
  } catch (e) {
    console.error('Error switching tab:', e);
  } finally {
    finishTopProgress();
    hideGlobalLoading();
  }
}

async function loadAdminDashboardData() {
  try {
    const res = await fetch('/api/admin/stats', { credentials: 'include' });
    if (!res.ok) return;
    const stats = await res.json();

    // Metric Cards
    document.getElementById('statTotalRevenue').textContent = `$${(stats.totalRevenue || 0).toFixed(2)}`;
    document.getElementById('statTodayRevenue').textContent = `$${(stats.todayRevenue || 0).toFixed(2)}`;
    document.getElementById('statMonthRevenue').textContent = `$${(stats.monthRevenue || 0).toFixed(2)}`;
    document.getElementById('statTotalOrders').textContent = stats.totalOrders || 0;

    // Payment Breakdowns
    if (stats.breakdown) {
      document.getElementById('statCryptoRev').textContent = `$${(stats.breakdown.crypto || 0).toFixed(2)}`;
      document.getElementById('statBalanceRev').textContent = `$${(stats.breakdown.balance || 0).toFixed(2)}`;
    }
    if (stats.breakdownCounts) {
      document.getElementById('statCryptoCount').textContent = `${stats.breakdownCounts.crypto || 0} transactions`;
      document.getElementById('statBalanceCount').textContent = `${stats.breakdownCounts.balance || 0} transactions`;
    }

    // Recent Orders Table
    renderRecentOrdersTable(stats.recentOrders || []);

    // Draw Full-Width Line Chart
    if (stats.chart) {
      setTimeout(() => {
        drawDailyRevenueChart(stats.chart.labels || [], stats.chart.data || []);
      }, 50);
    }
  } catch (err) {
    console.error('Error loading dashboard stats:', err);
  }
}

function renderRecentOrdersTable(orders) {
  const tbody = document.getElementById('overviewRecentOrdersTable');
  if (!tbody) return;

  if (orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 2rem;">No orders recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = orders.map(o => `
    <tr>
      <td><span class="font-mono text-accent" style="font-weight: 700;">#${escapeHtml(o.orderNumber || o.id)}</span></td>
      <td>${escapeHtml(o.email || 'Guest')}</td>
      <td><strong style="color:#fff;">$${(o.total || 0).toFixed(2)}</strong></td>
      <td><span class="badge-method">${escapeHtml(o.paymentMethod || 'Crypto')}</span></td>
      <td><span class="pinks-status-pill status-completed"><i class="fa-solid fa-circle-check"></i> ${escapeHtml(o.status || 'COMPLETED')}</span></td>
      <td class="text-dim">${formatDate(o.createdAt)}</td>
    </tr>
  `).join('');
}

let adminRevenueChartInstance = null;

function drawDailyRevenueChart(labels, data) {
  const canvas = document.getElementById('dailyRevenueChart');
  if (!canvas) return;

  const peakPill = document.getElementById('chartPeakPill');
  const maxRevenue = data.length > 0 ? Math.max(...data, 0) : 0;
  if (peakPill) peakPill.textContent = `$${maxRevenue.toFixed(2)}`;

  const parent = canvas.parentElement;
  const parentWidth = parent ? (parent.clientWidth || parent.getBoundingClientRect().width) : 800;
  const width = Math.max(parentWidth, 300);
  const height = 240;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  // Use Chart.js if loaded
  if (typeof Chart !== 'undefined') {
    try {
      if (adminRevenueChartInstance) {
        adminRevenueChartInstance.destroy();
      }
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, 'rgba(255, 37, 92, 0.45)');
      gradient.addColorStop(1, 'rgba(255, 37, 92, 0.0)');

      adminRevenueChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Daily Revenue',
            data: data,
            borderColor: '#ff255c',
            borderWidth: 3,
            backgroundColor: gradient,
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#ff255c',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 4.5,
            pointHoverRadius: 7
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 600 },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#111214',
              borderColor: 'rgba(255,255,255,0.15)',
              borderWidth: 1,
              titleFont: { family: 'Inter Tight', size: 12 },
              bodyFont: { family: 'JetBrains Mono', size: 13, weight: 'bold' },
              bodyColor: '#ff255c',
              padding: 10,
              displayColors: false,
              callbacks: {
                label: (context) => `Revenue: $${Number(context.raw || 0).toFixed(2)}`
              }
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(255, 255, 255, 0.04)' },
              ticks: { color: '#8a8d85', font: { family: 'JetBrains Mono', size: 10 } }
            },
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.04)' },
              ticks: {
                color: '#8a8d85',
                font: { family: 'JetBrains Mono', size: 10 },
                callback: (val) => '$' + val
              },
              beginAtZero: true
            }
          }
        }
      });
      return;
    } catch (e) {
      console.warn('Chart.js init fallback to 2D Canvas:', e);
    }
  }

  // Pure 2D Canvas Renderer (Guaranteed Fallback)
  const padding = { top: 25, right: 25, bottom: 35, left: 55 };
  const graphW = width - padding.left - padding.right;
  const graphH = height - padding.top - padding.bottom;
  const maxVal = Math.max(...data, 50);

  // Background Grid Lines & Y Axis Labels
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#8a8d85';
  ctx.font = '10px "JetBrains Mono"';
  ctx.textAlign = 'right';

  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const y = padding.top + (graphH / steps) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();

    const val = maxVal - (maxVal / steps) * i;
    ctx.fillText(`$${Math.round(val)}`, padding.left - 8, y + 3);
  }

  if (!data || data.length === 0) return;

  // Calculate Points
  const points = data.map((val, idx) => {
    const x = padding.left + (graphW / Math.max(data.length - 1, 1)) * idx;
    const y = padding.top + graphH - (val / maxVal) * graphH;
    return { x, y, val, label: labels[idx] || '' };
  });

  // Gradient Area Fill
  const areaGradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  areaGradient.addColorStop(0, 'rgba(255, 37, 92, 0.4)');
  areaGradient.addColorStop(1, 'rgba(255, 37, 92, 0.0)');

  ctx.beginPath();
  ctx.moveTo(points[0].x, height - padding.bottom);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, height - padding.bottom);
  ctx.closePath();
  ctx.fillStyle = areaGradient;
  ctx.fill();

  // Smooth Bezier Curve Line
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  ctx.strokeStyle = '#ff255c';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Draw Data Dots & X Axis Labels
  ctx.textAlign = 'center';
  points.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ff255c';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#8a8d85';
    ctx.font = '10px "JetBrains Mono"';
    ctx.fillText(p.label, p.x, height - 10);
  });
}

// Window Resize Redraw
window.addEventListener('resize', () => {
  const overviewTab = document.getElementById('tab-overview');
  if (overviewTab && overviewTab.classList.contains('active')) {
    loadAdminDashboardData();
  }
});

// Products Management
async function loadAdminProducts() {
  try {
    const res = await fetch('/api/admin/products', { credentials: 'include' });
    if (!res.ok) return;
    allAdminProducts = await res.json();
    renderAdminProducts(allAdminProducts);
  } catch (err) {
    console.error('Error loading products:', err);
  }
}

function renderAdminProducts(products) {
  const grid = document.getElementById('adminProductGrid');
  if (!grid) return;

  grid.innerHTML = products.map(p => `
    <div class="admin-product-card ${p.hidden ? 'is-hidden' : ''}">
      <div class="admin-card-art">
        <img src="${p.art}" alt="${escapeHtml(p.title)}">
        <span class="stock-badge ${p.stockCount > 0 ? '' : 'out'}">${p.stockCount} Keys Available</span>
      </div>
      <div class="admin-card-body">
        <h4 style="margin:0 0 0.5rem; font-size: 1rem; color:#fff;">${escapeHtml(p.title)}</h4>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.75rem;">
          <span style="font-size: 1.25rem; font-weight: 800; color: var(--accent);">$${(p.price || 0).toFixed(2)}</span>
          <span class="cat-pill">${escapeHtml(p.category || 'hourly')}</span>
        </div>
        <div class="admin-card-actions">
          <button class="btn btn-glass btn-sm" onclick="editProduct('${p.id}')">
            <i class="fa-solid fa-pen-to-square"></i> Edit
          </button>
          <button class="btn btn-ghost btn-sm text-red" onclick="deleteProduct('${p.id}')">
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function openProductModal(product = null) {
  const modal = document.getElementById('productModal');
  const title = document.getElementById('productModalTitle');
  if (!modal) return;

  if (product) {
    title.textContent = 'Edit Product';
    document.getElementById('modalProductId').value = product.id;
    document.getElementById('modalTitle').value = product.title || '';
    document.getElementById('modalPrice').value = product.price || '';
    document.getElementById('modalCategory').value = product.category || 'hourly';
    document.getElementById('modalPrefix').value = product.prefix || 'BOT-KEY';
    document.getElementById('modalArt').value = product.art || '';
    document.getElementById('modalDescription').value = product.description || '';
    document.getElementById('modalHidden').checked = Boolean(product.hidden);
    document.getElementById('modalKeysText').value = (product.stockKeys || []).join('\n');
  } else {
    title.textContent = 'Create New Product';
    document.getElementById('modalProductId').value = '';
    document.getElementById('productForm').reset();
    document.getElementById('modalHidden').checked = false;
  }
  modal.classList.add('active');
}

function closeProductModal() {
  const modal = document.getElementById('productModal');
  if (modal) modal.classList.remove('active');
}

function editProduct(id) {
  const prod = allAdminProducts.find(p => p.id === id);
  if (prod) openProductModal(prod);
}

async function handleProductFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('modalProductId').value;
  const payload = {
    title: document.getElementById('modalTitle').value.trim(),
    price: parseFloat(document.getElementById('modalPrice').value) || 0,
    category: document.getElementById('modalCategory').value,
    prefix: document.getElementById('modalPrefix').value.trim(),
    art: document.getElementById('modalArt').value.trim() || 'assets/compact_pass_1h.jpg',
    description: document.getElementById('modalDescription').value.trim(),
    hidden: document.getElementById('modalHidden').checked,
    keysText: document.getElementById('modalKeysText').value
  };

  const url = id ? `/api/admin/products/${id}` : '/api/admin/products';
  const method = id ? 'PUT' : 'POST';
  const button = document.getElementById('saveProductBtn');
  const originalHtml = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.classList.add('is-loading');
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Syncing stock…';
  }

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) throw new Error(data.error || 'Product and stock could not be saved.');
    showToast(id ? 'Product and stock updated.' : 'Product and stock created.');
    closeProductModal();
    await loadAdminProducts();
  } catch (error) {
    showToast(error.message || 'Product and stock could not be saved.');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('is-loading');
      button.innerHTML = originalHtml;
    }
  }
}

async function deleteProduct(id) {
  if (!confirm('Are you sure you want to delete this product?')) return;
  const res = await fetch(`/api/admin/products/${id}`, { method: 'DELETE' });
  if (res.ok) {
    showToast('Product deleted');
    loadAdminProducts();
  }
}

// Users & Balances Management
async function loadAdminUsers() {
  try {
    const res = await fetch('/api/admin/users', { credentials: 'include' });
    if (!res.ok) return;
    allAdminUsers = await res.json();
    renderAdminUsers(allAdminUsers);
  } catch (err) {
    console.error('Error loading users:', err);
  }
}

function renderAdminUsers(users) {
  const tbody = document.getElementById('adminUsersTable');
  if (!tbody) return;

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:2rem;">No registered users.</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td><span class="font-mono text-accent">${escapeHtml(u.id)}</span></td>
      <td><strong style="color:#fff;">${escapeHtml(u.email)}</strong></td>
      <td><span class="role-badge ${u.role === 'ADMIN' ? 'admin' : 'user'}">${escapeHtml(u.role)}</span></td>
      <td><span style="color:var(--status-green); font-weight:800;">$${(u.balance || 0).toFixed(2)}</span></td>
      <td class="text-dim">${formatDate(u.createdAt)}</td>
      <td>
        <button class="btn btn-glass btn-sm" onclick="quickTopUp('${escapeHtml(u.email)}')">
          <i class="fa-solid fa-wallet"></i> Adjust Balance
        </button>
      </td>
    </tr>
  `).join('');
}

function openAdjustBalanceModal(email = '') {
  const modal = document.getElementById('adjustBalanceModal');
  if (modal) {
    document.getElementById('balanceUserEmail').value = email;
    document.getElementById('balanceAmount').value = '';
    modal.classList.add('active');
  }
}

function closeAdjustBalanceModal() {
  const modal = document.getElementById('adjustBalanceModal');
  if (modal) modal.classList.remove('active');
}

function quickTopUp(email) {
  openAdjustBalanceModal(email);
}

async function handleAdjustBalanceSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('balanceUserEmail').value.trim();
  const amount = parseFloat(document.getElementById('balanceAmount').value);

  if (!email || isNaN(amount)) {
    showToast('Valid user email and amount required.');
    return;
  }

  const res = await fetch('/api/admin/users/balance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, amount })
  });

  if (res.ok) {
    showToast(`Updated balance for ${email}!`);
    closeAdjustBalanceModal();
    loadAdminUsers();
  } else {
    const data = await res.json();
    showToast(data.error || 'Failed to update balance.');
  }
}

// Orders List
async function loadAdminOrders() {
  try {
    const res = await fetch('/api/admin/orders', { credentials: 'include' });
    if (!res.ok) return;
    allAdminOrders = await res.json();
    renderAdminOrders(allAdminOrders);
  } catch (err) {
    console.error('Error loading orders:', err);
  }
}

function renderAdminOrders(orders) {
  const tbody = document.getElementById('adminOrdersTable');
  if (!tbody) return;

  if (orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding:2rem;">No orders.</td></tr>`;
    return;
  }

  tbody.innerHTML = orders.map(o => {
    const itemsList = (o.purchasedItems || o.items || []).map(i => `
      <div style="font-size:0.8125rem;">
        <span style="color:#fff;">${escapeHtml(i.name || i.title)}</span>
        ${i.credentials ? `<br><code class="delivered-key-code" onclick="copyToClipboard('${escapeHtml(i.credentials)}')">${escapeHtml(i.credentials)}</code>` : ''}
      </div>
    `).join('');

    return `
      <tr>
        <td><span class="font-mono text-accent" style="font-weight:700;">#${escapeHtml(o.orderNumber || o.id)}</span></td>
        <td>${escapeHtml(o.email)}</td>
        <td>${itemsList}</td>
        <td><strong style="color:#fff;">$${(o.total || 0).toFixed(2)}</strong></td>
        <td><span class="badge-method">${escapeHtml(o.paymentMethod || 'Crypto')}</span></td>
        <td><span class="pinks-status-pill status-completed"><i class="fa-solid fa-circle-check"></i> ${escapeHtml(o.status || 'COMPLETED')}</span></td>
        <td class="text-dim">${formatDate(o.createdAt)}</td>
      </tr>
    `;
  }).join('');
}

// Support Tickets Management
async function loadAdminTickets() {
  try {
    const res = await fetch('/api/admin/tickets', { credentials: 'include' });
    if (!res.ok) return;
    allAdminTickets = await res.json();
    renderAdminTickets(allAdminTickets);
  } catch (err) {
    console.error('Error loading admin tickets:', err);
  }
}

function renderAdminTickets(tickets) {
  const tbody = document.getElementById('adminTicketsTable');
  if (!tbody) return;

  if (tickets.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding:2rem;">No customer support tickets.</td></tr>`;
    return;
  }

  tbody.innerHTML = tickets.map(t => `
    <tr>
      <td><span class="font-mono text-accent" style="font-weight:700;">#${escapeHtml(t.ticketNumber || t.id)}</span></td>
      <td><strong style="color:#fff;">${escapeHtml(t.email)}</strong></td>
      <td>${escapeHtml(t.subject)}</td>
      <td><span class="cat-pill">${escapeHtml(t.category)}</span></td>
      <td>
        <span class="pinks-status-pill ${t.status === 'REPLIED' ? 'status-completed' : 'status-open'}">
          ${escapeHtml(t.status)}
        </span>
      </td>
      <td class="text-dim">${formatDate(t.updatedAt || t.createdAt)}</td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="openAdminTicketModal('${t.id}')">
          <i class="fa-solid fa-reply"></i> Reply
        </button>
      </td>
    </tr>
  `).join('');
}

function openAdminTicketModal(ticketId) {
  activeAdminTicketId = ticketId;
  const ticket = allAdminTickets.find(t => t.id === ticketId);
  if (!ticket) return;

  const modal = document.getElementById('adminTicketModal');
  if (!modal) return;

  document.getElementById('adminTicketTitle').textContent = `Ticket #${ticket.ticketNumber} — ${ticket.subject}`;
  document.getElementById('adminTicketStatusSelect').value = ticket.status || 'REPLIED';

  const threadEl = document.getElementById('adminTicketThread');
  if (threadEl) {
    threadEl.innerHTML = (ticket.messages || []).map(m => `
      <div class="ticket-msg-bubble ${m.senderRole === 'ADMIN' ? 'admin' : 'user'}">
        <div class="ticket-msg-meta">
          <span class="ticket-msg-author">${escapeHtml(m.sender)} ${m.senderRole === 'ADMIN' ? '<span class="role-badge admin">STAFF</span>' : ''}</span>
          <span class="ticket-msg-time">${formatDate(m.createdAt)}</span>
        </div>
        <div class="ticket-msg-text">${escapeHtml(m.text)}</div>
      </div>
    `).join('');
  }

  document.getElementById('adminTicketReplyText').value = '';
  modal.classList.add('active');
}

function closeAdminTicketModal() {
  const modal = document.getElementById('adminTicketModal');
  if (modal) modal.classList.remove('active');
}

async function handleAdminTicketReplySubmit(e) {
  e.preventDefault();
  if (!activeAdminTicketId) return;

  const text = document.getElementById('adminTicketReplyText').value.trim();
  const status = document.getElementById('adminTicketStatusSelect').value;

  try {
    const res = await fetch(`/api/admin/tickets/${activeAdminTicketId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, status })
    });
    if (res.ok) {
      showToast('Reply sent to customer!');
      closeAdminTicketModal();
      loadAdminTickets();
    } else {
      showToast('Failed to send reply.');
    }
  } catch (err) {
    showToast('Error submitting reply.');
  }
}

// Audit Logs
async function loadAdminAuditLogs() {
  try {
    const res = await fetch('/api/admin/audit-logs', { credentials: 'include' });
    if (!res.ok) return;
    const logs = await res.json();
    renderAdminAuditLogs(logs);
  } catch (err) {
    console.error('Error loading audit logs:', err);
  }
}

function renderAdminAuditLogs(logs) {
  const tbody = document.getElementById('adminAuditTable');
  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:2rem;">No audit logs.</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map(l => `
    <tr>
      <td class="text-dim">${formatDate(l.createdAt)}</td>
      <td><strong style="color:#fff;">${escapeHtml(l.adminEmail)}</strong></td>
      <td><span class="cat-pill">${escapeHtml(l.action)}</span></td>
      <td>${escapeHtml(l.details)}</td>
      <td class="font-mono text-dim">${escapeHtml(l.ip)}</td>
    </tr>
  `).join('');
}

// Helper Utilities
function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
  showToast('Key copied to clipboard!');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(msg) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--status-green);"></i> <span>${escapeHtml(msg)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
  }, 2500);
}

// ==========================================
// VOUCHERS & GIFT CODE MANAGEMENT
// ==========================================

let allAdminVouchers = [];
let voucherFilter = 'all';

async function loadAdminVouchers() {
  try {
    const res = await fetch('/api/admin/vouchers', { credentials: 'include' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load vouchers.');

    allAdminVouchers = data.vouchers || [];
    renderVouchersSection();
  } catch (err) {
    showToast(err.message || 'Error loading vouchers.');
  }
}

function renderVouchersSection() {
  const totalEl = document.getElementById('statTotalVouchers');
  const activeEl = document.getElementById('statActiveVouchers');
  const redeemedEl = document.getElementById('statRedeemedVouchers');
  const valueEl = document.getElementById('statTotalVoucherValue');

  const total = allAdminVouchers.length;
  const active = allAdminVouchers.filter(v => !v.isUsed).length;
  const redeemed = allAdminVouchers.filter(v => v.isUsed).length;
  const totalVal = allAdminVouchers.reduce((acc, v) => acc + Number(v.amount || 0), 0);

  if (totalEl) totalEl.textContent = total;
  if (activeEl) activeEl.textContent = active;
  if (redeemedEl) redeemedEl.textContent = redeemed;
  if (valueEl) valueEl.textContent = `$${totalVal.toFixed(2)}`;

  renderVouchersTable();
}

function filterVouchersTable(filter, btn) {
  voucherFilter = filter;
  if (btn && btn.parentElement) {
    const buttons = btn.parentElement.querySelectorAll('button');
    buttons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  renderVouchersTable();
}

function renderVouchersTable() {
  const tbody = document.getElementById('adminVouchersTable');
  if (!tbody) return;

  let list = allAdminVouchers;
  if (voucherFilter === 'active') {
    list = list.filter(v => !v.isUsed);
  } else if (voucherFilter === 'redeemed') {
    list = list.filter(v => v.isUsed);
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-dim);">No voucher codes found.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(v => `
    <tr>
      <td>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <strong style="font-family: 'JetBrains Mono', Consolas, monospace; font-size:0.95rem; color:#fff;">${escapeHtml(v.code)}</strong>
          <button class="btn btn-xs btn-glass" onclick="copyToClipboard('${escapeHtml(v.code)}')" title="Copy code"><i class="fa-regular fa-copy"></i></button>
        </div>
      </td>
      <td style="font-weight:700; color:var(--accent);">$${Number(v.amount || 0).toFixed(2)} USD</td>
      <td>
        ${v.isUsed
          ? `<span class="badge badge-secondary" style="background:rgba(255,255,255,0.1); color:#a0a0b0;">REDEEMED</span>`
          : `<span class="badge badge-success" style="background:rgba(34,197,94,0.15); color:#22c55e; border:1px solid rgba(34,197,94,0.3);">ACTIVE</span>`
        }
      </td>
      <td>${v.usedBy ? `<span style="color:#fff; font-weight:600;">${escapeHtml(v.usedBy)}</span>` : '<span style="color:var(--text-dim);">&mdash;</span>'}</td>
      <td style="font-size:0.8rem; color:var(--text-dim);">${v.createdAt ? new Date(v.createdAt).toLocaleDateString() : '&mdash;'}</td>
      <td>
        <button class="btn btn-xs btn-danger" onclick="handleDeleteVoucher('${escapeHtml(v.code)}')" title="Delete voucher"><i class="fa-solid fa-trash"></i> Delete</button>
      </td>
    </tr>
  `).join('');
}

async function handleCreateVouchers(event) {
  event.preventDefault();
  const amount = Number(document.getElementById('voucherAmount').value);
  const prefix = document.getElementById('voucherPrefix').value.trim();
  const count = parseInt(document.getElementById('voucherCount').value || '1', 10);

  if (isNaN(amount) || amount <= 0) return showToast('Enter a valid voucher amount.');
  if (count < 1 || count > 50) return showToast('Count must be between 1 and 50.');

  startTopProgress();
  showGlobalLoading('Generating vouchers...');

  try {
    const res = await fetch('/api/admin/vouchers/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ amount, prefix, count })
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create vouchers.');

    showToast(`Generated ${data.vouchers.length} voucher code(s)!`);
    document.getElementById('createVoucherForm').reset();
    document.getElementById('voucherCount').value = '1';
    await loadAdminVouchers();
  } catch (err) {
    showToast(err.message || 'Error generating vouchers.');
  } finally {
    finishTopProgress();
    hideGlobalLoading();
  }
}

async function handleDeleteVoucher(code) {
  if (!confirm(`Are you sure you want to delete voucher code "${code}"?`)) return;

  startTopProgress();
  showGlobalLoading('Deleting voucher...');
  try {
    const res = await fetch('/api/admin/vouchers/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete voucher.');

    showToast(`Voucher ${code} deleted.`);
    await loadAdminVouchers();
  } catch (err) {
    showToast(err.message || 'Error deleting voucher.');
  } finally {
    finishTopProgress();
    hideGlobalLoading();
  }
}

// Payment Settings Management
async function loadAdminPaymentSettings() {
  try {
    const res = await fetch('/api/admin/payment-settings', { credentials: 'include' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load payment settings.');

    const cartInput = document.getElementById('nowpaymentsCartApiKey');
    const balanceInput = document.getElementById('nowpaymentsBalanceApiKey');
    const secretInput = document.getElementById('nowpaymentsIpnSecret');
    const webhookInput = document.getElementById('nowpaymentsWebhookUrl');

    if (cartInput) cartInput.value = data.cartApiKey || '';
    if (balanceInput) balanceInput.value = data.balanceApiKey || '';
    if (secretInput) secretInput.value = data.ipnSecret || '';
    if (webhookInput) webhookInput.value = data.webhookUrl || 'https://bulkotp.com/api/payments/nowpayments/ipn';
  } catch (err) {
    showToast(err.message || 'Error loading payment settings.', 'error');
  }
}

async function handleSavePaymentSettings(event) {
  event.preventDefault();

  const cartApiKey = (document.getElementById('nowpaymentsCartApiKey')?.value || '').trim();
  const balanceApiKey = (document.getElementById('nowpaymentsBalanceApiKey')?.value || '').trim();
  const ipnSecret = (document.getElementById('nowpaymentsIpnSecret')?.value || '').trim();

  if (!cartApiKey && !balanceApiKey) {
    showToast('Please enter at least one NOWPayments API key.', 'error');
    return;
  }

  if (!ipnSecret) {
    showToast('⚠️ IPN Secret Key is required to enable automatic webhook payment confirmation.', 'error');
    return;
  }

  startTopProgress();
  showGlobalLoading('Testing & verifying NOWPayments API keys...');

  try {
    const res = await fetch('/api/admin/payment-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ cartApiKey, balanceApiKey, ipnSecret })
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save payment settings.');

    showToast(data.message || 'Payment gateway settings verified and saved successfully!', 'success');
    await loadAdminPaymentSettings();
  } catch (err) {
    showToast(err.message || 'Error saving payment settings.', 'error');
  } finally {
    finishTopProgress();
    hideGlobalLoading();
  }
}

async function handleDeletePaymentSettings() {
  if (!confirm('Are you sure you want to delete and reset your NOWPayments API keys?')) return;

  startTopProgress();
  showGlobalLoading('Removing payment API keys...');

  try {
    const res = await fetch('/api/admin/payment-settings', {
      method: 'DELETE',
      credentials: 'include'
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete payment settings.');

    const cartInput = document.getElementById('nowpaymentsCartApiKey');
    const balanceInput = document.getElementById('nowpaymentsBalanceApiKey');
    const secretInput = document.getElementById('nowpaymentsIpnSecret');
    if (cartInput) cartInput.value = '';
    if (balanceInput) balanceInput.value = '';
    if (secretInput) secretInput.value = '';

    showToast(data.message || 'Payment gateway API keys removed.', 'success');
  } catch (err) {
    showToast(err.message || 'Error deleting payment settings.', 'error');
  } finally {
    finishTopProgress();
    hideGlobalLoading();
  }
}

function copyWebhookUrl() {
  const input = document.getElementById('nowpaymentsWebhookUrl');
  if (input && input.value) {
    navigator.clipboard.writeText(input.value);
    showToast('Webhook URL copied to clipboard!', 'success');
  }
}
