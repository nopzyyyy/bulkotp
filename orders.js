(() => {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function statusClass(status) {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'COMPLETED') return 'status-completed';
    if (normalized.includes('PAYMENT') || normalized === 'PENDING') return 'status-pending';
    if (normalized === 'FAILED' || normalized === 'EXPIRED') return 'status-failed';
    return 'status-processing';
  }

  function renderOrder(order) {
    const items = Array.isArray(order.purchasedItems) && order.purchasedItems.length ? order.purchasedItems : (order.items || []);
    const status = String(order.status || 'PROCESSING').toUpperCase();
    return `
      <article class="order-history-card">
        <header>
          <div><small>Order number</small><strong>#${escapeHtml(order.orderNumber || order.id)}</strong></div>
          <span class="order-status ${statusClass(status)}"><i class="fa-solid fa-circle"></i>${escapeHtml(status.replaceAll('_', ' '))}</span>
        </header>
        <div class="order-meta-row">
          <span><i class="fa-regular fa-calendar"></i>${escapeHtml(formatDate(order.createdAt))}</span>
          <span><i class="fa-solid fa-wallet"></i>${escapeHtml(order.paymentMethod || 'Store Balance')}</span>
          <strong>$${Number(order.total || 0).toFixed(2)}</strong>
        </div>
        <div class="order-items-list">
          ${items.map((item) => `
            <div class="order-line-item">
              <div><span class="order-item-icon"><i class="fa-solid fa-key"></i></span><p><strong>${escapeHtml(item.name || item.title || 'Access key')}</strong><small>${item.qty ? `${Number(item.qty)} × $${Number(item.price || 0).toFixed(2)}` : 'Digital delivery'}</small></p></div>
              ${item.credentials ? `
                <div class="order-key-row"><code>${escapeHtml(item.credentials)}</code><button type="button" class="btn btn-primary btn-sm" data-copy-key="${escapeHtml(item.credentials)}"><i class="fa-regular fa-copy"></i> Copy key</button></div>
              ` : `<div class="order-awaiting"><i class="fa-solid fa-clock"></i>${status === 'AWAITING_PAYMENT' ? 'Waiting for payment confirmation' : 'Delivery is being prepared'}</div>`}
            </div>`).join('')}
        </div>
      </article>`;
  }

  function renderSignedOut() {
    document.getElementById('ordersPageList').innerHTML = `
      <div class="orders-empty-state">
        <span><i class="fa-solid fa-lock"></i></span>
        <h2>Sign in to view your orders</h2>
        <p>Your delivered keys are securely attached to your customer account.</p>
        <a class="btn btn-primary" href="login.html?redirect=/orders.html">Sign In</a>
      </div>`;
  }

  async function loadOrders() {
    const list = document.getElementById('ordersPageList');
    try {
      const response = await fetch('/api/orders', { credentials: 'same-origin' });
      if (response.status === 401) return renderSignedOut();
      const orders = await response.json();
      if (!response.ok) throw new Error(orders.error || 'Unable to load orders.');
      if (!Array.isArray(orders) || orders.length === 0) {
        list.innerHTML = `<div class="orders-empty-state"><span><i class="fa-solid fa-box-open"></i></span><h2>No orders yet</h2><p>Your purchases and delivered keys will appear here.</p><a class="btn btn-primary" href="index.html">Browse passes</a></div>`;
      } else {
        list.innerHTML = orders.map(renderOrder).join('');
      }
      document.getElementById('ordersTotalCount').textContent = String(orders.length);
      document.getElementById('ordersDeliveredCount').textContent = String(orders.reduce((sum, order) => sum + (order.purchasedItems || []).filter((item) => item.credentials).length, 0));
      document.getElementById('ordersPendingCount').textContent = String(orders.filter((order) => String(order.status).includes('PAYMENT') || order.status === 'PENDING').length);
    } catch (error) {
      list.innerHTML = `<div class="orders-empty-state"><span><i class="fa-solid fa-triangle-exclamation"></i></span><h2>Could not load orders</h2><p>${escapeHtml(error.message)}</p><button class="btn btn-primary" type="button" onclick="location.reload()">Try again</button></div>`;
    }
  }

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-copy-key]');
    if (!button) return;
    try {
      await navigator.clipboard.writeText(button.dataset.copyKey);
      const old = button.innerHTML;
      button.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
      setTimeout(() => { button.innerHTML = old; }, 1400);
    } catch (_) {
      button.textContent = 'Copy failed';
    }
  });

  document.addEventListener('DOMContentLoaded', loadOrders);
})();
