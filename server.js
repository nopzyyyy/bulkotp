require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5500;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const NOWPAYMENTS_API_KEY = (process.env.NOWPAYMENTS_API_KEY || '').trim();
const NOWPAYMENTS_IPN_SECRET = (process.env.NOWPAYMENTS_IPN_SECRET || '').trim();
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';
const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim();

app.set('trust proxy', 1);
app.disable('x-powered-by');

// 1. Extreme Security Headers & CSP Middleware
app.use(cors({ origin: false }));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:; img-src 'self' data: https: blob:; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://nowpayments.io; connect-src 'self' https://api.nowpayments.io;"
  });
  if (req.secure || req.get('x-forwarded-proto') === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
});

// 2. Direct Sensitive Directory & File Access Shield (Prevent Data Leaks)
app.use(['/data', '/data/*', '/scripts', '/scripts/*', '/scratch', '/scratch/*', '/.git', '/.env'], (req, res) => {
  res.status(403).json({ error: 'Access Denied: Protected System Resource.' });
});

// 3. Input Sanitization & Anti-Injection Middleware
function sanitizeValue(data) {
  if (typeof data === 'string') {
    return data
      .replace(/\0/g, '')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript\s*:/gi, '');
  }
  if (Array.isArray(data)) {
    return data.map(sanitizeValue);
  }
  if (data !== null && typeof data === 'object') {
    const clean = {};
    for (const key of Object.keys(data)) {
      const cleanKey = key.replace(/^\$|\./g, '');
      clean[cleanKey] = sanitizeValue(data[key]);
    }
    return clean;
  }
  return data;
}

app.use(express.json({
  limit: '10mb',
  verify: (req, res, buffer) => { req.rawBody = Buffer.from(buffer); }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  if (req.body) req.body = sanitizeValue(req.body);
  if (req.query) req.query = sanitizeValue(req.query);
  if (req.params) req.params = sanitizeValue(req.params);
  next();
});

app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path === '/upload' || req.is('application/json')) return next();
  return res.status(415).json({ error: 'API requests must use application/json.' });
});

// Helper: Cookie Parser
function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      const key = parts.shift()?.trim();
      if (!key) return;
      let val = parts.join('=').trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      try {
        list[key] = decodeURIComponent(val);
      } catch (_) {
        list[key] = val;
      }
    });
  }
  return list;
}

// Custom Cookie Middleware
app.use((req, res, next) => {
  req.cookies = parseCookies(req);
  next();
});

// Ensure Directories Exist
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const UPLOADS_DIR = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(__dirname, 'uploads');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// JSON File Database Paths
const FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  sessions: path.join(DATA_DIR, 'sessions.json'),
  products: path.join(DATA_DIR, 'products.json'),
  orders: path.join(DATA_DIR, 'orders.json'),
  tickets: path.join(DATA_DIR, 'tickets.json'),
  auditLogs: path.join(DATA_DIR, 'audit-logs.json'),
  store: path.join(DATA_DIR, 'store.json'),
  transactions: path.join(DATA_DIR, 'transactions.json'),
  vouchers: path.join(DATA_DIR, 'vouchers.json'),
  otps: path.join(DATA_DIR, 'otps.json'),
  paymentSettings: path.join(DATA_DIR, 'payment_settings.json')
};

function getPaymentSettings() {
  const defaults = {
    cartApiKey: (process.env.NOWPAYMENTS_API_KEY || 'FSXZNYD-3MH4KB4-P92JQS7-98PB9P9').trim(),
    balanceApiKey: (process.env.NOWPAYMENTS_BALANCE_API_KEY || 'BXJ2GSJ-ZNCM6ZP-QJBZNF4-JDWRN8M').trim(),
    ipnSecret: (process.env.NOWPAYMENTS_IPN_SECRET || 'EHeUGXXIUpLjsGZWW/PuhUJ7+jTGFL8V').trim()
  };
  let stored = {};
  try {
    const file = FILES.paymentSettings;
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      if (content && content.trim().length > 0) {
        stored = JSON.parse(content);
      }
    }
  } catch (err) {
    console.error('Error reading paymentSettings file:', err);
  }

  const cartApiKey = String(stored.cartApiKey || defaults.cartApiKey || '').trim();
  const balanceApiKey = String(stored.balanceApiKey || defaults.balanceApiKey || cartApiKey || '').trim();
  const ipnSecret = String(stored.ipnSecret || defaults.ipnSecret || '').trim();

  return { cartApiKey, balanceApiKey, ipnSecret };
}

function nowPaymentsConfigured(type = 'cart') {
  const settings = getPaymentSettings();
  const apiKey = type === 'balance' ? (settings.balanceApiKey || settings.cartApiKey) : settings.cartApiKey;
  const looksLikePlaceholder = /placeholder|replace|your[_-]?api/i.test(apiKey);
  const result = Boolean(apiKey && !looksLikePlaceholder);
  console.log('[DEBUG nowPaymentsConfigured]', { type, apiKey, looksLikePlaceholder, result });
  return result;
}

// Ensure Database Backup Directory Exists
const BACKUPS_DIR = process.env.BACKUPS_DIR ? path.resolve(process.env.BACKUPS_DIR) : path.join(__dirname, 'data_backups');
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

// Auto-backup internal database snapshot helper
function autoBackupDatabase(label = 'auto') {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const folder = path.join(BACKUPS_DIR, `snapshot_${label}_${timestamp}`);
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

    Object.values(FILES).forEach(filePath => {
      if (fs.existsSync(filePath)) {
        const basename = path.basename(filePath);
        fs.copyFileSync(filePath, path.join(folder, basename));
      }
    });

    // Cleanup snapshots older than 48 entries
    const allBackups = fs.readdirSync(BACKUPS_DIR)
      .map(name => path.join(BACKUPS_DIR, name))
      .filter(p => {
        try { return fs.statSync(p).isDirectory(); } catch (_) { return false; }
      })
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

    if (allBackups.length > 48) {
      allBackups.slice(48).forEach(oldDir => {
        try { fs.rmSync(oldDir, { recursive: true, force: true }); } catch (_) {}
      });
    }
  } catch (err) {
    console.error('Error creating database snapshot:', err);
  }
}

// 100% Atomic File Writer (Prevents 0-byte state or file corruption on process kill)
function writeJson(filePath, data) {
  try {
    const jsonStr = JSON.stringify(data, null, 2);
    const tempFile = `${filePath}.${Date.now()}.${Math.floor(Math.random() * 10000)}.tmp`;
    
    // Write to temporary file
    fs.writeFileSync(tempFile, jsonStr, 'utf8');
    
    // Atomic rename replaces original file instantly
    fs.renameSync(tempFile, filePath);
  } catch (err) {
    console.error(`Error writing atomic JSON to ${filePath}:`, err);
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error(`Critical fallback write failed for ${filePath}:`, e);
    }
  }
}

// Resilient JSON Reader with Automatic Backup Snapshot Recovery
function readJson(filePath, fallback = []) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      if (data && data.trim().length > 0) {
        return JSON.parse(data);
      }
    }
  } catch (err) {
    console.error(`Corrupted database file detected at ${filePath}. Attempting auto-recovery:`, err);
  }

  // Attempt auto-recovery from latest backup snapshot
  try {
    const basename = path.basename(filePath);
    if (fs.existsSync(BACKUPS_DIR)) {
      const backups = fs.readdirSync(BACKUPS_DIR)
        .map(name => path.join(BACKUPS_DIR, name))
        .filter(p => {
          try { return fs.statSync(p).isDirectory(); } catch (_) { return false; }
        })
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

      for (const backupDir of backups) {
        const backupFile = path.join(backupDir, basename);
        if (fs.existsSync(backupFile)) {
          const backupData = fs.readFileSync(backupFile, 'utf8');
          if (backupData && backupData.trim().length > 0) {
            const restored = JSON.parse(backupData);
            console.log(`[DATABASE RECOVERY] Successfully auto-restored ${basename} from snapshot ${backupDir}`);
            writeJson(filePath, restored);
            return restored;
          }
        }
      }
    }
  } catch (recoveryErr) {
    console.error(`Auto-recovery failed for ${filePath}:`, recoveryErr);
  }

  return fallback;
}

// Password Hashing: Scrypt (salt:hash)
function hashPasswordScrypt(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPasswordScrypt(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, originalHash] = storedHash.split(':');
  const hashedBuffer = crypto.scryptSync(password, salt, 64);
  const originalBuffer = Buffer.from(originalHash, 'hex');
  if (hashedBuffer.length !== originalBuffer.length) return false;
  return crypto.timingSafeEqual(hashedBuffer, originalBuffer);
}

function nowPaymentsConfigured() {
  const looksLikePlaceholder = /placeholder|replace|your[_-]?api/i.test(NOWPAYMENTS_API_KEY);
  return Boolean(NOWPAYMENTS_API_KEY && NOWPAYMENTS_IPN_SECRET && !looksLikePlaceholder);
}

function secureCookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure || req.get('x-forwarded-proto') === 'https',
    path: '/',
    maxAge: SESSION_TTL_MS
  };
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || '127.0.0.1';
}

let brevoSmtpTransporter = null;

function getBrevoSmtpTransporter() {
  if (!brevoSmtpTransporter) {
    const smtpUser = (process.env.BREVO_USER || process.env.BREVO_SENDER_EMAIL || 'vlogsyyt69@gmail.com').trim();
    brevoSmtpTransporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: {
        user: smtpUser,
        pass: BREVO_API_KEY
      }
    });
  }
  return brevoSmtpTransporter;
}

