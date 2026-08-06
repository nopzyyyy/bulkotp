const DEFAULT_PRODUCTS = [
  {
    id: 'hourly-1h',
    category: 'hourly',
    title: 'OTP BOT 1-HOUR Pass: 1-HOUR HOURLY Key',
    shortTitle: '1-Hour Hourly Key',
    price: 17.00,
    stock: 44,
    duration: '1-Hour',
    description: 'Experience the power of Bulk OTP Bot with the 1-Hour Hourly Pass. High-speed Telegram OTP bypass.',
    prefix: 'BOT-1H',
    art: 'assets/pass_1h.png'
  },
  {
    id: 'hourly-3h',
    category: 'hourly',
    title: 'OTP BOT 3-HOUR Pass: 3-HOUR HOURLY Key',
    shortTitle: '3-Hour Hourly Key',
    price: 30.00,
    stock: 34,
    duration: '3-Hour',
    description: 'OTP BOT 3-Hour Hourly Pass. High-speed session handling with zero interruption.',
    prefix: 'BOT-3H',
    art: 'assets/pass_3h.png'
  },
  {
    id: 'daily-1d',
    category: 'daily',
    title: 'OTP BOT 1-DAY Pass: 1-DAY DAILY Key',
    shortTitle: '1-Day Daily Key',
    price: 60.00,
    stock: 29,
    duration: '1-Day',
    description: 'OTP BOT 1-Day Daily Pass. Full 24-hour uninterrupted high-capacity OTP bypass operations.',
    prefix: 'BOT-1D',
    art: 'assets/pass_1d.png'
  },
  {
    id: 'daily-3d',
    category: 'daily',
    title: 'OTP BOT 3-DAY Pass: 3-DAY MULTIDAY Key',
    shortTitle: '3-Day Multiday Key',
    price: 150.00,
    stock: 27,
    duration: '3-Day',
    description: 'OTP BOT 3-Day Multiday Pass. Extended multi-day access key for ongoing operations.',
    prefix: 'BOT-3D',
    art: 'assets/pass_3d.png'
  },
  {
    id: 'weekly-1w',
    category: 'weekly',
    title: 'OTP BOT 1-WEEK Pass: 1-WEEK WEEKLY Key',
    shortTitle: '1-Week Weekly Key',
    price: 250.00,
    stock: 24,
    duration: '1-Week',
    description: 'OTP BOT 1-Week Weekly Pass. Full 7-day unrestricted key access for power users.',
    prefix: 'BOT-1W',
    art: 'assets/pass_1w.png'
  },
  {
    id: 'weekly-2w',
    category: 'weekly',
    title: 'OTP BOT 2-WEEK Pass: 2-WEEK MULTIWEEK Key',
    shortTitle: '2-Week Multiweek Key',
    price: 350.00,
    stock: 19,
    duration: '2-Week',
    description: 'OTP BOT 2-Week Multiweek Pass. High-capacity biweekly duration key.',
    prefix: 'BOT-2W',
    art: 'assets/pass_2w.png'
  },
  {
    id: 'monthly-1m',
    category: 'monthly',
    title: 'OTP BOT 1-MONTH Pass: 1-MONTH MONTHLY Key',
    shortTitle: '1-Month Monthly Key',
    price: 550.00,
    stock: 17,
    duration: '1-Month',
    description: 'OTP BOT 1-Month Monthly Pass. Full 30-day VIP key access with dedicated priority routing.',
    prefix: 'BOT-1M',
    art: 'assets/pass_1m.png'
  },
  {
    id: 'monthly-3m',
    category: 'monthly',
    title: 'OTP BOT 3-MONTH Pass: 3-MONTH MULTIMONTH Key',
    shortTitle: '3-Month Multimonth Key',
    price: 1200.00,
    stock: 14,
    duration: '3-Month',
    description: 'OTP BOT 3-Month Multimonth Pass. 90-day quarterly pass for high-volume enterprises.',
    prefix: 'BOT-3M',
    art: 'assets/pass_3m.png'
  },
  {
    id: 'monthly-6m',
    category: 'monthly',
    title: 'OTP BOT 6-MONTH Pass: 6-MONTH MULTIMONTH Key',
    shortTitle: '6-Month Multimonth Key',
    price: 2000.00,
    stock: 11,
    duration: '6-Month',
    description: 'OTP BOT 6-Month Multimonth Pass. Half-year VIP key with maximum rate limit limits.',
    prefix: 'BOT-6M',
    art: 'assets/pass_6m.png'
  },
  {
    id: 'yearly-1y',
    category: 'monthly',
    title: 'OTP BOT 1-YEAR Pass: 1-YEAR YEARLY Key',
    shortTitle: '1-Year Yearly Key',
    price: 3500.00,
    stock: 9,
    duration: '1-Year',
    description: 'OTP BOT 1-Year Yearly Pass. Ultimate 365-day annual pass for permanent operations.',
    prefix: 'BOT-1Y',
    art: 'assets/pass_1y.png'
  }
];

let PRODUCTS = [...DEFAULT_PRODUCTS];
let currentCart = [];
let activeProduct = null;
let activeCategoryFilter = 'all';

let selectedPaymentMethod = 'balance';
let selectedCryptoCoin = 'usdt_trc20';
let paymentConfig = { balance: { enabled: true }, nowPayments: { enabled: false } };

