let pageCart = [];
let selectedCartPaymentMethod = 'crypto';
let selectedCartCryptoCoin = 'usdt_trc20';
let cartCryptoWallets = {
  btc: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  usdt_trc20: 'T9yD14Nj9j7xAB4dbGeiX9hA2A1bC3dE4f',
  eth: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
  sol: '7v99fvB1iEe4aV8yK91qR9tL8mX7zP4qS5wE2r1tN8y',
  ltc: 'LTC1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
};

document.addEventListener('DOMContentLoaded', () => {
  loadCartFromLocalStorage();
  fetchWalletsForCart();
  renderCartPage();
  if (typeof initBackgroundParticles === 'function') initBackgroundParticles();
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
}

async function fetchWalletsForCart() {
  try {
    const res = await fetch('/api/wallets');
    if (res.ok) {
      const data = await res.json();
      cartCryptoWallets = { ...cartCryptoWallets, ...data };
      updateCartCryptoAddressDisplay();
    }
  } catch (err) {
    console.log('Using fallback wallets');
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
  selectedCartPaymentMethod = method;
  const options = document.querySelectorAll('.payment-option');
  options.forEach(o => o.classList.remove('active'));
  if (el) el.classList.add('active');

  const cryptoBox = document.getElementById('cartCryptoBox');
  if (cryptoBox) {
    cryptoBox.style.display = method === 'crypto' ? 'block' : 'none';
  }
}

function selectCartCryptoCoin(coin, el) {
  selectedCartCryptoCoin = coin;
  const buttons = document.querySelectorAll('.crypto-coin-btn');
  buttons.forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');

  updateCartCryptoAddressDisplay();
}

function updateCartCryptoAddressDisplay() {
  const addressEl = document.getElementById('cartActiveCryptoAddress');
  const networkLabel = document.getElementById('cartCryptoNetworkLabel');

  const networkNames = {
    usdt_trc20: 'USDT (TRC-20 Network)',
    btc: 'Bitcoin Address',
    eth: 'Ethereum Network',
    sol: 'Solana Network',
    ltc: 'Litecoin Network'
  };

  if (networkLabel) networkLabel.textContent = `Deposit Address (${networkNames[selectedCartCryptoCoin]}):`;
  if (addressEl) addressEl.textContent = cartCryptoWallets[selectedCartCryptoCoin] || 'Wallet address not set';
}

function copyCartCryptoAddress() {
  const addressEl = document.getElementById('cartActiveCryptoAddress');
  if (addressEl && addressEl.textContent) {
    navigator.clipboard.writeText(addressEl.textContent).then(() => {
      showToast('Wallet address copied to clipboard!');
    }).catch(() => {
      showToast('Failed to copy wallet address');
    });
  }
}

async function processCartPageCheckout(event) {
  event.preventDefault();

  if (!pageCart || pageCart.length === 0) {
    showToast('Your cart is empty!');
    return;
  }

  const emailInput = document.getElementById('cartUserEmail');
  const email = emailInput ? emailInput.value.trim() : '';

  if (!email || !email.includes('@')) {
    showToast('Please enter a valid email address.');
    if (emailInput) emailInput.focus();
    return;
  }

  const btn = document.getElementById('cartCheckoutBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing & Dispensing Key...';
  }

  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        cart: pageCart,
        paymentMethod: selectedCartPaymentMethod === 'crypto' ? `Crypto (${selectedCartCryptoCoin.toUpperCase()})` : selectedCartPaymentMethod
      })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      renderCartDispensedKeys(data.keys || [data.dispensedKey]);
      document.getElementById('cartContentLayout').style.display = 'none';
      document.getElementById('cartSuccessView').style.display = 'block';

      pageCart = [];
      saveCartToLocalStorage();
      showToast('Payment successful! Key generated.');
    } else {
      showToast(data.error || 'Payment failed.');
    }
  } catch (err) {
    console.error('Checkout error:', err);
    showToast('Error connecting to backend server.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-bolt"></i> Complete Purchase & Get Key';
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
