(() => {
  'use strict';

  let pendingEmail = '';
  let pendingOtpType = 'REGISTRATION'; // 'REGISTRATION' or 'LOGIN_2FA'

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
    document.getElementById('tabLogin').classList.toggle('active', mode === 'login');
    document.getElementById('tabRegister').classList.toggle('active', mode === 'register');

    document.getElementById('loginForm').style.display = mode === 'login' ? 'grid' : 'none';
    document.getElementById('registerForm').style.display = mode === 'register' ? 'grid' : 'none';
    document.getElementById('otpForm').style.display = mode === 'otp' ? 'grid' : 'none';
    document.getElementById('forgotForm').style.display = mode === 'forgot' ? 'grid' : 'none';
    document.getElementById('resetForm').style.display = mode === 'reset' ? 'grid' : 'none';

    document.getElementById('authAlert').style.display = 'none';

    if (mode === 'login') {
      document.getElementById('authKicker').textContent = 'WELCOME BACK';
      document.getElementById('authTitle').textContent = 'Sign in to your account';
      document.getElementById('authIntro').textContent = 'Access your orders, keys, balance, and support tickets.';
    } else if (mode === 'register') {
      document.getElementById('authKicker').textContent = 'GET STARTED';
      document.getElementById('authTitle').textContent = 'Create your customer account';
      document.getElementById('authIntro').textContent = 'Your orders and delivered keys will stay attached to this account.';
    } else if (mode === 'otp') {
      document.getElementById('authKicker').textContent = 'SECURITY VERIFICATION';
      document.getElementById('authTitle').textContent = pendingOtpType === 'LOGIN_2FA' ? 'Smart 2FA Sign-In' : 'Verify Email Address';
      document.getElementById('authIntro').textContent = `Enter the 6-digit code sent to ${pendingEmail || 'your email'}.`;
    } else if (mode === 'forgot') {
      document.getElementById('authKicker').textContent = 'ACCOUNT RECOVERY';
      document.getElementById('authTitle').textContent = 'Forgot your password?';
      document.getElementById('authIntro').textContent = 'Enter your email address to receive a 6-digit reset code.';
    } else if (mode === 'reset') {
      document.getElementById('authKicker').textContent = 'RESET PASSWORD';
      document.getElementById('authTitle').textContent = 'Set new password';
      document.getElementById('authIntro').textContent = 'Enter the 6-digit code from your email and your new password.';
    }
  };

  window.togglePassword = (inputId, button) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    button.innerHTML = `<i class="fa-regular ${reveal ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
    button.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
  };

  window.resendOtpCode = async () => {
    if (!pendingEmail) return showAlert('No email specified for OTP resend.');
    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: pendingEmail, type: pendingOtpType })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resend code.');
      showAlert(data.message || 'A new 6-digit code has been sent to your email.', 'success');
    } catch (err) {
      showAlert(err.message || 'Error resending verification code.');
    }
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
      if (!response.ok) throw new Error(data.error || 'We could not complete that request.');

      if (data.requiresVerification || data.requires2FA) {
        pendingEmail = payload.email;
        pendingOtpType = data.requires2FA ? 'LOGIN_2FA' : 'REGISTRATION';
        window.switchAuthTab('otp');
        showAlert(data.message || 'A 6-digit verification code has been sent to your email.', 'success');
        setSubmitting(button, false);
        return;
      }

      if (endpoint.endsWith('forgot-password')) {
        pendingEmail = payload.email;
        document.getElementById('resetCodeInput').value = '';
        window.switchAuthTab('reset');
        showAlert(data.message || 'Check your email for the 6-digit password reset code.', 'success');
        setSubmitting(button, false);
        return;
      }

      if (endpoint.endsWith('reset-password')) {
        window.switchAuthTab('login');
        showAlert(data.message || 'Password reset! You can now sign in with your new password.', 'success');
        setSubmitting(button, false);
        return;
      }

      showAlert('Signed in! Loading your account…', 'success');
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
    const otpForm = document.getElementById('otpForm');
    const forgotForm = document.getElementById('forgotForm');
    const resetForm = document.getElementById('resetForm');
    const password = document.getElementById('regPassword');

    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const passwordValue = document.getElementById('loginPassword').value;
      if (!email || !passwordValue) return showAlert('Enter your email address and password.');
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

    otpForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const code = document.getElementById('otpCodeInput').value.trim();
      if (!code || code.length !== 6) return showAlert('Enter the 6-digit OTP code sent to your email.');
      const endpoint = pendingOtpType === 'LOGIN_2FA' ? '/api/auth/verify-login-otp' : '/api/auth/verify-otp';
      submitAuth(endpoint, { email: pendingEmail, code }, document.getElementById('otpVerifyBtn'), 'Verifying code…');
    });

    forgotForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const email = document.getElementById('forgotEmailInput').value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return showAlert('Enter a valid email address.');
      submitAuth('/api/auth/forgot-password', { email }, document.getElementById('forgotBtn'), 'Sending code…');
    });

    resetForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const code = document.getElementById('resetCodeInput').value.trim();
      const newPassword = document.getElementById('resetPasswordInput').value;
      if (!code || code.length !== 6) return showAlert('Enter the 6-digit reset code.');
      if (newPassword.length < 8 || !/\d/.test(newPassword)) return showAlert('Password must be at least 8 characters with a number.');
      submitAuth('/api/auth/reset-password', { email: pendingEmail, code, newPassword }, document.getElementById('resetBtn'), 'Resetting password…');
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