// Smooth Mouse Interpolation (Lerp) Variables
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight * 0.3;
let targetX = mouseX;
let targetY = mouseY;

let currentUser = null;

// Top Progress Bar Engine
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

// Universal Button Loading Helper with 5s Safety Recovery Timeout
function setButtonLoading(btn, loadingText = 'Processing...') {
  if (!btn) return null;
  const originalHtml = btn.innerHTML;
  btn.setAttribute('data-original-html', originalHtml);
  btn.classList.add('is-loading');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${loadingText}`;

  const recoveryTimer = setTimeout(() => {
    resetButtonLoading(btn);
  }, 5000);

  btn._recoveryTimer = recoveryTimer;
  return originalHtml;
}

function resetButtonLoading(btn) {
  if (!btn) return;
  if (btn._recoveryTimer) clearTimeout(btn._recoveryTimer);
  const originalHtml = btn.getAttribute('data-original-html');
  if (originalHtml) {
    btn.innerHTML = originalHtml;
  }
  btn.classList.remove('is-loading');
  btn.disabled = false;
}

// Global Round Spinner Overlay Engine
let loadingOverlayTimer = null;

function showGlobalLoading(text = 'Loading...') {
  let overlay = document.getElementById('globalLoadingOverlay');
  if (!overlay) return;

  const textEl = overlay.querySelector('.spinner-loading-text');
  if (textEl) textEl.textContent = text;

  overlay.classList.add('active');

  if (loadingOverlayTimer) clearTimeout(loadingOverlayTimer);

  // Safety Timeout: Auto-hide after 2.5s to prevent UI freezing
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

// Page Transition Loading Trigger
window.addEventListener('beforeunload', () => {
  showGlobalLoading('Loading Page...');
});

document.addEventListener('DOMContentLoaded', () => {
  // Hide global overlay immediately
  hideGlobalLoading();

  // Render catalog grid instantly from DEFAULT_PRODUCTS
  renderCatalogGrid(PRODUCTS);

  fetchCurrentUser();
  fetchProductsFromBackend();
  fetchWalletsFromBackend();

  updateCartBadge();
  initNative3DModel();
  initBackgroundParticles();

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('open') === 'orders') {
    setTimeout(() => openMyOrdersModal(), 300);
  }

  // Scroll navbar styling
  window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (navbar) {
      if (window.scrollY > 40) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    }
  });

  // 3D Model Mouse Tilt
  let rotX = 0, rotY = 0;
  let targetRotX = 0, targetRotY = 0;

  window.addEventListener('mousemove', (e) => {
    targetX = e.clientX;
    targetY = e.clientY;

    const normX = (e.clientX / window.innerWidth) - 0.5;
    const normY = (e.clientY / window.innerHeight) - 0.5;

    targetRotY = normX * 25;
    targetRotX = -normY * 18;
  });

  function animateCursorGlow() {
    mouseX += (targetX - mouseX) * 0.08;
    mouseY += (targetY - mouseY) * 0.08;

    rotX += (targetRotX - rotX) * 0.08;
    rotY += (targetRotY - rotY) * 0.08;

    document.documentElement.style.setProperty('--mouse-x', `${mouseX.toFixed(1)}px`);
    document.documentElement.style.setProperty('--mouse-y', `${mouseY.toFixed(1)}px`);

    const hero3dWrap = document.getElementById('hero3dWrap');
    if (hero3dWrap) {
      hero3dWrap.style.transform = `perspective(1000px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg)`;
    }

    requestAnimationFrame(animateCursorGlow);
  }
  animateCursorGlow();

  const catalogSearch = document.getElementById('catalogSearch');
  if (catalogSearch) {
    catalogSearch.addEventListener('input', filterProducts);
  }
});

document.addEventListener('site:auth', (event) => {
  currentUser = event.detail.user;
  updateCheckoutAccount();
});

function initNative3DModel() {
  const modelViewer = document.querySelector('model-viewer');
  if (modelViewer) {
    modelViewer.addEventListener('error', () => {
      console.log('GLB model fallback activated');
    });
  }
}

async function fetchProductsFromBackend() {
  try {
    const res = await fetch('/api/products');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        PRODUCTS = data;
        renderCatalogGrid(PRODUCTS);
        return;
      }
    }
  } catch (err) {
    console.log('Backend offline or standalone fallback.');
  }

  // Standalone fallback
  PRODUCTS = [
    {
      id: 'compact-1h',
      category: 'hourly',
      title: 'OTP BOT COMPACT Pass: 1 - HOUR COMPACT Key',
      shortTitle: '1-Hour Compact Key',
      price: 17.00,
      stock: 97,
      duration: '1-Hour',
      description: 'Experience the power of Bulk OTP Bot with the MINI Pass: 1 - HOUR COMPACT Key. Instant telegram bot access.',
      prefix: 'BOT-COMPACT',
      art: 'assets/compact_pass_1h.jpg'
    },
    {
      id: 'extended-3h',
      category: 'hourly',
      title: 'OTP BOT EXTENDED Pass: 3 - HOUR EXTENDED Key',
      shortTitle: '3-Hour Extended Key',
      price: 30.00,
      stock: 29,
      duration: '3-Hour',
      description: 'OTP BOT EXTENDED Pass: 3 - HOUR EXTENDED Key. High-speed session handling with zero interruption.',
      prefix: 'BOT-EXTENDED',
      art: 'assets/extended_pass_3h.jpg'
    },
    {
      id: 'daylong-24h',
      category: 'daily',
      title: 'OTP BOT DAYLONG Pass: 24 - HOUR DAYLONG Key',
      shortTitle: '24-Hour Daylong Key',
      price: 60.00,
      stock: 29,
      duration: '24-Hour',
      description: 'OTP BOT DAYLONG Pass: 24 - HOUR DAYLONG Key. Full day uninterrupted high-capacity OTP bypass operations.',
      prefix: 'BOT-DAYLONG',
      art: 'assets/daylong_pass_24h.jpg'
    },
    {
      id: 'multiday-3d',
      category: 'daily',
      title: 'OTP BOT MULTIDAY Pass: 3 - DAY MULTIDAY Key',
      shortTitle: '3-Day Multiday Key',
      price: 150.00,
      stock: 30,
      duration: '3-Day',
      description: 'OTP BOT MULTIDAY Pass: 3 - DAY MULTIDAY Key. Multi-day continuous access key for high-volume automated verification.',
      prefix: 'BOT-MULTIDAY',
      art: 'assets/multiday_pass_3d.jpg'
    },
    {
      id: 'weekly-1w',
      category: 'weekly',
      title: 'OTP BOT WEEKLY Pass: 1 - WEEK WEEKLY Key',
      shortTitle: '1-Week Weekly Key',
      price: 250.00,
      stock: 30,
      duration: '1-Week',
      description: 'OTP BOT WEEKLY Pass: 1 - WEEK WEEKLY Key. Full week unlimited operations access pass.',
      prefix: 'BOT-WEEKLY',
      art: 'assets/weekly_pass_1w.jpg'
    },
    {
      id: 'biweekly-2w',
      category: 'weekly',
      title: 'OTP BOT BIWEEKLY Pass: 2 - WEEKS BIWEEKLY Key',
      shortTitle: '2-Weeks Biweekly Key',
      price: 350.00,
      stock: 29,
      duration: '2-Weeks',
      description: 'OTP BOT BIWEEKLY Pass: 2 - WEEKS BIWEEKLY Key. Maximum value 14-day dedicated pass key.',
      prefix: 'BOT-BIWEEKLY',
      art: 'assets/biweekly_pass_2w.jpg'
    }
  ];
  renderCatalogGrid(PRODUCTS);
}

async function fetchPaymentConfig() {
  try {
    const res = await fetch('/api/payments/config');
    if (res.ok) {
      paymentConfig = await res.json();
      const option = document.getElementById('cryptoPaymentOption');
      const status = document.getElementById('cryptoOptionStatus');
      const enabled = Boolean(paymentConfig.nowPayments?.enabled);
      if (option) {
        option.disabled = !enabled;
        option.classList.toggle('is-disabled', !enabled);
      }
      if (status) status.textContent = enabled ? 'Verified invoice checkout' : 'NOWPayments setup pending';
    }
  } catch (err) {
    console.log('Payment configuration is unavailable.');
  }
}

function updateCheckoutAccount() {
  const email = document.getElementById('checkoutAccountEmail');
  const balance = document.getElementById('checkoutBalanceBadge');
  if (email) email.textContent = currentUser?.email || 'Sign in required';
  if (balance) balance.textContent = `$${Number(currentUser?.balance || 0).toFixed(2)} balance`;
}

function renderCatalogGrid(items) {
  const grid = document.getElementById('productGrid');
  if (!grid) return;
  
  grid.innerHTML = '';
  
  if (!items || items.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-dim);">
        <i class="fa-solid fa-magnifying-glass" style="font-size: 2.5rem; margin-bottom: 1rem;"></i>
        <p>No passes match your search.</p>
      </div>
    `;
    return;
  }

  items.forEach(product => {
    const stockCount = product.stock !== undefined ? product.stock : 10;
    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="card-banner">
        <img src="${product.art}" alt="${escapeHtml(product.title)}">
        <span class="card-stock-tag ${stockCount > 0 ? '' : 'out-of-stock'}">${stockCount > 0 ? stockCount + ' in stock' : 'Out of Stock'}</span>
      </div>
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(product.title)}</h3>
        <p class="card-desc">${escapeHtml(product.description)}</p>
        <div class="card-footer">
          <span class="card-price">$${product.price.toFixed(2)}</span>
          <div class="card-actions">
            <button class="btn-icon" onclick="addToCartDirect('${product.id}')" title="Add to Cart">
              <i class="fa-solid fa-cart-plus"></i>
            </button>
            <span class="card-view-link" onclick="openProductDetail('${product.id}')">
              View <i class="fa-solid fa-chevron-right"></i>
            </span>
          </div>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function filterProducts() {
  const searchInput = document.getElementById('catalogSearch');
  const term = searchInput ? searchInput.value.toLowerCase().trim() : '';
  
  const filtered = PRODUCTS.filter(product => {
    const matchesSearch = product.title.toLowerCase().includes(term) || 
                          product.description.toLowerCase().includes(term) || 
                          (product.duration && product.duration.toLowerCase().includes(term));
    const matchesCategory = activeCategoryFilter === 'all' || product.category === activeCategoryFilter;
    return matchesSearch && matchesCategory;
  });
  
  renderCatalogGrid(filtered);
}

function filterCategory(cat, btn) {
  activeCategoryFilter = cat;
  
  const buttons = document.querySelectorAll('.cat-tab');
  buttons.forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  
  filterProducts();
}

function showCatalogView() {
  showGlobalLoading('Loading Passes...');
  startTopProgress();
  const catalogView = document.getElementById('catalogView');
  const productDetailView = document.getElementById('productDetailView');
  
  if (catalogView) {
    catalogView.style.display = 'block';
    catalogView.classList.add('active');
  }
  if (productDetailView) {
    productDetailView.style.display = 'none';
    productDetailView.classList.remove('active');
  }
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => {
    finishTopProgress();
    hideGlobalLoading();
  }, 250);
}

