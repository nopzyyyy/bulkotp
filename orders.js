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

  function formatRemaining(expiresAtStr) {
    if (!expiresAtStr) return '60m window';
    const diff = new Date(expiresAtStr).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const totalSecs = Math.floor(diff / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}m ${String(secs).padStart(2, '0')}s remaining`;
  }

  function startOrderCountdowns() {
    function tick() {
      document.querySelectorAll('.order-countdown-text').forEach((el) => {
        const expiresAt = el.dataset.expires;
        if (!expiresAt) return;
        const diff = new Date(expiresAt).getTime() - Date.now();
        if (diff <= 0) {
          el.textContent = 'Expired';
          el.style.color = '#ef4444';
        } else {
          el.textContent = formatRemaining(expiresAt);
        }
      });
    }
    tick();
    setInterval(tick, 1000);
  }

  function renderOrder(order) {
    const items = Array.isArray(order.purchasedItems) && order.purchasedItems.length ? order.purchasedItems : (order.items || []);
    const status = String(order.status || 'PROCESSING').toUpperCase();
    const isPending = status === 'AWAITING_PAYMENT' || status === 'PENDING';
    const expiresAt = order.expiresAt || new Date(new Date(order.createdAt || Date.now()).getTime() + 60 * 60 * 1000).toISOString();

    return `
      <article class="order-history-card">
        <header>
          <div><small>Order number</small><strong>#${escapeHtml(order.orderNumber || order.id)}</strong></div>
          <div style="display: flex; align-items: center; gap: 8px;">
            ${isPending ? `
              <span style="background: rgba(245, 158, 11, 0.12); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35); padding: 0.25rem 0.65rem; border-radius: 50px; font-size: 0.78rem; font-weight: 700; display: inline-flex; align-items: center; gap: 5px;">
                <i class="fa-regular fa-clock"></i>
                <span class="order-countdown-text" data-expires="${escapeHtml(expiresAt)}">${escapeHtml(formatRemaining(expiresAt))}</span>
              </span>` : ''}
            <span class="order-status ${statusClass(status)}"><i class="fa-solid fa-circle"></i>${escapeHtml(status.replaceAll('_', ' '))}</span>
          </div>
        </header>
        <div class="order-meta-row">
          <span><i class="fa-regular fa-calendar"></i>${escapeHtml(formatDate(order.createdAt))}</span>
          <span><i class="fa-solid fa-wallet"></i>${escapeHtml(order.paymentMethod || 'Store Balance')}</span>
          <strong>$${Number(order.total || 0).toFixed(2)}</strong>
        </div>
        ${isPending && order.invoiceUrl ? `
          <div style="background: #14141e; border: 1px solid #252535; border-radius: 10px; padding: 0.85rem 1.15rem; margin: 0.75rem 0; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div style="font-size: 0.85rem; color: #a0a0b8;">
              <i class="fa-brands fa-bitcoin" style="color: #ff255c; margin-right: 5px;"></i>
              Crypto invoice generated. Complete payment before the window expires.
            </div>
            <a href="${escapeHtml(order.invoiceUrl)}" target="_blank" class="btn btn-primary btn-sm" style="background: linear-gradient(135deg, #ff255c, #d91b4b); color: #fff; font-weight: 700; text-decoration: none; border-radius: 8px; padding: 0.5rem 1rem; display: inline-flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Pay Crypto Invoice
            </a>
          </div>` : ''}
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
        startOrderCountdowns();
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
