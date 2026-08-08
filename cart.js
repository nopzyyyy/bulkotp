let pageCart = [];
let selectedCartPaymentMethod = 'balance';
let selectedCartCryptoCoin = 'usdt_trc20';
let cartCurrentUser = null;
let cartPaymentConfig = { nowPayments: { enabled: false } };
let cartCatalog = new Map();
let cartStockConfirmed = false;
let cartStockRequestInFlight = false;

document.addEventListener('DOMContentLoaded', () => {
  loadCartFromLocalStorage();
  renderCartPage();
  fetchCartPaymentConfig();
  syncCartWithBackend();
  window.setInterval(() => syncCartWithBackend({ quiet: true }), 12000);
  window.addEventListener('focus', () => syncCartWithBackend({ quiet: true }));
  window.addEventListener('pageshow', () => syncCartWithBackend({ quiet: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncCartWithBackend({ quiet: true });
  });
  if (typeof initBackgroundParticles === 'function') initBackgroundParticles();
});

document.addEventListener('site:auth', (event) => {
  cartCurrentUser = event.detail.user;
  const email = document.getElementById('cartAccountEmail');
  const balance = document.getElementById('cartBalanceBadge');
  if (email) email.textContent = cartCurrentUser?.email || 'Sign in required';
  if (balance) balance.textContent = `$${Number(cartCurrentUser?.balance || 0).toFixed(2)} balance`;
});

const LEGACY_ID_MAP = {
  'compact-1h': 'hourly-1h',
  'extended-3h': 'hourly-3h',
  'daylong-24h': 'daily-1d',
  'multiday-3d': 'daily-3d',
  'biweekly-2w': 'weekly-2w',
  'weekly-1w': 'weekly-1w',
  'monthly-1m': 'monthly-1m',
  'monthly-3m': 'monthly-3m',
  'monthly-6m': 'monthly-6m',
  'yearly-1y': 'yearly-1y'
};

function loadCartFromLocalStorage() {
  try {
    const raw = localStorage.getItem('bulk_otp_cart');
    const parsed = raw ? JSON.parse(raw) : [];
    pageCart = (Array.isArray(parsed) ? parsed : []).map(item => {
      const canonicalId = LEGACY_ID_MAP[item.id] || item.id;
      return {
        ...item,
        id: canonicalId,
        qty: Math.max(1, Number(item.qty || 1)),
        title: item.title || item.shortTitle || 'OTP BOT Pass Key',
        shortTitle: item.shortTitle || item.title || 'Access Pass',
        price: Number(item.price || 17.00),
        duration: item.duration || 'PASS',
        art: item.art || 'assets/pass_1h.png',
        stock: Number(item.stock || 10)
      };
    });
  } catch (_) {
    pageCart = [];
  }
}

function saveCartToLocalStorage() {
  localStorage.setItem('bulk_otp_cart', JSON.stringify(pageCart));
  window.SiteShell?.updateCartBadges();
}

function formatMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

function cartItemHasIssue(item) {
  if (!cartStockConfirmed) return false;
  return Boolean(item.unavailable) || Number(item.stock || 0) < Number(item.qty || 0);
}

function getCartStockIssues() {
  return pageCart.filter(cartItemHasIssue);
}

function setCartStockStatus(kind, message) {
  const status = document.getElementById('cartStockSyncStatus');
  if (!status) return;
  if (!pageCart || !pageCart.length) {
    status.style.display = 'none';
    return;
  }
  status.style.display = 'flex';
  const icons = {
    checking: 'fa-solid fa-rotate fa-spin',
    ready: 'fa-solid fa-circle-check',
    warning: 'fa-solid fa-triangle-exclamation'
  };
  status.className = `cart-stock-sync ${kind}`;
  status.innerHTML = `<i class="${icons[kind] || icons.ready}"></i><span>${escapeHtml(message)}</span>`;
}

async function syncCartWithBackend({ quiet = false } = {}) {
  if (cartStockRequestInFlight) return cartStockConfirmed;
  cartStockRequestInFlight = true;
  if (!quiet && pageCart.length > 0) setCartStockStatus('checking', 'Checking live stock…');

  try {
    const response = await fetch('/api/products', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Stock request failed (${response.status})`);
    const products = await response.json();
    if (!Array.isArray(products)) throw new Error('Invalid catalog response');

    cartCatalog = new Map(products.map(product => [product.id, product]));
    cartStockConfirmed = true;
    const previous = JSON.stringify(pageCart);
    pageCart = pageCart.map(item => {
      const canonicalId = LEGACY_ID_MAP[item.id] || item.id;
      const live = cartCatalog.get(canonicalId) || cartCatalog.get(item.id);
      if (live) {
        return {
          ...item,
          id: live.id,
          title: live.title || item.title || 'OTP BOT Access Pass',
          shortTitle: live.shortTitle || live.title || item.shortTitle || 'Access Pass',
          duration: live.duration || item.duration || 'PASS',
          price: Number(live.price ?? item.price ?? 17),
          art: live.art || item.art || 'assets/pass_1h.png',
          stock: Number(live.stock ?? 10),
          unavailable: false
        };
      }
      return {
        ...item,
        id: canonicalId,
        title: item.title || 'OTP BOT Access Pass',
        shortTitle: item.shortTitle || 'Access Pass',
        duration: item.duration || 'PASS',
        price: Number(item.price || 17),
        art: item.art || 'assets/pass_1h.png',
        stock: Number(item.stock || 10),
        unavailable: false
      };
    });
    if (JSON.stringify(pageCart) !== previous) saveCartToLocalStorage();
    renderCartPage();

    setCartStockStatus('ready', 'Prices and stock are synced with the store.');
    return true;
  } catch (error) {
    cartStockConfirmed = false;
    setCartStockStatus('warning', 'Live stock could not refresh. Availability will be checked securely at payment.');
    if (!quiet) console.warn('Cart stock sync unavailable.', error);
    updateCheckoutButtonState();
    return false;
  } finally {
    cartStockRequestInFlight = false;
  }
}

async function fetchCartPaymentConfig() {
  try {
    const response = await fetch('/api/payments/config', { cache: 'no-store' });
    if (response.ok) cartPaymentConfig = await response.json();
  } catch (_) {
    cartPaymentConfig = { nowPayments: { enabled: true } };
  }

  const option = document.getElementById('cartCryptoPaymentOption');
  const status = document.getElementById('cartCryptoOptionStatus');
  if (option) {
    option.disabled = false;
    option.classList.remove('is-disabled');
    option.removeAttribute('aria-disabled');
  }
  if (status) status.textContent = 'USDT, BTC, LTC, ETH, SOL';
}

function renderCartPage() {
  const container = document.getElementById('cartPageItemsList');
  const badge = document.getElementById('cartItemCountBadge');
  const subtotal = document.getElementById('cartSubtotalText');
  const total = document.getElementById('cartTotalText');
  if (!container) return;

  if (!pageCart.length) {
    container.innerHTML = `
      <div class="cart-empty-state">
        <span><i class="fa-solid fa-cart-shopping"></i></span>
        <h3>Your cart is empty</h3>
        <p>Choose an access pass to start your order.</p>
        <a href="index.html" class="btn btn-primary"><i class="fa-solid fa-store"></i> Browse passes</a>
      </div>`;
    if (badge) badge.textContent = '0 Items';
    if (subtotal) subtotal.textContent = '$0.00';
    if (total) total.textContent = '$0.00';
    setCartStockStatus('ready', 'Add a pass to begin checkout.');
    updateCheckoutButtonState();
    return;
  }

  let totalAmount = 0;
  let itemCount = 0;
  container.innerHTML = pageCart.map(item => {
    const quantity = Math.max(1, Number(item.qty || 1));
    const stock = Math.max(0, Number(item.stock || 0));
    const issue = cartItemHasIssue(item);
    const unavailable = cartStockConfirmed && item.unavailable;
    const lineTotal = Number(item.price || 0) * quantity;
    totalAmount += lineTotal;
    itemCount += quantity;
    const stockLabel = unavailable
      ? 'No longer available'
      : (cartStockConfirmed ? `${stock} available` : 'Stock check pending');

    return `
      <article class="cart-page-item-card${issue ? ' has-stock-issue' : ''}">
        <img src="${escapeHtml(item.art || 'assets/brand_logo.png')}" alt="${escapeHtml(item.title)}" class="cart-page-item-img">
        <div class="cart-item-copy">
          <span class="subtitle">${escapeHtml(item.duration || 'PASS')}</span>
          <h4>${escapeHtml(item.shortTitle || item.title)}</h4>
          <span class="cart-item-unit-price">$${formatMoney(item.price)} per key</span>
          <span class="cart-item-stock${issue ? ' issue' : ''}"><i class="fa-solid ${issue ? 'fa-triangle-exclamation' : 'fa-box'}"></i>${escapeHtml(stockLabel)}</span>
        </div>
        <div class="cart-item-controls">
          <div class="quantity-input cart-quantity-control">
            <button type="button" class="quantity-btn" onclick="updateCartItemQty('${item.id}', -1)" aria-label="Decrease quantity"><i class="fa-solid fa-minus"></i></button>
            <span class="quantity-val" aria-label="Quantity">${quantity}</span>
            <button type="button" class="quantity-btn" onclick="updateCartItemQty('${item.id}', 1)" aria-label="Increase quantity" ${unavailable || (cartStockConfirmed && quantity >= stock) ? 'disabled' : ''}><i class="fa-solid fa-plus"></i></button>
          </div>
          <strong class="cart-line-total">$${formatMoney(lineTotal)}</strong>
          <button type="button" class="btn-icon cart-remove-button" onclick="removeCartPageItem('${item.id}')" title="Remove pass" aria-label="Remove pass"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </article>`;
  }).join('');

  if (badge) badge.textContent = `${itemCount} Item${itemCount === 1 ? '' : 's'}`;
  if (subtotal) subtotal.textContent = `$${formatMoney(totalAmount)}`;
  if (total) total.textContent = `$${formatMoney(totalAmount)}`;
  updateCheckoutButtonState();
}

function updateCheckoutButtonState() {
  const button = document.getElementById('cartCheckoutBtn');
  if (!button || button.classList.contains('is-loading')) return;
  const hasIssues = getCartStockIssues().length > 0;
  button.disabled = !pageCart.length || hasIssues;
  if (hasIssues) {
    button.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Fix stock issues to continue';
  } else {
    button.innerHTML = selectedCartPaymentMethod === 'crypto'
      ? '<i class="fa-brands fa-bitcoin"></i> Continue to Crypto Payment'
      : '<i class="fa-solid fa-bolt"></i> Pay with Store Balance';
  }
}

function updateCartItemQty(productId, change) {
  const item = pageCart.find(candidate => candidate.id === productId);
  if (!item) return;
  const nextQuantity = Number(item.qty || 1) + change;
  if (nextQuantity <= 0) return removeCartPageItem(productId);
  if (cartStockConfirmed && (item.unavailable || nextQuantity > Number(item.stock || 0))) {
    showToast(`Only ${Math.max(0, Number(item.stock || 0))} key${Number(item.stock || 0) === 1 ? '' : 's'} available.`);
    return;
  }
  item.qty = Math.min(25, nextQuantity);
  saveCartToLocalStorage();
  renderCartPage();
}

function removeCartPageItem(productId) {
  pageCart = pageCart.filter(item => item.id !== productId);
  saveCartToLocalStorage();
  renderCartPage();
  showToast('Pass removed from cart.');
}

function selectCartPaymentMethod(method, element) {
  if (!element || element.disabled || element.classList.contains('is-disabled')) return;
  selectedCartPaymentMethod = method;
  document.querySelectorAll('.checkout-payment-method').forEach(option => {
    const active = option === element;
    option.classList.toggle('active', active);
    option.setAttribute('aria-pressed', String(active));
  });
  const selectorWrap = document.getElementById('cartCryptoCoinSelectorWrap');
  if (selectorWrap) selectorWrap.style.display = method === 'crypto' ? 'block' : 'none';
  updateCheckoutButtonState();
}

async function processCartPageCheckout(event) {
  event.preventDefault();
  if (!pageCart.length) return showToast('Your cart is empty.');

  await syncCartWithBackend({ quiet: true });
  if (getCartStockIssues().length) {
    renderCartPage();
    showToast('Please fix the stock issues in your cart.');
    return;
  }

  cartCurrentUser = cartCurrentUser || window.SiteShell?.user || null;
  if (!cartCurrentUser) {
    showToast('Sign in before checking out.');
    window.setTimeout(() => { window.location.href = 'login.html?redirect=/cart.html'; }, 250);
    return;
  }

  const button = document.getElementById('cartCheckoutBtn');
  if (button) {
    button.disabled = true;
    button.classList.add('is-loading');
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Securing your order…';
  }

  try {
    const isCrypto = selectedCartPaymentMethod === 'crypto';
    const chosenCurrency = (document.getElementById('cartCryptoCurrencySelect')?.value || 'all').trim();
    const endpoint = isCrypto ? '/api/payments/nowpayments/invoice' : '/api/orders/checkout';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: pageCart.map(item => ({ productId: item.id, qty: item.qty })),
        paymentMethod: selectedCartPaymentMethod,
        payCurrency: chosenCurrency
      })
    });
    const data = await response.json().catch(() => ({}));

    if (response.ok && data.success && isCrypto && data.invoiceUrl) {
      // Hide cart and show Invoice Ready view
      const cartLayout = document.getElementById('cartContentLayout');
      const invoiceView = document.getElementById('cartInvoiceReadyView');
      const orderIdEl = document.getElementById('cartInvoiceOrderId');
      const totalEl = document.getElementById('cartInvoiceTotal');
      const payBtn = document.getElementById('cartInvoicePayBtn');
      const popupNotice = document.getElementById('cartPopupNotice');

      if (orderIdEl) orderIdEl.textContent = data.orderId || 'ORD-NEW';
      if (totalEl) totalEl.textContent = `$${Number(data.total || 0).toFixed(2)}`;
      if (payBtn) payBtn.href = data.invoiceUrl;

      if (cartLayout) cartLayout.style.display = 'none';
      if (invoiceView) invoiceView.style.display = 'block';

      // Open NOWPayments invoice in a new tab
      let payWindow = null;
      try {
        payWindow = window.open(data.invoiceUrl, '_blank', 'noopener,noreferrer');
      } catch (_) {
        payWindow = null;
      }

      if (popupNotice) {
        popupNotice.style.display = (!payWindow || payWindow.closed || typeof payWindow.closed === 'undefined') ? 'flex' : 'none';
      }

      // Clear Cart state
      pageCart = [];
      saveCartToLocalStorage();
      showToast('Order registered! Complete your crypto payment.');
      return;
    }
    if (response.ok && data.success && !isCrypto) {
      document.getElementById('cartContentLayout').style.display = 'none';
      const successView = document.getElementById('cartSuccessView');
      if (successView) {
        successView.style.display = 'block';
        successView.classList.add('payment-success-card');
      }
      pageCart = [];
      saveCartToLocalStorage();
      showToast('Payment Complete! 🎉');
      if (window.SiteShell?.refreshAuth) window.SiteShell.refreshAuth();

      // Animate progress bar fill
      setTimeout(() => {
        const barFill = document.getElementById('cartRedirectBarFill');
        if (barFill) barFill.style.width = '100%';
      }, 50);

      // Smooth redirect to Orders Page after 1.8s
      setTimeout(() => {
        window.location.href = 'orders.html';
      }, 1850);
      return;
    }

    showToast(data.error || 'Payment could not be completed.');
    if (response.status === 400) await syncCartWithBackend({ quiet: true });
  } catch (error) {
    console.error('Checkout error:', error);
    showToast('Could not connect to checkout. Please try again.');
  } finally {
    if (button) button.classList.remove('is-loading');
    updateCheckoutButtonState();
  }
}

function renderCartDispensedKeys(keys) {
  const container = document.getElementById('cartDispensedKeysList');
  const command = document.getElementById('cartActivationCmd');
  if (!container) return;
  container.innerHTML = keys.map((key, index) => `
    <div class="dispensed-key-card">
      <div><span>Access Pass Key #${index + 1}</span><code class="font-mono text-accent">${escapeHtml(key)}</code></div>
      <button type="button" class="btn-icon" onclick="copySingleCartKey('${escapeHtml(key)}', this)" title="Copy key"><i class="fa-regular fa-copy"></i></button>
    </div>`).join('');
  if (command && keys.length) command.textContent = `/redeem ${keys[0]}`;
}

function copySingleCartKey(key, btnEl = null) {
  if (!key) return;

  const performFeedback = () => {
    showToast('Key copied to clipboard! 🎉');
    if (btnEl) {
      const origHtml = btnEl.innerHTML;
      btnEl.innerHTML = '<i class="fa-solid fa-check"></i>';
      btnEl.style.background = '#10b981';
      btnEl.style.color = '#ffffff';

      setTimeout(() => {
        btnEl.innerHTML = origHtml;
        btnEl.style.background = '';
        btnEl.style.color = '';
      }, 1800);
    }
  };

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(key).then(() => {
      performFeedback();
    }).catch(() => {
      fallbackCopyCartKey(key, performFeedback);
    });
  } else {
    fallbackCopyCartKey(key, performFeedback);
  }
}

function fallbackCopyCartKey(key, onSuccess) {
  try {
    const textArea = document.createElement('textarea');
    textArea.value = key;
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    textArea.style.left = '-9999px';
    textArea.style.opacity = '0';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, 99999);

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);

    if (successful) {
      if (typeof onSuccess === 'function') onSuccess();
      else showToast('Key copied to clipboard! 🎉');
    } else {
      window.prompt('Copy your pass key:', key);
    }
  } catch (err) {
    window.prompt('Copy your pass key:', key);
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
  toast.innerHTML = `<i class="fa-solid fa-circle-info"></i><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  window.setTimeout(() => {
    toast.classList.add('is-hiding');
    window.setTimeout(() => toast.remove(), 250);
  }, 2800);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