function openProductDetail(productId) {
  showGlobalLoading('Loading Product...');
  startTopProgress();
  activeProduct = PRODUCTS.find(p => p.id === productId);
  if (!activeProduct) {
    finishTopProgress();
    hideGlobalLoading();
    return;
  }
  
  const el = (id) => document.getElementById(id);
  const stockCount = activeProduct.stock !== undefined ? activeProduct.stock : 10;
  
  if (el('detailBreadcrumbTitle')) el('detailBreadcrumbTitle').textContent = activeProduct.shortTitle || activeProduct.title;
  if (el('detailTitle')) el('detailTitle').textContent = activeProduct.title;
  if (el('detailCardTitle')) el('detailCardTitle').textContent = activeProduct.title;
  if (el('detailDescription')) el('detailDescription').textContent = activeProduct.description;
  if (el('detailPrice')) el('detailPrice').textContent = '$' + activeProduct.price.toFixed(2);
  if (el('detailStockBadge')) el('detailStockBadge').textContent = stockCount + ' in stock';
  if (el('detailStockPill')) el('detailStockPill').innerHTML = `<i class="fa-solid fa-check"></i> In stock (${stockCount})`;
  if (el('detailArtImg')) el('detailArtImg').src = activeProduct.art;
  if (el('detailQtyInput')) el('detailQtyInput').value = 1;
  
  const catalogView = document.getElementById('catalogView');
  const productDetailView = document.getElementById('productDetailView');
  
  if (catalogView) {
    catalogView.style.display = 'none';
    catalogView.classList.remove('active');
  }
  if (productDetailView) {
    productDetailView.style.display = 'block';
    productDetailView.classList.add('active');
  }
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => {
    finishTopProgress();
    hideGlobalLoading();
  }, 250);
}