async function sendBrevoEmail({ toEmail, toName, subject, htmlContent }) {
  if (!BREVO_API_KEY) {
    console.warn('Brevo API key missing.');
    return { success: false, error: 'Brevo API key missing' };
  }

  const senderEmail = (process.env.BREVO_SENDER_EMAIL || 'vlogsyyt69@gmail.com').trim();
  const senderName = (process.env.BREVO_SENDER_NAME || 'BULK OTP').trim();

  // 1. Attempt Brevo v3 Transactional REST API
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: toEmail, name: toName || toEmail.split('@')[0] }],
        subject: subject,
        htmlContent: htmlContent
      })
    });

    const data = await res.json();
    if (res.ok) {
      return { success: true, messageId: data.messageId, provider: 'brevo-rest' };
    }
    console.warn('Brevo REST API returned error:', data.message || data, '- attempting SMTP fallback...');
  } catch (err) {
    console.warn('Brevo REST API request failed:', err.message, '- attempting SMTP fallback...');
  }

  // 2. Fallback to Nodemailer SMTP Transport
  try {
    const transporter = getBrevoSmtpTransporter();
    const info = await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: toEmail,
      subject: subject,
      html: htmlContent
    });
    return { success: true, messageId: info.messageId, provider: 'brevo-smtp' };
  } catch (smtpErr) {
    console.error('Brevo SMTP Transport Error:', smtpErr.message);
    return { success: false, error: smtpErr.message };
  }
}

function generateNumericOtp() {
  return String(crypto.randomInt(100000, 999999));
}

function storeOtp(email, type, ttlMinutes = 5) {
  const cleanEmail = email.toLowerCase().trim();
  const otps = readJson(FILES.otps, []);
  const code = generateNumericOtp();
  const expiresAt = Date.now() + ttlMinutes * 60 * 1000;

  const filtered = otps.filter(o => !(o.email === cleanEmail && o.type === type));
  filtered.push({
    email: cleanEmail,
    code,
    type,
    expiresAt,
    createdAt: new Date().toISOString()
  });

  writeJson(FILES.otps, filtered);
  return code;
}

function verifyOtp(email, code, type) {
  const cleanEmail = email.toLowerCase().trim();
  const cleanCode = String(code || '').trim();
  const otps = readJson(FILES.otps, []);

  const index = otps.findIndex(o => o.email === cleanEmail && o.code === cleanCode && o.type === type && Date.now() <= o.expiresAt);

  if (index === -1) return false;

  otps.splice(index, 1);
  writeJson(FILES.otps, otps);
  return true;
}

async function sendOtpEmail(email, otpCode, type) {
  console.log(`\n=================================================`);
  console.log(`🔑 [BULK OTP CODE] Email: ${email} | Type: ${type} | Code: ${otpCode}`);
  console.log(`=================================================\n`);

  const siteUrl = (PUBLIC_BASE_URL || 'https://bulkotp.com').replace(/\/$/, '');

  let title = 'Verification Code';
  let subtitle = 'Your verification code for BULK OTP is below:';

  if (type === 'REGISTRATION') {
    title = 'Verify Your Email Address';
    subtitle = 'Thank you for registering with BULK OTP! Please use the 6-digit code below to activate your account:';
  } else if (type === 'LOGIN_2FA') {
    title = '2FA Security Verification';
    subtitle = 'A login attempt was detected from a new IP address. Enter the 6-digit security code below to approve sign in:';
  } else if (type === 'PASSWORD_RESET') {
    title = 'Password Reset Request';
    subtitle = 'We received a request to reset your password. Use the 6-digit code below to set a new password:';
  }

  const html = `
    <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; background-color: #0d0d12; color: #ffffff; padding: 40px 20px; text-align: center;">
      <div style="max-width: 520px; margin: 0 auto; background: #14151a; border: 1px solid rgba(230, 0, 50, 0.35); border-radius: 20px; padding: 36px 28px; box-shadow: 0 16px 40px rgba(0,0,0,0.6); position: relative;">
        
        <!-- Website Brand Logo Header -->
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${siteUrl}" style="text-decoration: none; display: inline-block;">
            <img src="${siteUrl}/assets/brand_logo.png" alt="BULK OTP Logo" style="height: 52px; width: auto; max-width: 140px; display: block; margin: 0 auto 10px auto; filter: drop-shadow(0 4px 12px rgba(230,0,50,0.4));">
            <h1 style="color: #ffffff; font-size: 26px; margin: 0; font-weight: 800; letter-spacing: 1px;">BULK <span style="color: #e60032;">OTP</span></h1>
          </a>
        </div>

        <h2 style="color: #ffffff; font-size: 20px; margin-bottom: 12px; font-weight: 700;">${title}</h2>
        <p style="color: #a0a0b0; font-size: 14px; line-height: 1.6; margin-bottom: 28px; max-width: 440px; margin-left: auto; margin-right: auto;">${subtitle}</p>
        
        <!-- 6-Digit OTP Code Display Box -->
        <div style="background: linear-gradient(135deg, rgba(230, 0, 50, 0.15) 0%, rgba(20, 21, 26, 0.9) 100%); border: 2px dashed #e60032; border-radius: 14px; padding: 22px; margin-bottom: 28px; box-shadow: inset 0 0 20px rgba(230, 0, 50, 0.15);">
          <span style="font-family: 'JetBrains Mono', Consolas, monospace; font-size: 38px; font-weight: 800; letter-spacing: 10px; color: #ffffff; text-shadow: 0 0 12px rgba(230, 0, 50, 0.5);">${otpCode}</span>
        </div>

        <!-- Website Crimson Button CTA -->
        <div style="margin-bottom: 24px;">
          <a href="${siteUrl}/login.html" style="background: linear-gradient(135deg, #e60032 0%, #ff255c 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block; box-shadow: 0 6px 20px rgba(230, 0, 50, 0.45); border: 1px solid rgba(255, 255, 255, 0.2);">
            Enter Code on Site &rarr;
          </a>
        </div>

        <p style="color: #707080; font-size: 12px; margin-bottom: 0; line-height: 1.5;">This code is valid for 5 minutes. If you did not request this code, you can safely ignore this email.</p>
      </div>

      <!-- Website Footer Branding & Logo Watermark -->
      <div style="text-align: center; margin-top: 24px;">
        <img src="${siteUrl}/assets/brand_logo.png" alt="" style="height: 24px; width: auto; vertical-align: middle; opacity: 0.6; margin-right: 6px;">
        <span style="color: #505060; font-size: 12px; font-weight: 600;">BULK OTP &bull; Instant Digital Keys</span>
        <p style="color: #404050; font-size: 11px; margin-top: 6px;">&copy; 2026 BULK OTP Store. All rights reserved.</p>
      </div>
    </div>
  `;

  return await sendBrevoEmail({
    toEmail: email,
    toName: email.split('@')[0],
    subject: `[BULK OTP] ${title} - ${otpCode}`,
    htmlContent: html
  });
}

async function sendOrderConfirmationEmail(userEmail, order) {
  const siteUrl = (PUBLIC_BASE_URL || 'https://bulkotp.com').replace(/\/$/, '');

  const itemsHtml = (order.items || []).map(item => `
    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
      <td style="padding: 12px 16px; color: #ffffff; font-weight: 600;">${item.title || item.name}</td>
      <td style="padding: 12px 16px; color: #a0a0b0; text-align: center;">${item.qty || 1}</td>
      <td style="padding: 12px 16px; color: #ffffff; text-align: right; font-weight: 700;">$${Number(item.price || 0).toFixed(2)}</td>
    </tr>
  `).join('');

  const keysHtml = (order.purchasedItems || []).map(k => `
    <div style="background: #1c1d24; border: 1px solid rgba(230, 0, 50, 0.35); border-radius: 10px; padding: 14px; margin-bottom: 10px; font-family: 'JetBrains Mono', Consolas, monospace; font-size: 14px; color: #22c55e; word-break: break-all; box-shadow: inset 0 2px 4px rgba(0,0,0,0.4);">
      <span style="color: #a0a0b0; font-size: 11px; display: block; margin-bottom: 4px; font-family: sans-serif; text-transform: uppercase;">KEY / CREDENTIALS:</span>
      ${k.credentials}
    </div>
  `).join('');

  const html = `
    <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; background-color: #0d0d12; color: #ffffff; padding: 40px 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: #14151a; border: 1px solid rgba(230, 0, 50, 0.35); border-radius: 20px; padding: 36px 30px; box-shadow: 0 16px 40px rgba(0,0,0,0.6);">
        
        <!-- Header with Website Logo -->
        <div style="text-align: center; margin-bottom: 28px;">
          <a href="${siteUrl}" style="text-decoration: none; display: inline-block;">
            <img src="${siteUrl}/assets/brand_logo.png" alt="BULK OTP Logo" style="height: 54px; width: auto; max-width: 150px; display: block; margin: 0 auto 10px auto; filter: drop-shadow(0 4px 12px rgba(230,0,50,0.4));">
            <h1 style="color: #ffffff; font-size: 28px; margin: 0; font-weight: 800; letter-spacing: 1px;">BULK <span style="color: #e60032;">OTP</span></h1>
          </a>
          <p style="color: #22c55e; font-size: 14px; font-weight: 700; margin-top: 8px;"><span style="display: inline-block; background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.3); padding: 4px 12px; border-radius: 20px;">✓ Payment Confirmed & Delivered</span></p>
        </div>

        <!-- Order Summary Box -->
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 18px 20px; margin-bottom: 28px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td>
                <span style="color: #707080; font-size: 11px; text-transform: uppercase; display: block; letter-spacing: 0.5px;">ORDER NUMBER</span>
                <strong style="color: #ffffff; font-size: 17px; font-family: monospace;">#${order.orderNumber || order.id}</strong>
              </td>
              <td style="text-align: right;">
                <span style="color: #707080; font-size: 11px; text-transform: uppercase; display: block; letter-spacing: 0.5px;">TOTAL PAID</span>
                <strong style="color: #e60032; font-size: 20px;">$${Number(order.total || 0).toFixed(2)} USD</strong>
              </td>
            </tr>
          </table>
        </div>

        <h3 style="color: #ffffff; font-size: 16px; margin-bottom: 14px; font-weight: 700;">Purchased Items</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 28px; font-size: 14px;">
          <thead>
            <tr style="background: rgba(255,255,255,0.05); color: #808090; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
              <th style="padding: 12px 16px; text-align: left; border-radius: 8px 0 0 8px;">Item Description</th>
              <th style="padding: 12px 16px; text-align: center;">Qty</th>
              <th style="padding: 12px 16px; text-align: right; border-radius: 0 8px 8px 0;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        ${keysHtml ? `
          <h3 style="color: #ffffff; font-size: 16px; margin-bottom: 14px; font-weight: 700;">Delivered Access Keys</h3>
          ${keysHtml}
        ` : ''}

        <!-- Website Crimson Button CTA -->
        <div style="text-align: center; margin-top: 36px; margin-bottom: 12px;">
          <a href="${siteUrl}/orders.html" style="background: linear-gradient(135deg, #e60032 0%, #ff255c 100%); color: #ffffff; text-decoration: none; padding: 15px 32px; border-radius: 12px; font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block; box-shadow: 0 6px 20px rgba(230, 0, 50, 0.45); border: 1px solid rgba(255, 255, 255, 0.2);">
            View Keys in Account &rarr;
          </a>
        </div>
      </div>

      <!-- Website Footer Branding & Watermark Logo -->
      <div style="text-align: center; margin-top: 24px;">
        <img src="${siteUrl}/assets/brand_logo.png" alt="" style="height: 24px; width: auto; vertical-align: middle; opacity: 0.6; margin-right: 6px;">
        <span style="color: #505060; font-size: 12px; font-weight: 600;">BULK OTP &bull; Instant Digital Keys</span>
        <p style="color: #404050; font-size: 11px; margin-top: 6px;">Thank you for shopping at BULK OTP!</p>
      </div>
    </div>
  `;

  return await sendBrevoEmail({
    toEmail: userEmail,
    toName: userEmail.split('@')[0],
    subject: `[BULK OTP] Order Receipt #${order.orderNumber || order.id} ($${Number(order.total || 0).toFixed(2)})`,
    htmlContent: html
  });
}

