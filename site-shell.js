(() => {
  'use strict';

  const state = {
    pendingRequests: 0,
    requestShowTimer: null,
    safetyTimer: null,
    hideTimer: null,
    user: null
  };

  const originalFetch = window.fetch.bind(window);

  function overlay() {
    return document.getElementById('globalLoadingOverlay');
  }

  function showLoading(text = 'Loading…') {
    const el = overlay();
    if (!el) return;

    window.clearTimeout(state.hideTimer);
    window.clearTimeout(state.safetyTimer);
    const label = el.querySelector('.spinner-loading-text');
    if (label) label.textContent = text;
    el.classList.add('active');
    el.setAttribute('aria-hidden', 'false');

    // Recovery is deliberately longer than a normal request. It prevents a
    // failed navigation or interrupted request from trapping the customer.
    state.safetyTimer = window.setTimeout(() => hideLoading(true), 12000);
  }

  function hideLoading(force = false) {
    if (!force && state.pendingRequests > 0) return;
    const el = overlay();
    if (!el) return;

    window.clearTimeout(state.requestShowTimer);
    window.clearTimeout(state.safetyTimer);
    state.hideTimer = window.setTimeout(() => {
      el.classList.remove('active');
      el.setAttribute('aria-hidden', 'true');
    }, 180);
  }

  window.fetch = async (...args) => {
    state.pendingRequests += 1;
    if (state.pendingRequests === 1) {
      // Fast requests do not flash the full-screen loader. Slow ones do.
      state.requestShowTimer = window.setTimeout(() => showLoading('Loading…'), 180);
    }

    try {
      return await originalFetch(...args);
    } finally {
      state.pendingRequests = Math.max(0, state.pendingRequests - 1);
      if (state.pendingRequests === 0) hideLoading();
    }
  };

  function getCartCount() {
    try {
      const cart = JSON.parse(localStorage.getItem('bulk_otp_cart') || '[]');
      return Array.isArray(cart)
        ? cart.reduce((sum, item) => sum + Math.max(0, Number(item.qty) || 0), 0)
        : 0;
    } catch (_) {
      return 0;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function updateCartBadges() {
    const count = getCartCount();
    document.querySelectorAll('.cart-badge').forEach((badge) => {
      badge.textContent = String(count);
      badge.hidden = count === 0;
    });
  }

  function profileMarkup(user) {
    if (!user) {
      return `
        <a class="nav-profile-btn" href="login.html" title="Sign in" aria-label="Sign in">
          <i class="fa-solid fa-user"></i>
        </a>`;
    }

    const email = escapeHtml(user.email);
    const role = escapeHtml(user.role || 'USER');
    const balance = Number(user.balance || 0).toFixed(2);

    return `
      <div class="user-profile-menu-wrap">
        <button class="nav-profile-btn is-authenticated" type="button" onclick="SiteShell.toggleProfile(event)" title="${email}" aria-label="Open account menu" aria-expanded="false">
          <i class="fa-solid fa-user"></i>
          <span class="profile-status-dot"></span>
        </button>
        <div id="userProfileDropdown" class="user-profile-dropdown" role="menu">
          <div class="dropdown-header">
            <span class="dropdown-user-email">${email}</span>
            <span class="dropdown-user-role">${role}</span>
          </div>
          <div class="dropdown-balance-row">
            <span>Store balance</span>
            <strong>$${balance}</strong>
          </div>
          <div class="dropdown-divider"></div>
          <a class="dropdown-item" href="orders.html"><i class="fa-solid fa-box-open text-accent"></i> Orders &amp; keys</a>
          <a class="dropdown-item" href="index.html?open=tickets" onclick="return SiteShell.openSupport(event)"><i class="fa-regular fa-life-ring text-green"></i> Support tickets</a>
          ${user.role === 'ADMIN' ? '<a class="dropdown-item" href="admin.html"><i class="fa-solid fa-gauge-high text-accent"></i> Admin panel</a>' : ''}
          <div class="dropdown-divider"></div>
          <button class="dropdown-item text-red" type="button" onclick="SiteShell.logout()"><i class="fa-solid fa-right-from-bracket"></i> Sign out</button>
        </div>
      </div>`;
  }

  function renderProfile() {
    document.querySelectorAll('[data-user-header]').forEach((container) => {
      container.innerHTML = profileMarkup(state.user);
    });
  }

  async function refreshAuth() {
    try {
      const response = await originalFetch('/api/auth/me', { credentials: 'same-origin' });
      const data = await response.json();
      state.user = response.ok && data.authenticated ? data.user : null;
    } catch (_) {
      state.user = null;
    }
    renderProfile();
    document.dispatchEvent(new CustomEvent('site:auth', { detail: { user: state.user } }));
    return state.user;
  }

  function toggleProfile(event) {
    event?.stopPropagation();
    const dropdown = document.getElementById('userProfileDropdown');
    const button = event?.currentTarget;
    if (!dropdown) return;
    const open = dropdown.classList.toggle('active');
    button?.setAttribute('aria-expanded', String(open));
  }

  async function logout() {
    if (typeof showGlobalLoading === 'function') showGlobalLoading('Signing out...');
    else showLoading('Signing out…');

    try {
      await originalFetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (_) {}

    state.user = null;
    if (typeof currentUser !== 'undefined') currentUser = null;

    try {
      localStorage.removeItem('user');
      sessionStorage.removeItem('user');
    } catch (_) {}

    if (window.location.pathname.endsWith('/admin.html')) {
      window.location.href = 'login.html';
    } else {
      window.location.href = 'index.html?logged_out=' + Date.now();
    }
  }

  function openSupport(event) {
    if (location.pathname.endsWith('/') || location.pathname.endsWith('/index.html')) {
      event?.preventDefault();
      document.getElementById('userProfileDropdown')?.classList.remove('active');
      if (typeof window.openUserTicketsModal === 'function') {
        window.openUserTicketsModal();
        return false;
      }
    }
    return true;
  }

  function handleNavigation(event) {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.target === '_blank' || link.hasAttribute('download') || link.dataset.noLoading !== undefined) return;

    let destination;
    try {
      destination = new URL(link.href, location.href);
    } catch (_) {
      return;
    }

    if (destination.origin !== location.origin || !['http:', 'https:'].includes(destination.protocol)) return;
    const sameDocument = destination.pathname === location.pathname && destination.search === location.search;
    if (sameDocument && destination.hash) return;

    event.preventDefault();
    showLoading('Loading page…');
    requestAnimationFrame(() => window.setTimeout(() => location.assign(destination.href), 45));
  }

  function markActiveNavigation() {
    const page = document.body.dataset.page;
    document.querySelectorAll('[data-nav]').forEach((link) => {
      link.classList.toggle('active', link.dataset.nav === page);
    });
  }

  function handleLegacyDeepLinks() {
    const action = new URLSearchParams(location.search).get('open');
    if (action === 'orders' && !location.pathname.endsWith('/orders.html')) {
      location.replace('orders.html');
      return;
    }
    if (action === 'tickets') {
      window.setTimeout(() => {
        if (typeof window.openUserTicketsModal === 'function') window.openUserTicketsModal();
      }, 350);
    }
  }

  function init() {
    const el = overlay();
    if (el) {
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-hidden', 'true');
    }
    markActiveNavigation();
    updateCartBadges();
    refreshAuth();
    handleLegacyDeepLinks();
    document.addEventListener('click', handleNavigation);
    document.addEventListener('click', (event) => {
      const dropdown = document.getElementById('userProfileDropdown');
      if (dropdown && !event.target.closest('.user-profile-menu-wrap')) dropdown.classList.remove('active');
    });
    window.addEventListener('pageshow', () => hideLoading(true));
    window.addEventListener('storage', updateCartBadges);
  }

  window.SiteShell = {
    showLoading,
    hideLoading,
    refreshAuth,
    updateCartBadges,
    toggleProfile,
    openSupport,
    logout,
    get user() { return state.user; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