function adjustQty(change) {
  const input = document.getElementById('detailQtyInput');
  if (!input) return;
  let val = parseInt(input.value) || 1;
  val += change;
  if (val < 1) val = 1;
  if (val > 99) val = 99;
  input.value = val;
}

function adjustCartItemQty(productId, change) {
  const item = currentCart.find(i => i.id === productId);
  if (item) {
    item.qty += change;
    if (item.qty <= 0) {
      removeFromCart(productId);
      return;
    }
    updateCartBadge();
    renderCartDrawerItems();
  }
}

function addToCartDirect(productId) {
  const product = PRODUCTS.find(p => p.id === productId);
  if (product) {
    addToCart(product, 1);
  }
}

function handleDetailAddToCart() {
  if (!activeProduct) return;
  const input = document.getElementById('detailQtyInput');
  const qty = input ? (parseInt(input.value) || 1) : 1;
  addToCart(activeProduct, qty);
}

function addToCart(product, qty) {
  loadCartFromStorage();
  const existing = currentCart.find(item => item.id === product.id);
  if (existing) {
    existing.qty += qty;
  } else {
    currentCart.push({ ...product, qty });
  }
  saveCartToStorage();
  updateCartBadge();
  showToast('Added ' + qty + 'x ' + (product.shortTitle || product.title) + ' to cart');
}

function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem('bulk_otp_cart');
    currentCart = raw ? JSON.parse(raw) : [];
  } catch (err) {
    currentCart = [];
  }
}

function saveCartToStorage() {
  localStorage.setItem('bulk_otp_cart', JSON.stringify(currentCart));
  window.SiteShell?.updateCartBadges();
}

function removeFromCart(productId) {
  loadCartFromStorage();
  currentCart = currentCart.filter(item => item.id !== productId);
  saveCartToStorage();
  updateCartBadge();
}

function updateCartBadge() {
  loadCartFromStorage();
  const badge = document.getElementById('cartBadge');
  if (badge) {
    const totalQty = currentCart.reduce((sum, item) => sum + item.qty, 0);
    badge.textContent = totalQty;
  }
}

function toggleCartDrawer() {
  window.location.href = 'cart.html';
}