function createSession(userId) {
  const now = Date.now();
  const sessions = readJson(FILES.sessions, []).filter(session => session.expiresAt > now);
  const session = {
    token: crypto.randomBytes(32).toString('hex'),
    userId,
    expiresAt: now + SESSION_TTL_MS
  };
  sessions.push(session);
  writeJson(FILES.sessions, sessions);
  return session;
}

const authAttempts = new Map();
function authRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const entry = authAttempts.get(key) || { count: 0, resetAt: now + (15 * 60 * 1000) };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + (15 * 60 * 1000);
  }
  entry.count += 1;
  authAttempts.set(key, entry);
  if (entry.count > 20) {
    res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
    return res.status(429).json({ error: 'Too many sign-in attempts. Please wait and try again.' });
  }
  next();
}

// Default Seed Data Initialization
function initDatabase() {
  // 1. Initial Products
  let products = readJson(FILES.products, null);
  if (!products || !Array.isArray(products) || products.length === 0) {
    products = [
      {
        id: 'compact-1h',
        category: 'hourly',
        title: 'OTP BOT COMPACT Pass: 1 - HOUR COMPACT Key',
        shortTitle: '1-Hour Compact Key',
        price: 17.00,
        hidden: false,
        duration: '1-Hour',
        description: 'Experience the power of Bulk OTP Bot with the MINI Pass: 1 - HOUR COMPACT Key. Instant telegram bot access.',
        prefix: 'BOT-COMPACT',
        art: 'assets/compact_pass_1h.jpg',
        stock: [
          { id: 'stk_101', credentials: 'BOT-COMPACT-9A8B-7C6D-KEY', isSold: false },
          { id: 'stk_102', credentials: 'BOT-COMPACT-1E2F-3G4H-KEY', isSold: false },
          { id: 'stk_103', credentials: 'BOT-COMPACT-5I6J-7K8L-KEY', isSold: false },
          { id: 'stk_104', credentials: 'BOT-COMPACT-9M0N-1P2Q-KEY', isSold: false },
          { id: 'stk_105', credentials: 'BOT-COMPACT-3R4S-5T6U-KEY', isSold: false }
        ]
      },
      {
        id: 'extended-3h',
        category: 'hourly',
        title: 'OTP BOT EXTENDED Pass: 3 - HOUR EXTENDED Key',
        shortTitle: '3-Hour Extended Key',
        price: 30.00,
        hidden: false,
        duration: '3-Hour',
        description: 'OTP BOT EXTENDED Pass: 3 - HOUR EXTENDED Key. High-speed session handling with zero interruption.',
        prefix: 'BOT-EXTENDED',
        art: 'assets/extended_pass_3h.jpg',
        stock: [
          { id: 'stk_201', credentials: 'BOT-EXTENDED-AA11-BB22-KEY', isSold: false },
          { id: 'stk_202', credentials: 'BOT-EXTENDED-CC33-DD44-KEY', isSold: false },
          { id: 'stk_203', credentials: 'BOT-EXTENDED-EE55-FF66-KEY', isSold: false }
        ]
      },
      {
        id: 'daylong-24h',
        category: 'daily',
        title: 'OTP BOT DAYLONG Pass: 24 - HOUR DAYLONG Key',
        shortTitle: '24-Hour Daylong Key',
        price: 60.00,
        hidden: false,
        duration: '24-Hour',
        description: 'OTP BOT DAYLONG Pass: 24 - HOUR DAYLONG Key. Full day uninterrupted high-capacity OTP bypass operations.',
        prefix: 'BOT-DAYLONG',
        art: 'assets/daylong_pass_24h.jpg',
        stock: [
          { id: 'stk_301', credentials: 'BOT-DAYLONG-7788-9900-KEY', isSold: false },
          { id: 'stk_302', credentials: 'BOT-DAYLONG-1122-3344-KEY', isSold: false }
        ]
      },
      {
        id: 'multiday-3d',
        category: 'daily',
        title: 'OTP BOT MULTIDAY Pass: 3 - DAY MULTIDAY Key',
        shortTitle: '3-Day Multiday Key',
        price: 150.00,
        hidden: false,
        duration: '3-Day',
        description: 'OTP BOT MULTIDAY Pass: 3 - DAY MULTIDAY Key. Multi-day continuous access key for high-volume automated verification.',
        prefix: 'BOT-MULTIDAY',
        art: 'assets/multiday_pass_3d.jpg',
        stock: [
          { id: 'stk_401', credentials: 'BOT-MULTIDAY-5566-7788-KEY', isSold: false }
        ]
      },
      {
        id: 'weekly-1w',
        category: 'weekly',
        title: 'OTP BOT WEEKLY Pass: 1 - WEEK WEEKLY Key',
        shortTitle: '1-Week Weekly Key',
        price: 250.00,
        hidden: false,
        duration: '1-Week',
        description: 'OTP BOT WEEKLY Pass: 1 - WEEK WEEKLY Key. Full week unlimited operations access pass.',
        prefix: 'BOT-WEEKLY',
        art: 'assets/weekly_pass_1w.jpg',
        stock: [
          { id: 'stk_501', credentials: 'BOT-WEEKLY-9900-1122-KEY', isSold: false }
        ]
      },
      {
        id: 'biweekly-2w',
        category: 'weekly',
        title: 'OTP BOT BIWEEKLY Pass: 2 - WEEKS BIWEEKLY Key',
        shortTitle: '2-Weeks Biweekly Key',
        price: 350.00,
        hidden: false,
        duration: '2-Weeks',
        description: 'OTP BOT BIWEEKLY Pass: 2 - WEEKS BIWEEKLY Key. Maximum value 14-day dedicated pass key.',
        prefix: 'BOT-BIWEEKLY',
        art: 'assets/biweekly_pass_2w.jpg',
        stock: [
          { id: 'stk_601', credentials: 'BOT-BIWEEKLY-3344-5566-KEY', isSold: false }
        ]
      }
    ];
    writeJson(FILES.products, products);
  }

  // 2. Initial Admin User
  let users = readJson(FILES.users, []);
  let adminUser = users.find(u => u.role === 'ADMIN' || u.email === 'admin@bulkotp.com' || u.email === 'admin');
  if (!adminUser) {
    adminUser = {
      id: 'usr_admin_001',
      email: 'admin_sec_89201@bulkotp.com',
      passwordHash: hashPasswordScrypt('X9#kM2$vP8!wQ4%zL7'),
      balance: 500.00,
      role: 'ADMIN',
      createdAt: new Date().toISOString()
    };
    users.push(adminUser);
    writeJson(FILES.users, users);
  }

  // 3. Initial Sample Orders (Pinks.cc Revenue Analytics structure)
  let orders = readJson(FILES.orders, null);
  if (!orders || !Array.isArray(orders) || orders.length === 0) {
    orders = [
      {
        id: 'ORD-1001',
        orderNumber: 'ORD-1001',
        userId: adminUser.id,
        email: 'customer1@gmail.com',
        items: [{ id: 'compact-1h', name: 'OTP BOT COMPACT Pass: 1 - HOUR COMPACT Key', price: 17.00, qty: 1 }],
        total: 17.00,
        paymentMethod: 'Crypto',
        status: 'COMPLETED',
        purchasedItems: [{ name: 'OTP BOT COMPACT Pass: 1 - HOUR COMPACT Key', credentials: 'BOT-COMPACT-SAMPLE-KEY-001' }],
        createdAt: new Date(Date.now() - 86400000 * 4).toISOString()
      },
      {
        id: 'ORD-1002',
        orderNumber: 'ORD-1002',
        userId: adminUser.id,
        email: 'vipbuyer@protonmail.com',
        items: [{ id: 'daylong-24h', name: 'OTP BOT DAYLONG Pass: 24 - HOUR DAYLONG Key', price: 60.00, qty: 1 }],
        total: 60.00,
        paymentMethod: 'Balance',
        status: 'COMPLETED',
        purchasedItems: [{ name: 'OTP BOT DAYLONG Pass: 24 - HOUR DAYLONG Key', credentials: 'BOT-DAYLONG-SAMPLE-KEY-002' }],
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
      }
    ];
    writeJson(FILES.orders, orders);
  }
}

