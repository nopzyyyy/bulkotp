(() => {
  'use strict';

  const redirectTarget = (() => {
    const value = new URLSearchParams(location.search).get('redirect');
    return value && value.startsWith('/') && !value.startsWith('//') ? value : '/index.html';
  })();

  function showAlert(message, type = 'error') {
    const box = document.getElementById('authAlert');
    if (!box) return;
    box.className = `auth-alert ${type}`;
    box.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i><span>${escapeHtml(message)}</span>`;
    box.style.display = 'flex';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function setSubmitting(button, submitting, text) {
    if (!button) return;
    if (submitting) {
      button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>${text}</span>`;
    } else {
      button.disabled = false;
      button.innerHTML = button.dataset.originalHtml || button.innerHTML;
    }
  }

  window.switchAuthTab = (mode) => {
    const loginMode = mode === 'login';
    document.getElementById('tabLogin').classList.toggle('active', loginMode);
    document.getElementById('tabLogin').setAttribute('aria-selected', String(loginMode));
    document.getElementById('tabRegister').classList.toggle('active', !loginMode);
    document.getElementById('tabRegister').setAttribute('aria-selected', String(!loginMode));
    document.getElementById('loginForm').style.display = loginMode ? 'grid' : 'none';
    document.getElementById('registerForm').style.display = loginMode ? 'none' : 'grid';
    document.getElementById('authAlert').style.display = 'none';
    document.getElementById('authKicker').textContent = loginMode ? 'WELCOME BACK' : 'GET STARTED';
    document.getElementById('authTitle').textContent = loginMode ? 'Sign in to your account' : 'Create your customer account';
    document.getElementById('authIntro').textContent = loginMode
      ? 'Access your orders, keys, balance, and support tickets.'
      : 'Your orders and delivered keys will stay attached to this account.';
  };

  window.togglePassword = (inputId, button) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    button.innerHTML = `<i class="fa-regular ${reveal ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
    button.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
  };

  async function submitAuth(endpoint, payload, button, loadingText) {
    setSubmitting(button, true, loadingText);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'We could not complete that request.');
      showAlert(endpoint.endsWith('register') ? 'Account created. Taking you to the store…' : 'Signed in. Loading your account…', 'success');
      await window.SiteShell?.refreshAuth();
      window.setTimeout(() => location.assign(data.user?.role === 'ADMIN' && redirectTarget === '/index.html' ? '/admin.html' : redirectTarget), 350);
    } catch (error) {
      showAlert(error.message || 'Unable to connect. Please try again.');
      setSubmitting(button, false);
    }
  }

  function initParticles() {
    const canvas = document.getElementById('bgParticlesCanvas');
    if (!canvas || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const context = canvas.getContext('2d');
    let width;
    let height;
    let particles = [];

    function resize() {
      const ratio = Math.min(devicePixelRatio || 1, 2);
      width = innerWidth;
      height = innerHeight;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      particles = Array.from({ length: Math.min(46, Math.floor(width / 18)) }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.4 + 0.45,
        speed: Math.random() * 0.35 + 0.18,
        alpha: Math.random() * 0.16 + 0.04
      }));
    }

    function draw() {
      context.clearRect(0, 0, width, height);
      particles.forEach((particle, index) => {
        particle.y -= particle.speed;
        if (particle.y < -5) { particle.y = height + 5; particle.x = Math.random() * width; }
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fillStyle = index % 4 === 0 ? `rgba(255,37,92,${particle.alpha})` : `rgba(255,255,255,${particle.alpha * 0.55})`;
        context.fill();
      });
      requestAnimationFrame(draw);
    }

    resize();
    addEventListener('resize', resize, { passive: true });
    draw();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const password = document.getElementById('regPassword');

    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const passwordValue = document.getElementById('loginPassword').value;
      if (!email || !passwordValue) return showAlert('Enter your email or username and password.');
      submitAuth('/api/auth/login', { email, password: passwordValue }, document.getElementById('loginBtn'), 'Signing in…');
    });

    registerForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const email = document.getElementById('regEmail').value.trim();
      const passwordValue = password.value;
      const confirmation = document.getElementById('regConfirmPassword').value;
      if (!/^\S+@\S+\.\S+$/.test(email)) return showAlert('Enter a valid email address.');
      if (passwordValue.length < 8) return showAlert('Use a password with at least 8 characters.');
      if (!/\d/.test(passwordValue)) return showAlert('Add at least one number to your password.');
      if (passwordValue !== confirmation) return showAlert('The passwords do not match.');
      if (!document.getElementById('regConsent').checked) return showAlert('Please confirm the digital delivery notice.');
      submitAuth('/api/auth/register', { email, password: passwordValue }, document.getElementById('regBtn'), 'Creating account…');
    });

    password.addEventListener('input', () => {
      const value = password.value;
      const score = [value.length >= 8, /\d/.test(value), /[a-z]/.test(value) && /[A-Z]/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length;
      const bar = document.getElementById('passwordStrengthBar');
      const label = document.getElementById('passwordStrengthText');
      bar.style.width = `${score * 25}%`;
      bar.dataset.score = String(score);
      label.textContent = score < 2 ? 'Use 8+ characters with a number.' : score < 4 ? 'Good password.' : 'Strong password.';
    });

    if (new URLSearchParams(location.search).get('mode') === 'register') window.switchAuthTab('register');
    initParticles();
  });
})();