function renderCartDrawerItems() {
  const container = document.getElementById('cartItemsContainer');
  const totalEl = document.getElementById('cartTotalPrice');
  if (!container) return;
  
  if (currentCart.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 4rem 1rem; color: var(--text-dim);">
        <i class="fa-solid fa-cart-shopping" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.4;"></i>
        <p>Your cart is empty.</p>
      </div>
    `;
    if (totalEl) totalEl.textContent = '$0.00';
    return;
  }
  
  let html = '';
  let total = 0;
  
  currentCart.forEach(item => {
    const itemTotal = item.price * item.qty;
    total += itemTotal;
    html += `
      <div class="cart-item-row">
        <img src="${item.art}" alt="${escapeHtml(item.title)}" class="cart-item-img">
        <div style="flex: 1;">
          <h4 style="margin: 0 0 0.25rem 0; font-size: 0.9375rem; font-weight: 600; color: var(--text-primary);">${escapeHtml(item.shortTitle || item.title)}</h4>
          <span style="color: var(--text-dim); font-size: 0.8125rem;">$${item.price.toFixed(2)} each</span>
          <div style="display:flex; align-items:center; gap: 0.5rem; margin-top: 0.5rem;">
            <button class="quantity-btn btn-sm" onclick="adjustCartItemQty('${item.id}', -1)"><i class="fa-solid fa-minus"></i></button>
            <span style="font-weight:600; font-size: 0.875rem;">${item.qty}</span>
            <button class="quantity-btn btn-sm" onclick="adjustCartItemQty('${item.id}', 1)"><i class="fa-solid fa-plus"></i></button>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between;">
          <strong style="color: var(--text-primary); font-family: var(--font-heading);">$${itemTotal.toFixed(2)}</strong>
          <button class="btn-icon" onclick="removeFromCart('${item.id}')" title="Remove" style="width: 28px; height: 28px; color: var(--status-red);">
            <i class="fa-solid fa-trash" style="font-size: 0.75rem;"></i>
          </button>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
  if (totalEl) totalEl.textContent = '$' + total.toFixed(2);
}

function handleDetailBuyNow() {
  if (!activeProduct) return;
  const input = document.getElementById('detailQtyInput');
  const qty = input ? (parseInt(input.value) || 1) : 1;
  loadCartFromStorage();
  const existing = currentCart.find(i => i.id === activeProduct.id);
  if (existing) {
    existing.qty += qty;
  } else {
    currentCart.push({ ...activeProduct, qty });
  }
  saveCartToStorage();
  window.location.href = 'cart.html';
}

function selectPaymentMethod(method, element) {
  if (element?.classList.contains('is-disabled')) return;
  selectedPaymentMethod = method;
  const cards = document.querySelectorAll('.pinks-payment-card');
  cards.forEach(card => card.classList.remove('active'));
  if (element) element.classList.add('active');

  const cryptoBox = document.getElementById('cryptoPaymentBox');
  if (cryptoBox) {
    cryptoBox.style.display = method === 'crypto' ? 'block' : 'none';
  }
  const button = document.getElementById('payBtn');
  if (button) {
    button.innerHTML = method === 'crypto'
      ? '<i class="fa-brands fa-bitcoin"></i> Continue to Crypto Invoice'
      : '<i class="fa-solid fa-bolt"></i> Pay with Store Balance';
  }
}

function selectCryptoCoin(coin, element) {
  selectedCryptoCoin = coin;
  const buttons = document.querySelectorAll('.crypto-coin-btn');
  buttons.forEach(b => b.classList.remove('active'));
  if (element) element.classList.add('active');
}

function updateCheckoutAccountPill() {
  const emailEl = document.getElementById('checkoutAccountEmail');
  const signInBtn = document.getElementById('checkoutSignInBtn');
  const balanceBadge = document.getElementById('checkoutBalanceBadge');

  currentUser = currentUser || window.SiteShell?.user || null;

  if (currentUser) {
    if (emailEl) emailEl.textContent = currentUser.email;
    if (signInBtn) signInBtn.style.display = 'none';
    if (balanceBadge) {
      balanceBadge.style.display = 'inline-block';
      balanceBadge.textContent = '$' + (currentUser.balance || 0).toFixed(2) + ' balance';
    }
  } else {
    if (emailEl) emailEl.textContent = 'Sign in required';
    if (signInBtn) signInBtn.style.display = 'inline-block';
    if (balanceBadge) balanceBadge.style.display = 'none';
  }
}

function openCheckoutModal() {
  if (currentCart.length === 0) {
    showToast('Your cart is empty!');
    return;
  }
  
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('cartOverlay');
  if (drawer) drawer.classList.remove('open');
  if (overlay) overlay.classList.remove('active');
  
  const modal = document.getElementById('checkoutModal');
  if (modal) {
    let total = currentCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    
    const subtotalEl = document.getElementById('modalSubtotal');
    const totalEl = document.getElementById('modalTotal');
    if (subtotalEl) subtotalEl.textContent = '$' + total.toFixed(2);
    if (totalEl) totalEl.textContent = '$' + total.toFixed(2);
    
    const formStep = document.getElementById('checkoutStepForm');
    const invoiceStep = document.getElementById('checkoutStepInvoiceReady');
    const successStep = document.getElementById('checkoutSuccessStep');

    if (formStep) formStep.style.display = 'block';
    if (invoiceStep) invoiceStep.style.display = 'none';
    if (successStep) successStep.style.display = 'none';

    updateCheckoutAccountPill();
    
    modal.classList.add('active');
  }
}

function closeCheckoutModal() {
  const modal = document.getElementById('checkoutModal');
  if (modal) modal.classList.remove('active');
}

async function processCheckout(event) {
  if (event) event.preventDefault();

  currentUser = currentUser || window.SiteShell?.user || null;
  if (!currentUser) {
    showToast('Sign in required to complete purchase');
    showGlobalLoading('Redirecting to Sign In...');
    setTimeout(() => {
      window.location.href = 'login.html?redirect=index.html';
    }, 500);
    return;
  }

  const btn = document.getElementById('payBtn');
  const originalHtml = setButtonLoading(btn, 'Processing Order...');

  try {
    const isCrypto = selectedPaymentMethod === 'crypto';

    const response = await fetch('/api/orders/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: currentCart.map(item => ({ productId: item.id, qty: item.qty })),
        paymentMethod: selectedPaymentMethod,
        payCurrency: selectedCryptoCoin
      })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      if (isCrypto) {
        // Crypto Invoice Ready Step
        const orderId = data.orderId || 'ORD-' + Math.random().toString(36).substring(2, 10).toUpperCase();
        const total = data.total || currentCart.reduce((sum, i) => sum + i.price * i.qty, 0);
        const invoiceUrl = data.invoiceUrl || `https://nowpayments.io/payment/?iid=${orderId}`;

        // Attempt opening in new tab
        try {
          window.open(invoiceUrl, '_blank');
        } catch (e) {
          console.log('Popup blocked fallback enabled');
        }

        const elId = document.getElementById('invoiceOrderId');
        const elTotal = document.getElementById('invoiceTotalVal');
        const elLink = document.getElementById('invoicePayLink');

        if (elId) elId.textContent = orderId;
        if (elTotal) elTotal.textContent = '$' + total.toFixed(2);
        if (elLink) elLink.href = invoiceUrl;

        const formStep = document.getElementById('checkoutStepForm');
        const invoiceStep = document.getElementById('checkoutStepInvoiceReady');
        if (formStep) formStep.style.display = 'none';
        if (invoiceStep) invoiceStep.style.display = 'block';

        currentCart = [];
        updateCartBadge();
        saveCartToStorage();
        showToast('Crypto invoice created! Opening payment page...');
      } else {
        // Store Balance Purchase Success
        renderSuccessKeys(data.keys || []);
        
        const formStep = document.getElementById('checkoutStepForm');
        const successStep = document.getElementById('checkoutSuccessStep');
        
        if (formStep) formStep.style.display = 'none';
        if (successStep) successStep.style.display = 'block';
        
        currentCart = [];
        updateCartBadge();
        saveCartToStorage();
        showToast('Purchase complete! Your key is delivered.');
        fetchProductsFromBackend();
      }
    } else {
      showToast(data.error || 'Checkout failed. Please try again.');
    }
  } catch (err) {
    console.error(err);
    showToast('Network error during checkout.');
  } finally {
    resetButtonLoading(btn);
  }
}

