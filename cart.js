let pageCart = [];
let selectedCartPaymentMethod = 'balance';
let selectedCartCryptoCoin = 'usdt_trc20';
let cartCurrentUser = null;
let cartPaymentConfig = { nowPayments: { enabled: false } };

document.addEventListener('DOMContentLoaded', () => {
  loadCartFromLocalStorage();
  fetchCartPaymentConfig();
  renderCartPage();
  if (typeof initBackgroundParticles === 'function') initBackgroundParticles();
});

document.addEventListener('site:auth', (event) => {
  cartCurrentUser = event.detail.user;
  const email = document.getElementById('cartAccountEmail');
  const balance = document.getElementById('cartBalanceBadge');
  if (email) email.textContent = cartCurrentUser?.email || 'Sign in required';
  if (balance) balance.textContent = `$${Number(cartCurrentUser?.balance || 0).toFixed(2)} balance`;
});

function loadCartFromLocalStorage() {
  try {
    const raw = localStorage.getItem('bulk_otp_cart');
    pageCart = raw ? JSON.parse(raw) : [];
  } catch (err) {
    pageCart = [];
  }
}

function saveCartToLocalStorage() {
  localStorage.setItem('bulk_otp_cart', JSON.stringify(pageCart));
  window.SiteShell?.updateCartBadges();
}

async function fetchCartPaymentConfig() {
  try {
    const res = await fetch('/api/payments/config');
    if (res.ok) {
      cartPaymentConfig = await res.json();
      const option = document.getElementById('cartCryptoPaymentOption');
      const status = document.getElementById('cartCryptoOptionStatus');
      const enabled = Boolean(cartPaymentConfig.nowPayments?.enabled);
      if (option) {
        option.disabled = !enabled;
        option.classList.toggle('is-disabled', !enabled);
      }
      if (status) status.textContent = enabled ? 'Verified invoice checkout' : 'NOWPayments setup pending';
    }
  } catch (err) {
    console.log('Payment configuration unavailable');
  }
}