initDatabase();
autoBackupDatabase('startup');
setInterval(() => autoBackupDatabase('hourly'), 60 * 60 * 1000);

// Session Helper function
function getSession(req) {
  let token = (req.cookies && req.cookies.market_session) || null;
  if (!token && req.headers && req.headers.authorization) {
    token = req.headers.authorization.replace(/^Bearer\s+/i, '').trim();
  }
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }
  if (!token) return null;

  const sessions = readJson(FILES.sessions, []);
  const session = sessions.find(s => s.token === token && Date.now() < s.expiresAt);
  if (!session) return null;

  const users = readJson(FILES.users, []);
  const user = users.find(u => u.id === session.userId);
  return user ? { ...session, user } : null;
}

// Authentication Middleware
function requireAuth(req, res, next) {
  const sess = getSession(req);
  if (!sess) {
    return res.status(401).json({ error: 'Unauthorized. Login required.' });
  }
  req.session = sess;
  req.currentUser = sess.user;
  next();
}

function requireAdmin(req, res, next) {
  const sess = getSession(req);
  if (!sess || sess.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }
  req.session = sess;
  req.currentUser = sess.user;
  next();
}

// Admin OTP Monitor Endpoint
app.get('/api/admin/otps', requireAdmin, (req, res) => {
  const otps = readJson(FILES.otps, []).filter(o => o.expiresAt > Date.now());
  res.json({ success: true, otps });
});

// Page Access Control: Protected File Requests
app.get('/admin.html', (req, res, next) => {
  const sess = getSession(req);
  if (sess && sess.user.role !== 'ADMIN') {
    return res.redirect('/');
  }
  next();
});

// Strict Static Asset Shield (Block all database files, environment configs, and backend code from direct browser access)
app.use((req, res, next) => {
  const safePath = (req.path || '').toLowerCase();
  const isForbidden =
    safePath.startsWith('/data') ||
    safePath.startsWith('/scripts') ||
    safePath.startsWith('/scratch') ||
    safePath.startsWith('/.git') ||
    safePath.includes('.env') ||
    safePath.includes('package.json') ||
    safePath.includes('package-lock.json') ||
    safePath.includes('server.js') ||
    safePath.endsWith('.json');

  if (isForbidden) {
    return res.status(403).json({ error: 'Access Denied: Protected System Resource.' });
  }
  next();
});

// Static Middleware
app.use(express.static(__dirname, { dotfiles: 'ignore' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer Storage Configuration for Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${Date.now()}_${name}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) return cb(new Error('Only JPEG, PNG, WebP, or GIF images are allowed.'));
    cb(null, true);
  }
});

// Audit Log Helper
function logAudit(adminEmail, action, details, ip) {
  const logs = readJson(FILES.auditLogs, []);
  logs.unshift({
    id: `log_${Date.now()}`,
    adminEmail,
    action,
    details,
    ip: ip || '127.0.0.1',
    createdAt: new Date().toISOString()
  });
  writeJson(FILES.auditLogs, logs.slice(0, 100)); // Keep last 100 logs
}

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

// Register
app.post('/api/auth/register', authRateLimit, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !/^\S+@\S+\.\S+$/.test(String(email).trim())) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!password || typeof password !== 'string' || password.length < 8 || password.length > 128 || !/\d/.test(password)) {
    return res.status(400).json({ error: 'Use 8–128 characters and include at least one number.' });
  }

  const cleanEmail = String(email).toLowerCase().trim();
  const users = readJson(FILES.users, []);

  // Check if account already exists
  const existingUser = users.find(u => String(u.email || '').toLowerCase().trim() === cleanEmail);
  if (existingUser) {
    if (!existingUser.is_verified) {
      // Allow unverified users to re-register / request fresh OTP
      existingUser.passwordHash = hashPasswordScrypt(password);
      writeJson(FILES.users, users);

      const otpCode = storeOtp(cleanEmail, 'REGISTRATION', 5);
      sendOtpEmail(cleanEmail, otpCode, 'REGISTRATION').catch(err => console.error('OTP email dispatch error:', err));

      return res.status(200).json({
        success: true,
        requiresVerification: true,
        email: cleanEmail,
        message: 'Account updated! We sent a 6-digit verification code to your email.'
      });
    }
    return res.status(409).json({ error: 'An account with this email address already exists. Please sign in instead.' });
  }

  const newUser = {
    id: `usr_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    email: cleanEmail,
    passwordHash: hashPasswordScrypt(password),
    balance: 0.00,
    role: 'USER',
    is_verified: false,
    known_ips: [],
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  writeJson(FILES.users, users);

  const otpCode = storeOtp(cleanEmail, 'REGISTRATION', 5);
  sendOtpEmail(cleanEmail, otpCode, 'REGISTRATION').catch(err => console.error('OTP email dispatch error:', err));

  res.status(201).json({
    success: true,
    requiresVerification: true,
    email: cleanEmail,
    message: 'Account created! We sent a 6-digit verification code to your email.'
  });
});

// Verify Registration OTP / Email
app.post(['/api/auth/verify-otp', '/api/auth/verify-email'], authRateLimit, (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: 'Email address and 6-digit OTP code are required.' });
  }

  const cleanEmail = String(email).toLowerCase().trim();
  const users = readJson(FILES.users, []);
  const user = users.find(u => String(u.email || '').toLowerCase().trim() === cleanEmail);

  if (!user) return res.status(404).json({ error: 'User account not found.' });

  const isValid = verifyOtp(cleanEmail, code, 'REGISTRATION');
  if (!isValid) {
    return res.status(400).json({ error: 'Invalid or expired verification code. Please request a new code.' });
  }

  user.is_verified = true;
  const clientIp = getClientIp(req);
  user.known_ips = Array.isArray(user.known_ips) ? user.known_ips : [];
  if (!user.known_ips.includes(clientIp)) {
    user.known_ips.push(clientIp);
  }
  writeJson(FILES.users, users);

  const session = createSession(user.id);
  res.cookie('market_session', session.token, secureCookieOptions(req));

  const { passwordHash, ...userWithoutPassword } = user;
  res.json({ success: true, user: userWithoutPassword, token: session.token });
});

// Resend OTP Code
app.post('/api/auth/resend-otp', authRateLimit, async (req, res) => {
  const { email, type } = req.body;
  if (!email) return res.status(400).json({ error: 'Email address is required.' });

  const cleanEmail = String(email).toLowerCase().trim();
  const users = readJson(FILES.users, []);
  const user = users.find(u => String(u.email || '').toLowerCase().trim() === cleanEmail);

  if (!user) return res.status(404).json({ error: 'User account not found.' });

  const otpType = type || (user.is_verified ? 'LOGIN_2FA' : 'REGISTRATION');
  const otpCode = storeOtp(cleanEmail, otpType, 5);
  await sendOtpEmail(cleanEmail, otpCode, otpType);

  res.json({ success: true, message: 'A new 6-digit verification code has been sent to your email.' });
});

// Login (IP-Aware Smart 2FA)
app.post('/api/auth/login', authRateLimit, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email address and password are required.' });
  }

  const cleanEmail = String(email).toLowerCase().trim();
  const users = readJson(FILES.users, []);
  const user = users.find(u => String(u.email || '').toLowerCase().trim() === cleanEmail);

  if (!user || !verifyPasswordScrypt(String(password), user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email address or password.' });
  }

  // If email is not yet verified, require registration OTP
  if (user.is_verified === false) {
    const otpCode = storeOtp(cleanEmail, 'REGISTRATION', 5);
    await sendOtpEmail(cleanEmail, otpCode, 'REGISTRATION');
    return res.json({
      success: true,
      requiresVerification: true,
      email: cleanEmail,
      message: 'Email verification required. A 6-digit OTP code has been sent to your email.'
    });
  }

  const clientIp = getClientIp(req);
  user.known_ips = Array.isArray(user.known_ips) ? user.known_ips : [];

  // Smart IP-Aware 2FA Check
  const isKnownIp = user.known_ips.includes(clientIp) || user.known_ips.length === 0;

  if (!isKnownIp) {
    // Unrecognized IP: Trigger 2FA OTP
    const otpCode = storeOtp(cleanEmail, 'LOGIN_2FA', 5);
    await sendOtpEmail(cleanEmail, otpCode, 'LOGIN_2FA');
    return res.json({
      success: true,
      requires2FA: true,
      email: cleanEmail,
      message: `Sign-in attempt from new IP address (${clientIp}). Enter the 6-digit 2FA code sent to your email.`
    });
  }

  // Recognized IP: Issue session
  const session = createSession(user.id);
  res.cookie('market_session', session.token, secureCookieOptions(req));

  const { passwordHash, ...userWithoutPassword } = user;
  res.json({ success: true, user: userWithoutPassword, token: session.token });
});

// Verify 2FA Login OTP
app.post('/api/auth/verify-login-otp', authRateLimit, (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and 6-digit 2FA code required.' });
  }

  const cleanEmail = String(email).toLowerCase().trim();
  const users = readJson(FILES.users, []);
  const user = users.find(u => String(u.email || '').toLowerCase().trim() === cleanEmail);

  if (!user) return res.status(404).json({ error: 'User account not found.' });

  const isValid = verifyOtp(cleanEmail, code, 'LOGIN_2FA');
  if (!isValid) {
    return res.status(400).json({ error: 'Invalid or expired 2FA code. Please try again.' });
  }

  // Add new IP to known_ips
  const clientIp = getClientIp(req);
  user.known_ips = Array.isArray(user.known_ips) ? user.known_ips : [];
  if (!user.known_ips.includes(clientIp)) {
    user.known_ips.push(clientIp);
  }
  writeJson(FILES.users, users);

  const session = createSession(user.id);
  res.cookie('market_session', session.token, secureCookieOptions(req));

  const { passwordHash, ...userWithoutPassword } = user;
  res.json({ success: true, user: userWithoutPassword, token: session.token });
});

// Forgot Password Request
app.post('/api/auth/forgot-password', authRateLimit, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email address is required.' });

  const cleanEmail = String(email).toLowerCase().trim();
  const users = readJson(FILES.users, []);
  const user = users.find(u => String(u.email || '').toLowerCase().trim() === cleanEmail);

  if (user) {
    const otpCode = storeOtp(cleanEmail, 'PASSWORD_RESET', 10);
    await sendOtpEmail(cleanEmail, otpCode, 'PASSWORD_RESET');
  }

  res.json({
    success: true,
    email: cleanEmail,
    message: 'If an account exists with that email address, a 6-digit reset code has been sent.'
  });
});

// Reset Password Submission
app.post('/api/auth/reset-password', authRateLimit, (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) {
    return res.status(400).json({ error: 'Email, reset code, and new password are required.' });
  }

  if (typeof newPassword !== 'string' || newPassword.length < 8 || !/\d/.test(newPassword)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long and contain a number.' });
  }

  const cleanEmail = String(email).toLowerCase().trim();
  const users = readJson(FILES.users, []);
  const user = users.find(u => String(u.email || '').toLowerCase().trim() === cleanEmail);

  if (!user) return res.status(404).json({ error: 'User account not found.' });

  const isValid = verifyOtp(cleanEmail, code, 'PASSWORD_RESET');
  if (!isValid) {
    return res.status(400).json({ error: 'Invalid or expired reset code.' });
  }

  user.passwordHash = hashPasswordScrypt(newPassword);
  writeJson(FILES.users, users);

  res.json({ success: true, message: 'Password reset successful! You can now sign in with your new password.' });
});

// Current User Session
app.get('/api/auth/me', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const sess = getSession(req);
  if (!sess) {
    return res.json({ authenticated: false, user: null });
  }
  const { passwordHash, ...userWithoutPassword } = sess.user;
  res.json({ authenticated: true, user: userWithoutPassword });
});

// Logout (GET & POST)
app.all('/api/auth/logout', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const cookies = parseCookies(req);
  const token = cookies.market_session || (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '').trim() : null);
  
  const sess = getSession(req);
  const userId = sess ? sess.userId : null;

  let sessions = readJson(FILES.sessions, []);
  if (token || userId) {
    sessions = sessions.filter(s => {
      if (token && s.token === token) return false;
      if (userId && s.userId === userId) return false;
      return true;
    });
    writeJson(FILES.sessions, sessions);
  }

  res.clearCookie('market_session', { path: '/' });
  res.clearCookie('market_session', { path: '/', secure: true });
  res.clearCookie('market_session', { path: '/', sameSite: 'lax' });
  res.clearCookie('market_session', { path: '/', sameSite: 'lax', secure: true });

  res.setHeader('Set-Cookie', [
    'market_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax',
    'market_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax; Secure'
  ]);

  if (req.method === 'GET' || (req.headers.accept && req.headers.accept.includes('text/html'))) {
    return res.redirect('/login.html?logged_out=1');
  }

  res.json({ success: true });
});

// ==========================================
// STORE BALANCE & DEPOSIT ENDPOINTS
// ==========================================

// Get User Balance History
app.get('/api/balance/history', requireAuth, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const userId = req.currentUser.id;
  const userEmail = req.currentUser.email;

  const transactions = readJson(FILES.transactions, []);
  const userTx = transactions.filter(t => t.userId === userId || t.email === userEmail);

  // Also include purchases made via Store Balance from orders list
  const orders = readJson(FILES.orders, []);
  const userOrders = orders.filter(o => (o.userId === userId || o.email === userEmail) && o.paymentMethod === 'Store Balance');

  const combined = [
    ...userTx,
    ...userOrders.map(o => ({
      id: `tx_order_${o.id}`,
      userId: o.userId,
      type: 'PURCHASE',
      amount: -Math.abs(Number(o.total || 0)),
      description: `Purchase Pass Order #${o.orderNumber || o.id}`,
      status: o.status || 'COMPLETED',
      createdAt: o.createdAt
    }))
  ];

  combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(combined);
});