function renderSuccessKeys(keys) {
  const container = document.getElementById('keysDispensedContainer');
  const activationCmd = document.getElementById('activationCommand');
  if (!container) return;

  let html = '';
  keys.forEach((key, idx) => {
    html += `
      <div class="dispensed-key-card">
        <div>
          <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">Access Pass Key #${idx + 1}</span>
          <code id="keyDispensed-${idx}" class="font-mono text-accent" style="font-size: 1.125rem; font-weight: 700; word-break: break-all;">${key}</code>
        </div>
        <button class="btn-icon" onclick="copySingleKey('${key}')" title="Copy Key">
          <i class="fa-regular fa-copy"></i>
        </button>
      </div>
    `;
  });

  container.innerHTML = html;
  if (activationCmd && keys.length > 0) {
    activationCmd.textContent = '/redeem ' + keys[0];
  }
}

function copySingleKey(key) {
  navigator.clipboard.writeText(key).then(() => {
    showToast('Key copied to clipboard!');
  }).catch(() => {
    showToast('Failed to copy key');
  });
}

function generateKey(prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let key = prefix || 'BOT';
  for (let i = 0; i < 3; i++) {
    key += '-';
    for (let j = 0; j < 4; j++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  key += '-KEY';
  return key;
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

function initBackgroundParticles() {
  let canvas = document.getElementById('bgParticlesCanvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'bgParticlesCanvas';
    document.body.prepend(canvas);
  }

  const ctx = canvas.getContext('2d');
  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const particleCount = 45;
  const particles = [];

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 2.0 + 0.8,
      speedY: -(Math.random() * 0.85 + 0.45), // Faster upward float
      speedX: (Math.random() - 0.5) * 0.3,
      opacity: Math.random() * 0.28 + 0.1,
      isRed: Math.random() > 0.35
    });
  }

  function renderParticles() {
    ctx.clearRect(0, 0, width, height);

    particles.forEach(p => {
      p.y += p.speedY;
      p.x += p.speedX;

      if (p.y < -10) {
        p.y = height + 10;
        p.x = Math.random() * width;
      }
      if (p.x < -10) p.x = width + 10;
      if (p.x > width + 10) p.x = -10;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.isRed
        ? `rgba(255, 37, 92, ${p.opacity})`
        : `rgba(255, 255, 255, ${p.opacity * 0.8})`;
      ctx.fill();
    });

    requestAnimationFrame(renderParticles);
  }

  renderParticles();
}

async function fetchCurrentUser() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated) {
        currentUser = data.user;
      } else {
        currentUser = null;
      }
    }
  } catch (err) {
    currentUser = null;
  }
  renderHeaderUserArea();
}

