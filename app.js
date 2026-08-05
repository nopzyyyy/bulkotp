let PRODUCTS = [];
let currentCart = [];
let activeProduct = null;
let activeCategoryFilter = 'all';

let selectedPaymentMethod = 'crypto';
let selectedCryptoCoin = 'usdt_trc20';
let cryptoWallets = {
  btc: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  usdt_trc20: 'T9yD14Nj9j7xAB4dbGeiX9hA2A1bC3dE4f',
  eth: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
  sol: '7v99fvB1iEe4aV8yK91qR9tL8mX7zP4qS5wE2r1tN8y',
  ltc: 'LTC1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
};

// Smooth Mouse Interpolation (Lerp) Variables
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight * 0.3;
let targetX = mouseX;
let targetY = mouseY;

document.addEventListener('DOMContentLoaded', () => {
  fetchProductsFromBackend();
  fetchWalletsFromBackend();

  updateCartBadge();
  initNative3DModel();
  initBackgroundParticles();

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

async function fetchWalletsFromBackend() {
  try {
    const res = await fetch('/api/wallets');
    if (res.ok) {
      const data = await res.json();
      cryptoWallets = { ...cryptoWallets, ...data };
    }
  } catch (err) {
    console.log('Using default wallet configurations.');
  }
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
}

function openProductDetail(productId) {
  activeProduct = PRODUCTS.find(p => p.id === productId);
  if (!activeProduct) return;
  
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
  selectedPaymentMethod = method;
  const options = document.querySelectorAll('.payment-option');
  options.forEach(opt => opt.classList.remove('active'));
  if (element) element.classList.add('active');

  const cryptoBox = document.getElementById('cryptoPaymentBox');
  if (cryptoBox) {
    cryptoBox.style.display = method === 'crypto' ? 'block' : 'none';
  }
}

function selectCryptoCoin(coin, element) {
  selectedCryptoCoin = coin;
  const buttons = document.querySelectorAll('.crypto-coin-btn');
  buttons.forEach(b => b.classList.remove('active'));
  if (element) element.classList.add('active');

  const addressEl = document.getElementById('activeCryptoAddress');
  const networkLabel = document.getElementById('cryptoNetworkLabel');

  const networkNames = {
    usdt_trc20: 'USDT (TRC-20 Network)',
    btc: 'Bitcoin Native Address',
    eth: 'Ethereum (ERC-20 Network)',
    sol: 'Solana Network',
    ltc: 'Litecoin Network'
  };

  if (networkLabel) networkLabel.textContent = `Deposit Address (${networkNames[coin]}):`;
  if (addressEl) addressEl.textContent = cryptoWallets[coin] || 'Wallet Address Not Set';
}

function copyCryptoAddress() {
  const addressEl = document.getElementById('activeCryptoAddress');
  if (addressEl && addressEl.textContent) {
    navigator.clipboard.writeText(addressEl.textContent).then(() => {
      showToast('Wallet address copied to clipboard!');
    }).catch(() => {
      showToast('Failed to copy address');
    });
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
    
    const formStep = document.getElementById('checkoutFormStep');
    const successStep = document.getElementById('checkoutSuccessStep');
    if (formStep) formStep.style.display = 'block';
    if (successStep) successStep.style.display = 'none';

    selectCryptoCoin(selectedCryptoCoin, document.querySelector('.crypto-coin-btn.active'));
    
    modal.classList.add('active');
  }
}

function closeCheckoutModal() {
  const modal = document.getElementById('checkoutModal');
  if (modal) modal.classList.remove('active');
}

async function processCheckout(event) {
  if (event) event.preventDefault();
  
  const emailInput = document.getElementById('userEmail');
  const email = emailInput ? emailInput.value.trim() : '';

  if (!email || !email.includes('@')) {
    showToast('Please enter a valid email address.');
    if (emailInput) emailInput.focus();
    return;
  }

  const btn = document.getElementById('payBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing & Generating Key...';
  }

  try {
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        cart: currentCart,
        paymentMethod: selectedPaymentMethod === 'crypto' ? `Crypto (${selectedCryptoCoin.toUpperCase()})` : selectedPaymentMethod
      })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      renderSuccessKeys(data.keys || [data.dispensedKey]);
      
      const formStep = document.getElementById('checkoutFormStep');
      const successStep = document.getElementById('checkoutSuccessStep');
      
      if (formStep) formStep.style.display = 'none';
      if (successStep) successStep.style.display = 'block';
      
      currentCart = [];
      updateCartBadge();
      showToast('Payment successful! Key generated.');
      fetchProductsFromBackend(); // Refresh stock counts
    } else {
      showToast(data.error || 'Payment failed. Please try again.');
    }
  } catch (err) {
    console.error('Checkout error:', err);
    // Offline simulation fallback
    const mainProduct = currentCart[0];
    const prefix = mainProduct ? mainProduct.prefix : 'BOT';
    const fallbackKey = generateKey(prefix);

    renderSuccessKeys([fallbackKey]);

    const formStep = document.getElementById('checkoutFormStep');
    const successStep = document.getElementById('checkoutSuccessStep');
    if (formStep) formStep.style.display = 'none';
    if (successStep) successStep.style.display = 'block';

    currentCart = [];
    updateCartBadge();
    showToast('Payment completed!');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-bolt"></i> Complete Purchase & Get Key';
    }
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