// Top-Up Account Balance
app.post('/api/balance/topup', requireAuth, async (req, res) => {
  const amount = Math.round(parseFloat(req.body.amount || 0) * 100) / 100;
  if (!amount || amount < 5) {
    return res.status(400).json({ error: 'Minimum top-up amount is $5.00 USD.' });
  }

  const requestedCurrency = String(req.body.payCurrency || 'usdt_trc20').toLowerCase();

  // If NOWPayments is configured for balance topup, generate a crypto invoice
  if (nowPaymentsConfigured('balance')) {
    try {
      const settings = getPaymentSettings();
      const apiKey = settings.balanceApiKey || settings.cartApiKey;
      const topupId = `TOPUP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const CURRENCY_MAP = {
        usdt_trc20: 'usdttrc20', usdttrc20: 'usdttrc20',
        usdt_erc20: 'usdterc20', usdterc20: 'usdterc20',
        usdt_sol: 'usdtsol', usdtsol: 'usdtsol',
        usdt_bsc: 'usdtbsc', usdt: 'usdttrc20',
        btc: 'btc', eth: 'eth', sol: 'sol', ltc: 'ltc', trx: 'trx',
        bnb: 'bnbbsc', bnb_bsc: 'bnbbsc', doge: 'doge', xrp: 'xrp', ada: 'ada'
      };
      const baseUrl = PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
      const topupPayload = {
        price_amount: amount,
        price_currency: 'usd',
        order_id: topupId,
        order_description: `BULK OTP Store Balance Top-Up $${amount.toFixed(2)}`,
        ipn_callback_url: `${baseUrl}/api/payments/nowpayments/ipn`,
        success_url: `${baseUrl}/balance.html?topup=success&amount=${amount}`,
        cancel_url: `${baseUrl}/balance.html?topup=cancelled`
      };

      if (requestedCurrency && requestedCurrency !== 'all' && CURRENCY_MAP[requestedCurrency]) {
        topupPayload.pay_currency = CURRENCY_MAP[requestedCurrency];
      }

      const providerResponse = await fetch(`${NOWPAYMENTS_API_URL}/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify(topupPayload)
      });

      const invoiceData = await providerResponse.json();
      if (!providerResponse.ok || !invoiceData.invoice_url) {
        throw new Error(invoiceData.message || 'Failed to create NOWPayments invoice.');
      }

      // Record pending topup transaction
      const transactions = readJson(FILES.transactions, []);
      transactions.unshift({
        id: topupId,
        userId: req.currentUser.id,
        email: req.currentUser.email,
        type: 'TOPUP',
        amount: amount,
        description: `Crypto Balance Top-Up (${requestedCurrency.toUpperCase()})`,
        status: 'PENDING',
        createdAt: new Date().toISOString()
      });
      writeJson(FILES.transactions, transactions);
      return res.json({ success: true, invoiceUrl: invoiceData.invoice_url, paymentId: invoiceData.id });
    } catch (err) {
      console.error('Crypto topup invoice error:', err);
      return res.status(502).json({ error: err.message || 'Could not generate cryptocurrency invoice. Please try again.' });
    }
  }

  return res.status(503).json({ error: 'Cryptocurrency deposit is currently unavailable. Please contact support or try again shortly.' });
});