function renderHeaderUserArea() {
  const container = document.getElementById('userHeaderArea');
  if (!container) return;

  if (currentUser) {
    container.innerHTML = `
      <div class="user-profile-menu-wrap" style="position:relative;">
        <button class="nav-profile-btn" onclick="toggleUserProfileDropdown(event)" title="${escapeHtml(currentUser.email)}">
          <i class="fa-solid fa-user"></i>
        </button>

        <div id="userProfileDropdown" class="user-profile-dropdown">
          <div class="dropdown-header">
            <span class="dropdown-user-email">${escapeHtml(currentUser.email)}</span>
            <span class="dropdown-user-role">${escapeHtml(currentUser.role)}</span>
          </div>

          <div class="dropdown-balance-row">
            <span style="font-size:0.75rem; color:var(--text-dim);">Store Balance</span>
            <span class="dropdown-balance-val">$${(currentUser.balance || 0).toFixed(2)}</span>
          </div>

          <div class="dropdown-divider"></div>

          <button class="dropdown-item" onclick="openMyOrdersModal()">
            <i class="fa-solid fa-box-open text-accent"></i> My Orders &amp; Keys
          </button>

          <button class="dropdown-item" onclick="openUserTicketsModal()">
            <i class="fa-solid fa-headset text-green"></i> Support Tickets
          </button>

          ${currentUser.role === 'ADMIN' ? `
            <a href="admin.html" class="dropdown-item" style="color:var(--accent);">
              <i class="fa-solid fa-gauge-high"></i> Admin Panel
            </a>
          ` : ''}

          <div class="dropdown-divider"></div>

          <button class="dropdown-item text-red" onclick="handleUserLogout()">
            <i class="fa-solid fa-right-from-bracket"></i> Sign Out
          </button>
        </div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <button class="nav-profile-btn" onclick="window.location.href='login.html'" title="Sign In">
        <i class="fa-solid fa-user"></i>
      </button>
    `;
  }
}

function toggleUserProfileDropdown(e) {
  e.stopPropagation();
  const dropdown = document.getElementById('userProfileDropdown');
  if (dropdown) dropdown.classList.toggle('active');
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('userProfileDropdown');
  if (dropdown && dropdown.classList.contains('active')) {
    if (!dropdown.contains(e.target) && !e.target.closest('.nav-profile-btn')) {
      dropdown.classList.remove('active');
    }
  }
});

async function handleUserLogout() {
  if (window.SiteShell && typeof window.SiteShell.logout === 'function') {
    await window.SiteShell.logout();
    return;
  }
  showGlobalLoading('Signing out...');
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch (e) {}
  currentUser = null;
  window.location.href = 'index.html?logged_out=' + Date.now();
}