function renderCartPage() {
  const container = document.getElementById('cartPageItemsList');
  const badge = document.getElementById('cartItemCountBadge');
  const subtotalEl = document.getElementById('cartSubtotalText');
  const totalEl = document.getElementById('cartTotalText');

  if (!container) return;

  if (!pageCart || pageCart.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 4rem 1rem; color: var(--text-dim);">
        <i class="fa-solid fa-cart-shopping" style="font-size: 3.5rem; margin-bottom: 1rem; opacity: 0.3;"></i>
        <h3 style="margin-bottom: 0.5rem;">Your Cart is Empty</h3>
        <p style="margin-bottom: 1.5rem; font-size: 0.9375rem;">Explore our high-speed OTP bot passes and add them to your cart.</p>
        <a href="index.html" class="btn btn-primary">
          <i class="fa-solid fa-store"></i> Browse Passes
        </a>
      </div>
    `;
    if (badge) badge.textContent = '0 Items';
    if (subtotalEl) subtotalEl.textContent = '$0.00';
    if (totalEl) totalEl.textContent = '$0.00';
    return;
  }

  let html = '';
  let total = 0;
  let totalCount = 0;

  pageCart.forEach(item => {
    const itemTotal = item.price * item.qty;
    total += itemTotal;
    totalCount += item.qty;

    html += `
      <div class="cart-page-item-card">
        <img src="${item.art}" alt="${escapeHtml(item.title)}" class="cart-page-item-img">
        <div style="flex: 1;">
          <span class="subtitle" style="font-size: 0.65rem; margin-bottom: 0.15rem;">${escapeHtml(item.duration || 'PASS')}</span>
          <h4 style="margin: 0 0 0.35rem 0; font-size: 1.05rem; font-weight: 700; color: var(--text-primary);">${escapeHtml(item.shortTitle || item.title)}</h4>
          <span style="color: var(--text-muted); font-size: 0.875rem;">$${item.price.toFixed(2)} USD per key</span>
        </div>

        <div style="display:flex; align-items:center; gap: 1.5rem;">
          <div class="quantity-input" style="height: 38px;">
            <button class="quantity-btn" onclick="updateCartItemQty('${item.id}', -1)"><i class="fa-solid fa-minus"></i></button>
            <input type="number" value="${item.qty}" class="quantity-val" readonly style="background:none; border:none; text-align:center;">
            <button class="quantity-btn" onclick="updateCartItemQty('${item.id}', 1)"><i class="fa-solid fa-plus"></i></button>
          </div>

          <div style="text-align: right; min-width: 90px;">
            <strong style="font-size: 1.125rem; color: var(--text-primary); font-family: var(--font-heading);">$${itemTotal.toFixed(2)}</strong>
          </div>

          <button class="btn-icon" onclick="removeCartPageItem('${item.id}')" title="Remove Pass" style="color: var(--accent);">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  if (badge) badge.textContent = `${totalCount} Item${totalCount > 1 ? 's' : ''}`;
  if (subtotalEl) subtotalEl.textContent = '$' + total.toFixed(2);
  if (totalEl) totalEl.textContent = '$' + total.toFixed(2);
}

function updateCartItemQty(productId, change) {
  const item = pageCart.find(i => i.id === productId);
  if (item) {
    item.qty += change;
    if (item.qty <= 0) {
      removeCartPageItem(productId);
      return;
    }
    saveCartToLocalStorage();
    renderCartPage();
  }
}

function removeCartPageItem(productId) {
  pageCart = pageCart.filter(i => i.id !== productId);
  saveCartToLocalStorage();
  renderCartPage();
  showToast('Pass removed from cart');
}

function selectCartPaymentMethod(method, el) {
  if (el?.disabled) return;
  selectedCartPaymentMethod = method;
  const options = document.querySelectorAll('.payment-option');
  options.forEach(o => o.classList.remove('active'));
  if (el) el.classList.add('active');

  const cryptoBox = document.getElementById('cartCryptoBox');
  if (cryptoBox) {
    cryptoBox.style.display = method === 'crypto' ? 'block' : 'none';
  }
  const button = document.getElementById('cartCheckoutBtn');
  if (button) {
    button.innerHTML = method === 'crypto'
      ? '<i class="fa-brands fa-bitcoin"></i> Continue to Crypto Payment'
      : '<i class="fa-solid fa-bolt"></i> Pay with Store Balance';
  }
}

function selectCartCryptoCoin(coin, el) {
  selectedCartCryptoCoin = coin;
  const buttons = document.querySelectorAll('.crypto-coin-btn');
  buttons.forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
}

async function processCartPageCheckout(event) {
  event.preventDefault();

  if (!pageCart || pageCart.length === 0) {
    showToast('Your cart is empty!');
    return;
  }

  cartCurrentUser = cartCurrentUser || window.SiteShell?.user || null;
  if (!cartCurrentUser) {
    showToast('Sign in before checking out.');
    window.setTimeout(() => { window.location.href = 'login.html?redirect=/cart.html'; }, 250);
    return;
  }

  const btn = document.getElementById('cartCheckoutBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Securing your order…';
  }

  try {
    const isCrypto = selectedCartPaymentMethod === 'crypto';
    const endpoint = isCrypto ? '/api/payments/nowpayments/invoice' : '/api/orders/checkout';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: pageCart.map(item => ({ productId: item.id, qty: item.qty })),
        paymentMethod: selectedCartPaymentMethod,
        payCurrency: selectedCartCryptoCoin
      })
    });

    const data = await res.json();

    if (res.ok && data.success && isCrypto && data.invoiceUrl) {
      window.SiteShell?.showLoading('Opening secure payment…');
      window.location.href = data.invoiceUrl;
    } else if (res.ok && data.success) {
      renderCartDispensedKeys(data.keys || []);
      const successView = document.getElementById('cartSuccessView');
      document.getElementById('cartContentLayout').style.display = 'none';
      if (successView) {
        successView.style.display = 'block';
        successView.classList.add('payment-success-card');
      }

      pageCart = [];
      saveCartToLocalStorage();
      showToast('Payment Successful! Key delivered 🎉');
      if (window.SiteShell?.refreshAuth) window.SiteShell.refreshAuth();

      // Automated redirect to orders after 2.8 seconds
      setTimeout(() => {
        window.location.href = 'index.html?open=orders';
      }, 2800);
    } else {
      showToast(data.error || 'Payment failed.');
    }
  } catch (err) {
    console.error('Checkout error:', err);
    showToast('Error connecting to backend server.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = selectedCartPaymentMethod === 'crypto'
        ? '<i class="fa-brands fa-bitcoin"></i> Continue to Crypto Payment'
        : '<i class="fa-solid fa-bolt"></i> Pay with Store Balance';
    }
  }
}

function renderCartDispensedKeys(keys) {
  const container = document.getElementById('cartDispensedKeysList');
  const cmd = document.getElementById('cartActivationCmd');
  if (!container) return;

  let html = '';
  keys.forEach((key, idx) => {
    html += `
      <div class="dispensed-key-card">
        <div>
          <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">Access Pass Key #${idx + 1}</span>
          <code class="font-mono text-accent" style="font-size: 1.125rem; font-weight: 700; word-break: break-all;">${key}</code>
        </div>
        <button class="btn-icon" onclick="copySingleCartKey('${key}')" title="Copy Key">
          <i class="fa-regular fa-copy"></i>
        </button>
      </div>
    `;
  });

  container.innerHTML = html;
  if (cmd && keys.length > 0) {
    cmd.textContent = '/redeem ' + keys[0];
  }
}

function copySingleCartKey(key) {
  navigator.clipboard.writeText(key).then(() => {
    showToast('Key copied to clipboard!');
  }).catch(() => {
    showToast('Failed to copy key');
  });
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

  toast.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--status-green); font-size: 1rem;"></i> <span>${escapeHtml(message)}</span>`;
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