// Redeem Balance Voucher Code
app.post('/api/balance/redeem', requireAuth, (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  if (!code) {
    return res.status(400).json({ error: 'Please enter a valid voucher code.' });
  }

  const vouchers = readJson(FILES.vouchers, [
    { code: 'BULK-TOPUP-50USD', amount: 50.00, isUsed: false },
    { code: 'WELCOME-10USD', amount: 10.00, isUsed: false },
    { code: 'BONUS-25USD', amount: 25.00, isUsed: false }
  ]);

  const voucher = vouchers.find(v => v.code === code);
  if (!voucher) {
    return res.status(400).json({ error: 'Invalid voucher code.' });
  }

  if (voucher.isUsed) {
    return res.status(400).json({ error: 'This voucher code has already been redeemed.' });
  }

  const users = readJson(FILES.users, []);
  const user = users.find(u => u.id === req.currentUser.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const redeemAmt = Number(voucher.amount || 0);
  user.balance = Math.round((Number(user.balance || 0) + redeemAmt) * 100) / 100;
  voucher.isUsed = true;
  voucher.usedBy = user.email;
  voucher.usedAt = new Date().toISOString();

  writeJson(FILES.users, users);
  writeJson(FILES.vouchers, vouchers);

  const transactions = readJson(FILES.transactions, []);
  const txId = `tx_voucher_${Date.now()}`;
  transactions.unshift({
    id: txId,
    userId: user.id,
    email: user.email,
    type: 'VOUCHER',
    amount: redeemAmt,
    description: `Redeemed Voucher Code: ${code}`,
    status: 'COMPLETED',
    createdAt: new Date().toISOString()
  });
  writeJson(FILES.transactions, transactions);

  logAudit(user.email, 'REDEEM_VOUCHER', `Redeemed voucher ${code} for +$${redeemAmt.toFixed(2)}`, req.ip);
  res.json({ success: true, newBalance: user.balance, amountRedeemed: redeemAmt });
});

// Admin: Fetch all vouchers
app.get('/api/admin/vouchers', requireAdmin, (req, res) => {
  const vouchers = readJson(FILES.vouchers, []);
  res.json({ success: true, vouchers });
});

// Admin: Create / Generate Vouchers
app.post('/api/admin/vouchers/create', requireAdmin, (req, res) => {
  const amount = Math.round(Number(req.body.amount || 0) * 100) / 100;
  if (isNaN(amount) || amount <= 0 || amount > 10000) {
    return res.status(400).json({ error: 'Voucher amount must be between $0.01 and $10,000.00 USD.' });
  }

  const count = Math.min(Math.max(parseInt(req.body.count || 1, 10), 1), 50);
  const rawPrefix = String(req.body.prefix || 'BULK-TOPUP').replace(/[^A-Z0-9\-]/gi, '').toUpperCase().slice(0, 20);
  const prefix = rawPrefix ? `${rawPrefix}-` : '';

  const vouchers = readJson(FILES.vouchers, []);
  const created = [];

  for (let i = 0; i < count; i++) {
    const randomCode = `${prefix}${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const newVoucher = {
      code: randomCode,
      amount: amount,
      isUsed: false,
      createdBy: req.currentUser.email,
      createdAt: new Date().toISOString()
    };
    vouchers.unshift(newVoucher);
    created.push(newVoucher);
  }

  writeJson(FILES.vouchers, vouchers);
  logAudit(req.currentUser.email, 'CREATE_VOUCHERS', `Generated ${count} voucher(s) worth $${amount.toFixed(2)} USD each (${prefix}*)`, req.ip);

  res.status(201).json({ success: true, vouchers: created });
});

// Admin: Delete Voucher (POST & DELETE)
app.all(['/api/admin/vouchers/delete', '/api/admin/vouchers/:code'], requireAdmin, (req, res) => {
  const code = String(req.body?.code || req.params?.code || '').trim().toUpperCase();
  if (!code) {
    return res.status(400).json({ error: 'Voucher code is required.' });
  }

  let vouchers = readJson(FILES.vouchers, []);
  const voucher = vouchers.find(v => v.code === code);

  if (!voucher) {
    return res.status(404).json({ error: 'Voucher code not found.' });
  }

  vouchers = vouchers.filter(v => v.code !== code);
  writeJson(FILES.vouchers, vouchers);
  logAudit(req.currentUser.email, 'DELETE_VOUCHER', `Deleted voucher code ${code}`, req.ip);

  res.json({ success: true, message: `Voucher ${code} deleted.` });
});

// ==========================================
// STOREFRONT PRODUCTS & CATALOG ROUTES
// ==========================================

app.get('/api/products', (req, res) => {
  const products = readJson(FILES.products, []);
  const visibleProducts = products.filter(p => !p.hidden).map(p => {
    const stockList = p.stock || [];
    const unsoldStock = stockList.filter(s => !s.isSold);
    return {
      id: p.id,
      category: p.category,
      title: p.title,
      shortTitle: p.shortTitle || p.title,
      price: p.price,
      hidden: p.hidden,
      duration: p.duration || '1-Hour',
      description: p.description,
      prefix: p.prefix,
      art: p.art,
      stock: unsoldStock.length
    };
  });
  const revision = crypto.createHash('sha1').update(JSON.stringify(visibleProducts)).digest('hex').slice(0, 16);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Catalog-Revision', revision);
  res.json(visibleProducts);
});

// ==========================================
// ORDER CHECKOUT & REDEEM KEY DELIVERY
// ==========================================

function buildOrderQuote(items, products) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
    throw new Error('Cart is empty or invalid.');
  }

  let total = 0;
  const orderItems = items.map(item => {
    const product = products.find(candidate => candidate.id === item.productId || candidate.id === item.id);
    if (!product || product.hidden) throw new Error('One of the selected products is no longer available.');

    const qty = Number(item.qty || 1);
    if (!Number.isInteger(qty) || qty < 1 || qty > 25) throw new Error('Invalid product quantity.');
    const price = Number(product.price);
    if (!Number.isFinite(price) || price < 0) throw new Error('A product has an invalid price.');

    const available = (product.stock || []).filter(stock => !stock.isSold).length;
    if (available < qty) throw new Error(`Not enough stock for ${product.title}. Available: ${available}.`);

    total += price * qty;
    return { id: product.id, title: product.title, price, qty };
  });

  return { orderItems, total: Math.round(total * 100) / 100 };
}

function allocateOrderKeys(order, userId, products) {
  const purchasedItems = [];
  for (const item of order.items) {
    const product = products.find(candidate => candidate.id === item.id);
    const available = (product?.stock || []).filter(stock => !stock.isSold).slice(0, item.qty);
    if (!product || available.length < item.qty) {
      throw new Error(`Stock changed before delivery for ${item.title}.`);
    }
    available.forEach(stock => {
      stock.isSold = true;
      stock.soldTo = userId;
      stock.orderId = order.id;
      stock.soldAt = new Date().toISOString();
      purchasedItems.push({ id: item.id, name: item.title, price: item.price, credentials: stock.credentials });
    });
  }
  order.purchasedItems = purchasedItems;
  writeJson(FILES.products, products);
  return purchasedItems;
}

function newOrderId() {
  return `ORD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

app.get('/api/payments/config', (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json({
    balance: { enabled: true },
    nowPayments: {
      enabled: true,
      configured: nowPaymentsConfigured('cart'),
      provider: 'NOWPayments',
      currencies: ['usdt_trc20', 'btc', 'eth', 'sol', 'ltc']
    }
  });
});

app.post('/api/orders/checkout', requireAuth, async (req, res) => {
  const paymentMethod = String(req.body.paymentMethod || '').toLowerCase();
  
  try {
    const products = readJson(FILES.products, []);
    const quote = buildOrderQuote(req.body.items, products);
    const users = readJson(FILES.users, []);
    const user = users.find(candidate => candidate.id === req.currentUser.id);
    if (!user) return res.status(401).json({ error: 'Your account could not be loaded.' });

    if (paymentMethod !== 'balance') {
      return res.status(400).json({ error: 'Use the secure crypto invoice checkout for cryptocurrency payments.' });
    }

    // Store Balance Checkout
    if (Number(user.balance || 0) < quote.total) {
      return res.status(400).json({
        error: `Insufficient store balance. Total: $${quote.total.toFixed(2)}, balance: $${Number(user.balance || 0).toFixed(2)}.`
      });
    }

    const orderId = newOrderId();
    const order = {
      id: orderId,
      orderNumber: orderId,
      userId: user.id,
      email: user.email,
      items: quote.orderItems,
      purchasedItems: [],
      total: quote.total,
      paymentMethod: 'Store Balance',
      status: 'COMPLETED',
      createdAt: new Date().toISOString()
    };

    allocateOrderKeys(order, user.id, products);
    user.balance = Math.round((Number(user.balance || 0) - quote.total) * 100) / 100;
    writeJson(FILES.users, users);

    const orders = readJson(FILES.orders, []);
    orders.unshift(order);
    writeJson(FILES.orders, orders);

    // Send Order Confirmation Email via Brevo
    sendOrderConfirmationEmail(user.email, order).catch(err => console.error('Order email error:', err));

    res.json({ success: true, orderId: order.id, order, keys: order.purchasedItems.map(item => item.credentials), balance: user.balance });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Checkout could not be completed.' });
  }
});

app.post('/api/payments/nowpayments/invoice', requireAuth, async (req, res) => {
  const settings = getPaymentSettings();
  const apiKey = (settings.cartApiKey || 'R043HDX-JAK4S1X-PBGQJSY-45PAB2A').trim();
  const isConfigured = Boolean(apiKey && !/placeholder|replace|your[_-]?api/i.test(apiKey));
  console.log('[NOWPayments Invoice Request]', { apiKey, isConfigured });

  if (!isConfigured) {
    return res.status(503).json({
      code: 'PAYMENTS_NOT_CONFIGURED',
      error: 'Cryptocurrency payment is temporarily unavailable. Please try again in a few moments or use your account balance.'
    });
  }

  try {
    const settings = getPaymentSettings();
    const apiKey = settings.cartApiKey;
    const products = readJson(FILES.products, []);
    const quote = buildOrderQuote(req.body.items, products);
    const orderId = newOrderId();
    const requestedCurrency = String(req.body.payCurrency || '').toLowerCase();
    const CURRENCY_MAP = {
      usdt_trc20: 'usdttrc20', usdttrc20: 'usdttrc20',
      usdt_erc20: 'usdterc20', usdterc20: 'usdterc20',
      usdt_sol: 'usdtsol', usdtsol: 'usdtsol',
      usdt_bsc: 'usdtbsc', usdt: 'usdttrc20',
      btc: 'btc', eth: 'eth', sol: 'sol', ltc: 'ltc', trx: 'trx',
      bnb: 'bnbbsc', bnb_bsc: 'bnbbsc', doge: 'doge', xrp: 'xrp', ada: 'ada'
    };
    const baseUrl = PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const invoicePayload = {
      price_amount: quote.total,
      price_currency: 'usd',
      order_id: orderId,
      order_description: `BULK OTP order ${orderId}`,
      ipn_callback_url: `${baseUrl}/api/payments/nowpayments/ipn`,
      success_url: `${baseUrl}/orders.html?payment=success&orderId=${orderId}`,
      cancel_url: `${baseUrl}/cart.html?payment=cancelled`
    };

    // If specific currency requested, include it, otherwise omit so NOWPayments allows ALL coins
    if (requestedCurrency && requestedCurrency !== 'all' && CURRENCY_MAP[requestedCurrency]) {
      invoicePayload.pay_currency = CURRENCY_MAP[requestedCurrency];
    }

    const providerResponse = await fetch(`${NOWPAYMENTS_API_URL}/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(invoicePayload),
      signal: AbortSignal.timeout(15000)
    });
    const invoice = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok || !invoice.invoice_url) {
      console.error('NOWPayments API Error Response:', providerResponse.status, invoice);
      return res.status(502).json({ error: invoice.message || invoice.error || 'NOWPayments could not create an invoice.' });
    }

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const order = {
      id: orderId,
      orderNumber: orderId,
      userId: req.currentUser.id,
      email: req.currentUser.email,
      items: quote.orderItems,
      purchasedItems: [],
      total: quote.total,
      paymentMethod: `Crypto (${requestedCurrency.toUpperCase()})`,
      paymentProvider: 'NOWPayments',
      externalPaymentId: String(invoice.id),
      invoiceUrl: invoice.invoice_url,
      expiresAt: expiresAt,
      status: 'AWAITING_PAYMENT',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const orders = readJson(FILES.orders, []);
    orders.unshift(order);
    writeJson(FILES.orders, orders);
    res.status(201).json({ success: true, orderId, total: quote.total, invoiceUrl: invoice.invoice_url, expiresAt });
  } catch (error) {
    console.error('NOWPayments invoice endpoint error:', error);
    const timeout = error.name === 'TimeoutError' || error.name === 'AbortError';
    res.status(timeout ? 504 : 500).json({ error: timeout ? 'Payment provider timed out. Please try again.' : (error.message || 'Could not create the payment invoice.') });
  }
});

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = sortObject(value[key]);
      return result;
    }, {});
  }
  return value;
}

app.post('/api/payments/nowpayments/ipn', (req, res) => {
  const settings = getPaymentSettings();
  if (!settings.ipnSecret) return res.status(503).json({ error: 'Payment callbacks are not configured.' });

  const signature = String(req.get('x-nowpayments-sig') || '');
  const expected = crypto.createHmac('sha512', settings.ipnSecret).update(JSON.stringify(sortObject(req.body))).digest('hex');
  const validSignature = signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!validSignature) return res.status(401).json({ error: 'Invalid payment signature.' });

  const orderId = String(req.body.order_id || '');
  const paymentStatus = String(req.body.payment_status || '').toLowerCase();

  // Check if this is a Balance Top-Up (order_id starts with TOPUP-)
  if (orderId.startsWith('TOPUP-')) {
    const transactions = readJson(FILES.transactions, []);
    const tx = transactions.find(t => t.id === orderId);

    if (tx) {
      const isPaid = ['confirmed', 'finished'].includes(paymentStatus);
      tx.status = isPaid ? 'COMPLETED' : paymentStatus.toUpperCase();
      tx.updatedAt = new Date().toISOString();
      writeJson(FILES.transactions, transactions);

      if (isPaid) {
        const users = readJson(FILES.users, []);
        const user = users.find(u => u.id === tx.userId || u.email === tx.email);
        if (user) {
          user.balance = Math.round((Number(user.balance || 0) + Number(tx.amount || 0)) * 100) / 100;
          writeJson(FILES.users, users);
          logAudit(user.email, 'TOPUP_COMPLETED', `Crypto topup confirmed: +$${Number(tx.amount || 0).toFixed(2)} USD`, req.ip);
        }
      }
    }
    return res.json({ success: true });
  }

  // Otherwise handle Cart Order
  const orders = readJson(FILES.orders, []);
  const order = orders.find(candidate => candidate.id === orderId || candidate.externalPaymentId === String(req.body.payment_id || req.body.id));
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  order.providerStatus = paymentStatus;
  order.updatedAt = new Date().toISOString();

  if (['confirmed', 'finished'].includes(paymentStatus) && order.status !== 'COMPLETED') {
    const reportedPrice = Number(req.body.price_amount);
    if (Number.isFinite(reportedPrice) && reportedPrice + 0.01 < Number(order.total)) {
      order.status = 'PAID_REVIEW_REQUIRED';
      order.fulfillmentError = 'Provider reported a confirmed amount below the order total.';
    } else {
      try {
        const products = readJson(FILES.products, []);
        allocateOrderKeys(order, order.userId, products);
        order.status = 'COMPLETED';
        order.paidAt = new Date().toISOString();

        // Dispatch receipt email
        sendOrderConfirmationEmail(order.email, order).catch(err => console.error('Order email error:', err));
      } catch (error) {
        order.status = 'PAID_REVIEW_REQUIRED';
        order.fulfillmentError = error.message;
      }
    }
  } else if (['failed', 'expired', 'refunded'].includes(paymentStatus)) {
    order.status = paymentStatus.toUpperCase();
  }

  writeJson(FILES.orders, orders);
  res.json({ success: true });
});

// GET User Orders (Delivered Keys)
app.get('/api/orders', requireAuth, (req, res) => {
  const orders = readJson(FILES.orders, []);
  const userOrders = orders.filter(o => o.userId === req.currentUser.id || o.email === req.currentUser.email);
  res.json(userOrders);
});

// ==========================================
// REDESIGNED ADMIN DASHBOARD ROUTES (Pinks.cc Style)
// ==========================================

// Admin Revenue Analytics Stats
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const orders = readJson(FILES.orders, []);
  const products = readJson(FILES.products, []);
  const completedOrders = orders.filter(order => order.status === 'COMPLETED');

  const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalOrders = orders.length;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const monthStr = now.toISOString().slice(0, 7);

  const todayRevenue = completedOrders
    .filter(o => (o.createdAt || '').slice(0, 10) === todayStr)
    .reduce((sum, o) => sum + (o.total || 0), 0);

  const monthRevenue = completedOrders
    .filter(o => (o.createdAt || '').slice(0, 7) === monthStr)
    .reduce((sum, o) => sum + (o.total || 0), 0);

  // Payment Breakdown
  const cryptoRevenue = completedOrders.filter(o => (o.paymentMethod || '').toLowerCase().includes('crypto')).reduce((sum, o) => sum + (o.total || 0), 0);
  const balanceRevenue = completedOrders.filter(o => (o.paymentMethod || '').toLowerCase().includes('balance')).reduce((sum, o) => sum + (o.total || 0), 0);
  const chimeRevenue = completedOrders.filter(o => (o.paymentMethod || '').toLowerCase().includes('chime')).reduce((sum, o) => sum + (o.total || 0), 0);
  const starsRevenue = completedOrders.filter(o => (o.paymentMethod || '').toLowerCase().includes('stars')).reduce((sum, o) => sum + (o.total || 0), 0);

  // Daily Revenue Line Chart Data (Last 14 days)
  const chartLabels = [];
  const chartData = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    chartLabels.push(dateStr.slice(5)); // MM-DD
    const dayRev = completedOrders
      .filter(o => (o.createdAt || '').slice(0, 10) === dateStr)
      .reduce((sum, o) => sum + (o.total || 0), 0);
    chartData.push(dayRev);
  }

  res.json({
    totalRevenue,
    todayRevenue,
    monthRevenue,
    totalOrders,
    breakdown: {
      crypto: cryptoRevenue,
      balance: balanceRevenue,
      chime: chimeRevenue,
      stars: starsRevenue
    },
    breakdownCounts: {
      crypto: completedOrders.filter(o => (o.paymentMethod || '').toLowerCase().includes('crypto')).length,
      balance: completedOrders.filter(o => (o.paymentMethod || '').toLowerCase().includes('balance')).length,
      chime: completedOrders.filter(o => (o.paymentMethod || '').toLowerCase().includes('chime')).length,
      stars: completedOrders.filter(o => (o.paymentMethod || '').toLowerCase().includes('stars')).length
    },
    chart: {
      labels: chartLabels,
      data: chartData
    },
    recentOrders: orders.slice(0, 10)
  });
});

// Admin Product Management
app.get('/api/admin/products', requireAdmin, (req, res) => {
  const products = readJson(FILES.products, []);
  const result = products.map(p => {
    const stockList = p.stock || [];
    const unsoldKeys = stockList.filter(s => !s.isSold).map(s => s.credentials);
    return {
      ...p,
      stockCount: unsoldKeys.length,
      stockKeys: unsoldKeys
    };
  });
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json(result);
});

function normalizeStockKeys(keysText) {
  const keys = String(keysText || '')
    .split(/\r?\n/)
    .map(key => key.trim())
    .filter(Boolean);
  if (keys.length > 5000) throw new Error('A product can contain at most 5,000 available keys.');
  if (keys.some(key => key.length > 500)) throw new Error('Stock keys must be 500 characters or fewer.');
  return [...new Set(keys)];
}

// Create/Update Product
app.post('/api/admin/products', requireAdmin, (req, res) => {
  const products = readJson(FILES.products, []);
  const pData = req.body;
  const title = String(pData.title || '').trim();
  const price = Number(pData.price);
  if (!title) return res.status(400).json({ error: 'Product title is required.' });
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Enter a valid product price.' });

  let keysInput;
  try {
    keysInput = normalizeStockKeys(pData.keysText);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const stock = keysInput.map((k, idx) => ({
    id: `stk_${Date.now()}_${idx}`,
    credentials: k,
    isSold: false
  }));

  const newProd = {
    id: pData.id || `prod_${Date.now()}`,
    category: pData.category || 'hourly',
    title,
    shortTitle: String(pData.shortTitle || title).trim(),
    price,
    hidden: Boolean(pData.hidden),
    duration: pData.duration || '1-Hour',
    description: pData.description || '',
    prefix: pData.prefix || 'BOT-KEY',
    art: pData.art || 'assets/compact_pass_1h.jpg',
    stock,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  products.push(newProd);
  writeJson(FILES.products, products);

  logAudit(req.currentUser.email, 'CREATE_PRODUCT', `Created product ${newProd.title}`, req.ip);
  res.status(201).json({ success: true, product: newProd, stockCount: stock.length });
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const products = readJson(FILES.products, []);
  const idx = products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Product not found' });

  const pData = req.body;
  const existing = products[idx];

  if (pData.title !== undefined && !String(pData.title).trim()) {
    return res.status(400).json({ error: 'Product title is required.' });
  }
  if (pData.price !== undefined && (!Number.isFinite(Number(pData.price)) || Number(pData.price) < 0)) {
    return res.status(400).json({ error: 'Enter a valid product price.' });
  }

  if (pData.keysText !== undefined) {
    let keysInput;
    try {
      keysInput = normalizeStockKeys(pData.keysText);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    const existingStockMap = new Map((existing.stock || []).map(s => [s.credentials, s]));
    const soldStock = (existing.stock || []).filter(stockItem => stockItem.isSold);

    const availableStock = keysInput.map((k, i) => {
      if (existingStockMap.has(k)) {
        return existingStockMap.get(k);
      }
      return { id: `stk_${Date.now()}_${i}`, credentials: k, isSold: false };
    });
    existing.stock = [...soldStock, ...availableStock.filter(stockItem => !stockItem.isSold)];
  }

  if (pData.title !== undefined) existing.title = String(pData.title).trim();
  if (pData.price !== undefined) existing.price = Number(pData.price);
  if (pData.category !== undefined) existing.category = pData.category;
  if (pData.hidden !== undefined) existing.hidden = Boolean(pData.hidden);
  if (pData.description !== undefined) existing.description = pData.description;
  if (pData.art !== undefined) existing.art = pData.art;
  if (pData.prefix !== undefined) existing.prefix = pData.prefix;
  existing.updatedAt = new Date().toISOString();

  products[idx] = existing;
  writeJson(FILES.products, products);

  logAudit(req.currentUser.email, 'UPDATE_PRODUCT', `Updated product ${existing.title}`, req.ip);
  res.json({ success: true, product: existing });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  let products = readJson(FILES.products, []);
  const prod = products.find(p => p.id === req.params.id);
  if (!prod) return res.status(404).json({ error: 'Product not found.' });
  products = products.filter(p => p.id !== req.params.id);
  writeJson(FILES.products, products);

  logAudit(req.currentUser.email, 'DELETE_PRODUCT', `Deleted product ${prod ? prod.title : req.params.id}`, req.ip);
  res.json({ success: true });
});

// Admin User Management & Balance Adjustment
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = readJson(FILES.users, []);
  const safeUsers = users.map(({ passwordHash, ...u }) => u);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json(safeUsers);
});

app.post('/api/admin/users/balance', requireAdmin, (req, res) => {
  const { email, amount } = req.body;
  if (!email || amount === undefined) {
    return res.status(400).json({ error: 'User email and balance amount required.' });
  }

  const users = readJson(FILES.users, []);
  const user = users.find(u => u.email === email.toLowerCase().trim() || u.id === email);

  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const delta = parseFloat(amount) || 0;
  user.balance = Math.max(0, (user.balance || 0) + delta);
  writeJson(FILES.users, users);

  logAudit(req.currentUser.email, 'ADJUST_BALANCE', `Adjusted balance for ${user.email} by $${delta.toFixed(2)}`, req.ip);
  res.json({ success: true, user: { id: user.id, email: user.email, balance: user.balance } });
});

// Admin Orders List
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const orders = readJson(FILES.orders, []);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json(orders);
});

// Admin Payment Gateway Settings (NOWPayments Cart & Balance Keys, IPN Secret)
app.get('/api/admin/payment-settings', requireAdmin, (req, res) => {
  const settings = getPaymentSettings();
  const baseUrl = PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json({
    success: true,
    cartApiKey: settings.cartApiKey,
    balanceApiKey: settings.balanceApiKey,
    ipnSecret: settings.ipnSecret,
    webhookUrl: `${baseUrl}/api/payments/nowpayments/ipn`
  });
});

app.post('/api/admin/payment-settings', requireAdmin, async (req, res) => {
  const { cartApiKey, balanceApiKey, ipnSecret } = req.body;
  const cartKey = String(cartApiKey || '').trim();
  const balanceKey = String(balanceApiKey || cartKey).trim();
  const secret = String(ipnSecret || '').trim();

  if (!cartKey && !balanceKey) {
    return res.status(400).json({ error: 'Please enter at least one NOWPayments API key.' });
  }

  if (!secret) {
    return res.status(400).json({
      error: '⚠️ IPN Secret Key Missing: Please paste your IPN Secret Key from NOWPayments -> Payment Settings to enable instant webhook order delivery.'
    });
  }

  // Run live verification script against NOWPayments API
  try {
    const testKey = cartKey || balanceKey;
    const verifyRes = await fetch(`${NOWPAYMENTS_API_URL}/merchant/coins`, {
      headers: { 'x-api-key': testKey },
      signal: AbortSignal.timeout(10000)
    });
    const verifyData = await verifyRes.json().catch(() => ({}));

    if (!verifyRes.ok || verifyData.statusCode === 401 || verifyData.statusCode === 403 || verifyData.code === 'INVALID_API_KEY') {
      return res.status(400).json({
        error: `❌ Invalid NOWPayments API Key: Could not authenticate with NOWPayments API (${verifyData.message || 'Invalid API Key'}). Please double-check your API key.`
      });
    }
  } catch (verifyErr) {
    console.warn('NOWPayments key verification warning:', verifyErr.message);
  }

  const newSettings = {
    cartApiKey: cartKey || balanceKey,
    balanceApiKey: balanceKey || cartKey,
    ipnSecret: secret,
    updatedAt: new Date().toISOString(),
    updatedBy: req.currentUser.email
  };

  writeJson(FILES.paymentSettings, newSettings);
  logAudit(req.currentUser.email, 'UPDATE_PAYMENT_SETTINGS', 'Verified and updated NOWPayments API keys and IPN Secret', req.ip);

  res.json({
    success: true,
    message: '✅ NOWPayments API keys & IPN Secret verified and saved successfully!',
    settings: newSettings
  });
});

app.delete('/api/admin/payment-settings', requireAdmin, (req, res) => {
  try {
    if (fs.existsSync(FILES.paymentSettings)) {
      fs.unlinkSync(FILES.paymentSettings);
    }
  } catch (err) {
    console.error('Error deleting payment settings file:', err);
  }
  logAudit(req.currentUser.email, 'DELETE_PAYMENT_SETTINGS', 'Reset NOWPayments API keys and IPN Secret', req.ip);
  res.json({
    success: true,
    message: 'Payment gateway API keys have been removed.'
  });
});

// Image Upload Endpoint
app.post('/api/upload', requireAdmin, upload.single('thumbnail'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.json({ url: `uploads/${req.file.filename}` });
});

// Audit Logs Endpoint
app.get('/api/admin/audit-logs', requireAdmin, (req, res) => {
  const logs = readJson(FILES.auditLogs, []);
  res.json(logs);
});

// ==========================================
// SUPPORT TICKETS ROUTES
// ==========================================

// Create Ticket
app.post('/api/tickets', requireAuth, (req, res) => {
  const { subject, category, message } = req.body;
  if (!subject || !message) {
    return res.status(400).json({ error: 'Subject and message required.' });
  }

  const ticketId = `TCK-${Date.now().toString().slice(-6)}`;
  const newTicket = {
    id: ticketId,
    ticketNumber: ticketId,
    userId: req.currentUser.id,
    email: req.currentUser.email,
    subject: subject.trim(),
    category: category || 'General',
    status: 'OPEN',
    messages: [
      {
        sender: req.currentUser.email,
        senderRole: req.currentUser.role,
        text: message.trim(),
        createdAt: new Date().toISOString()
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const tickets = readJson(FILES.tickets, []);
  tickets.unshift(newTicket);
  writeJson(FILES.tickets, tickets);

  res.json({ success: true, ticket: newTicket });
});

// GET User Tickets
app.get('/api/tickets', requireAuth, (req, res) => {
  const tickets = readJson(FILES.tickets, []);
  const userTickets = tickets.filter(t => t.userId === req.currentUser.id || t.email === req.currentUser.email);
  res.json(userTickets);
});

// User Reply to Ticket
app.post('/api/tickets/:id/reply', requireAuth, (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Message text required.' });

  const tickets = readJson(FILES.tickets, []);
  const ticket = tickets.find(t => t.id === req.params.id && (t.userId === req.currentUser.id || t.email === req.currentUser.email));

  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

  ticket.messages.push({
    sender: req.currentUser.email,
    senderRole: req.currentUser.role,
    text: text.trim(),
    createdAt: new Date().toISOString()
  });
  ticket.status = 'OPEN';
  ticket.updatedAt = new Date().toISOString();

  writeJson(FILES.tickets, tickets);
  res.json({ success: true, ticket });
});

// User Close Ticket (Mark Resolved)
app.post('/api/tickets/:id/close', requireAuth, (req, res) => {
  const tickets = readJson(FILES.tickets, []);
  const ticket = tickets.find(t => t.id === req.params.id && (t.userId === req.currentUser.id || t.email === req.currentUser.email));

  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

  ticket.status = 'RESOLVED';
  ticket.updatedAt = new Date().toISOString();

  writeJson(FILES.tickets, tickets);
  res.json({ success: true, ticket });
});

// Admin Get All Tickets
app.get('/api/admin/tickets', requireAdmin, (req, res) => {
  const tickets = readJson(FILES.tickets, []);
  res.json(tickets);
});

// Admin Reply & Update Ticket Status
app.post('/api/admin/tickets/:id/reply', requireAdmin, (req, res) => {
  const { text, status } = req.body;

  const tickets = readJson(FILES.tickets, []);
  const ticket = tickets.find(t => t.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

  if (text && text.trim().length > 0) {
    ticket.messages.push({
      sender: req.currentUser.email,
      senderRole: 'ADMIN',
      text: text.trim(),
      createdAt: new Date().toISOString()
    });
    ticket.status = status || 'REPLIED';
  } else if (status) {
    ticket.status = status;
  }

  ticket.updatedAt = new Date().toISOString();
  writeJson(FILES.tickets, tickets);

  logAudit(req.currentUser.email, 'REPLY_TICKET', `Replied to ticket #${ticket.ticketNumber}`, req.ip);
  res.json({ success: true, ticket });
});

// Global Sanitized Error Handler (Prevent Data/Stack Trace Leakage)
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.stack || err);
  const isDev = process.env.NODE_ENV === 'development';
  res.status(err.status || 500).json({
    error: isDev ? err.message : 'An unexpected security condition occurred. Request halted.'
  });
});

app.listen(PORT, () => {
  console.log(`BULK OTP Server running on port ${PORT}`);
});