async function openMyOrdersModal() {
  const modal = document.getElementById('myOrdersModal');
  if (!modal) return;
  modal.classList.add('active');

  const listEl = document.getElementById('myOrdersList');
  if (!listEl) return;

  listEl.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading delivered keys...</div>';

  try {
    const res = await fetch('/api/orders');
    if (!res.ok) {
      listEl.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--status-red);">Please log in to view delivered keys.</div>';
      return;
    }

    const orders = await res.json();
    if (orders.length === 0) {
      listEl.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-dim);">No orders found. Purchase a pass key to see your delivered keys here!</div>';
      return;
    }

    listEl.innerHTML = orders.map(o => `
      <div class="user-order-card">
        <div class="user-order-header">
          <div>
            <span class="font-mono text-accent" style="font-weight:700;">#${escapeHtml(o.orderNumber || o.id)}</span>
            <span class="text-dim" style="font-size:0.75rem; margin-left:0.5rem;">${formatDate(o.createdAt)}</span>
          </div>
          <span class="pinks-status-pill status-completed"><i class="fa-solid fa-circle-check"></i> ${escapeHtml(o.status)}</span>
        </div>
        <div class="user-order-body">
          ${(o.purchasedItems || o.items || []).map(item => `
            <div class="user-order-item">
              <div style="font-weight:600; color:#fff;">${escapeHtml(item.name || item.title)}</div>
              ${item.credentials ? `
                <div class="delivered-key-box">
                  <code class="font-mono text-accent">${escapeHtml(item.credentials)}</code>
                  <button class="btn btn-primary btn-sm" onclick="copySingleKey('${escapeHtml(item.credentials)}')">
                    <i class="fa-regular fa-copy"></i> Copy Key
                  </button>
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  } catch (err) {
    listEl.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--status-red);">Failed to load orders.</div>';
  }
}

function closeMyOrdersModal() {
  const modal = document.getElementById('myOrdersModal');
  if (modal) modal.classList.remove('active');
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// User Support Tickets System
function openUserTicketsModal() {
  currentUser = currentUser || window.SiteShell?.user || null;
  if (!currentUser) {
    showToast('Sign in required to view or create support tickets.');
    showGlobalLoading('Redirecting to Sign In...');
    setTimeout(() => {
      window.location.href = 'login.html?redirect=index.html';
    }, 400);
    return;
  }

  const modal = document.getElementById('userTicketsModal');
  if (modal) {
    modal.classList.add('active');
    loadUserTickets();
  }
}

function closeUserTicketsModal() {
  const modal = document.getElementById('userTicketsModal');
  if (modal) modal.classList.remove('active');
}

function showCreateTicketForm() {
  const form = document.getElementById('createTicketForm');
  if (form) form.style.display = 'block';
}

function hideCreateTicketForm() {
  const form = document.getElementById('createTicketForm');
  if (form) form.style.display = 'none';
}

async function loadUserTickets() {
  const container = document.getElementById('userTicketsList');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-dim);"><i class="fa-solid fa-spinner fa-spin"></i> Loading support tickets...</div>';

  try {
    const res = await fetch('/api/tickets');
    if (!res.ok) {
      container.innerHTML = '<p class="text-muted text-center">Unable to load tickets.</p>';
      return;
    }
    const tickets = await res.json();
    renderUserTicketsList(tickets);
  } catch (err) {
    console.error('Failed to load tickets:', err);
    container.innerHTML = '<p class="text-muted text-center">Failed to fetch support tickets.</p>';
  }
}

async function closeTicketByUser(ticketId) {
  if (!confirm('Are you sure you want to mark this support ticket as resolved/closed?')) return;

  try {
    const res = await fetch(`/api/tickets/${ticketId}/close`, { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Support ticket marked as resolved.');
      loadUserTickets();
    } else {
      showToast(data.error || 'Could not close ticket.');
    }
  } catch (err) {
    showToast('Error closing ticket.');
  }
}

function renderUserTicketsList(tickets) {
  const container = document.getElementById('userTicketsList');
  if (!container) return;

  if (tickets.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 2.5rem 1rem; background: var(--bg-surface-deep); border-radius: var(--radius-lg); border: 1px solid var(--border-subtle);">
        <i class="fa-solid fa-headset" style="font-size: 2.5rem; color: var(--text-dim); margin-bottom: 1rem;"></i>
        <h4 style="color:#fff; margin:0 0 0.5rem;">No Active Support Tickets</h4>
        <p style="color:var(--text-muted); font-size:0.875rem; margin:0;">Need help with a key or order? Click "Open New Ticket" above.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = tickets.map(t => {
    const statusClass = t.status === 'REPLIED' ? 'status-completed' : (t.status === 'RESOLVED' ? 'status-completed' : 'status-open');
    const messages = t.messages || [];

    return `
      <div class="user-ticket-card">
        <div class="user-ticket-header">
          <div>
            <span style="font-family:var(--font-mono); color:var(--accent); font-weight:700; font-size:0.85rem;">#${escapeHtml(t.ticketNumber || t.id)}</span>
            <strong style="color:#fff; font-size:1rem; margin-left:0.5rem;">${escapeHtml(t.subject)}</strong>
            <span style="font-size:0.75rem; color:var(--text-dim); margin-left:0.5rem;">(${escapeHtml(t.category)})</span>
          </div>
          <div style="display:flex; align-items:center; gap:0.6rem;">
            <span class="pinks-status-pill ${statusClass}">${escapeHtml(t.status)}</span>
            ${t.status !== 'RESOLVED' ? `<button type="button" class="btn btn-glass btn-sm" onclick="closeTicketByUser('${t.id}')" title="Mark Resolved"><i class="fa-solid fa-check"></i> Close Ticket</button>` : ''}
          </div>
        </div>`

        <div class="ticket-thread-messages">
          ${messages.map(m => `
            <div class="ticket-msg-bubble ${m.senderRole === 'ADMIN' ? 'admin' : 'user'}">
              <div class="ticket-msg-meta">
                <span class="ticket-msg-author">${escapeHtml(m.sender)} ${m.senderRole === 'ADMIN' ? '<span class="role-badge admin">STAFF</span>' : ''}</span>
                <span class="ticket-msg-time">${formatDate(m.createdAt)}</span>
              </div>
              <div class="ticket-msg-text">${escapeHtml(m.text)}</div>
            </div>
          `).join('')}
        </div>

        ${t.status !== 'RESOLVED' ? `
          <form onsubmit="handleUserTicketReply('${t.id}', event)" class="ticket-reply-box">
            <input type="text" id="replyInput-${t.id}" class="form-input" placeholder="Type your reply..." required style="flex:1;">
            <button type="submit" class="btn btn-primary btn-sm"><i class="fa-solid fa-paper-plane"></i> Reply</button>
          </form>
        ` : ''}
      </div>
    `;
  }).join('');
}

async function handleCreateTicketSubmit(e) {
  e.preventDefault();
  const subject = document.getElementById('ticketSubject').value.trim();
  const category = document.getElementById('ticketCategory').value;
  const message = document.getElementById('ticketMessage').value.trim();

  if (!subject || !message) {
    showToast('Subject and message required');
    return;
  }

  const btn = e.target.querySelector('button[type="submit"]');
  const originalHtml = setButtonLoading(btn, 'Creating Ticket...');

  try {
    const res = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, category, message })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Support ticket opened!');
      hideCreateTicketForm();
      document.getElementById('createTicketForm').reset();
      loadUserTickets();
    } else {
      showToast(data.error || 'Failed to create ticket');
    }
  } catch (err) {
    console.error(err);
    showToast('Network error submitting ticket.');
  } finally {
    resetButtonLoading(btn);
  }
}

async function handleUserTicketReply(ticketId, e) {
  e.preventDefault();
  const input = document.getElementById(`replyInput-${ticketId}`);
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const btn = e.target.querySelector('button[type="submit"]');
  const originalHtml = setButtonLoading(btn, 'Sending...');

  try {
    const res = await fetch(`/api/tickets/${ticketId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Reply sent!');
      loadUserTickets();
    } else {
      showToast(data.error || 'Failed to send reply');
    }
  } catch (err) {
    console.error(err);
    showToast('Network error sending reply.');
  } finally {
    resetButtonLoading(btn);
  }
}
