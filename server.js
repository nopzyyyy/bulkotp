const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 5500;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const NOWPAYMENTS_API_KEY = (process.env.NOWPAYMENTS_API_KEY || '').trim();
const NOWPAYMENTS_IPN_SECRET = (process.env.NOWPAYMENTS_IPN_SECRET || '').trim();
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(cors({ origin: false }));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
  });
  next();
});
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buffer) => { req.rawBody = Buffer.from(buffer); }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
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
      list[parts.shift().trim()] = decodeURIComponent(parts.join('='));
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
  store: path.join(DATA_DIR, 'store.json')
};

// Helper: Read JSON File safely
function readJson(filePath, fallback = []) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
  }
  return fallback;
}

// Helper: Write JSON File safely
function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
  }
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
      email: 'admin',
      passwordHash: hashPasswordScrypt('admin123'),
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

// Session Helper function
function getSession(req) {
  const token = req.cookies.market_session || (req.headers.authorization ? req.headers.authorization.replace('Bearer ', '') : null);
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

// Page Access Control: Protected File Requests
app.get('/admin.html', (req, res, next) => {
  const sess = getSession(req);
  if (!sess) {
    return res.redirect('/login.html?redirect=/admin.html');
  }
  if (sess.user.role !== 'ADMIN') {
    return res.redirect('/');
  }
  next();
});

// Static Middleware
app.use(express.static(__dirname));
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
app.post('/api/auth/register', authRateLimit, (req, res) => {
  const { email, password } = req.body;
  if (!email || !/^\S+@\S+\.\S+$/.test(String(email).trim())) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!password || password.length < 8 || password.length > 128 || !/\d/.test(password)) {
    return res.status(400).json({ error: 'Use 8–128 characters and include at least one number.' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const users = readJson(FILES.users, []);

  if (users.find(u => u.email === cleanEmail)) {
    return res.status(400).json({ error: 'An account with this email already exists.' });
  }

  const newUser = {
    id: `usr_${Date.now()}`,
    email: cleanEmail,
    passwordHash: hashPasswordScrypt(password),
    balance: 0.00,
    role: 'USER',
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  writeJson(FILES.users, users);

  const session = createSession(newUser.id);
  res.cookie('market_session', session.token, secureCookieOptions(req));

  const { passwordHash, ...userWithoutPassword } = newUser;
  res.status(201).json({ success: true, user: userWithoutPassword });
});

// Login
app.post('/api/auth/login', authRateLimit, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email/Username and password required.' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const users = readJson(FILES.users, []);
  const user = users.find(u => u.email === cleanEmail);

  if (!user || !verifyPasswordScrypt(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email/username or password.' });
  }

  const session = createSession(user.id);
  res.cookie('market_session', session.token, secureCookieOptions(req));

  const { passwordHash, ...userWithoutPassword } = user;
  res.json({ success: true, user: userWithoutPassword });
});

// Current User Session
app.get('/api/auth/me', (req, res) => {
  const sess = getSession(req);
  if (!sess) {
    return res.json({ authenticated: false, user: null });
  }
  const { passwordHash, ...userWithoutPassword } = sess.user;
  res.json({ authenticated: true, user: userWithoutPassword });
});

// Logout (GET & POST)
app.all('/api/auth/logout', (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies.market_session || (req.headers.authorization ? req.headers.authorization.replace('Bearer ', '') : null);
  
  const sess = getSession(req);
  const userId = sess ? sess.userId : null;

  let sessions = readJson(FILES.sessions, []);
  if (token || userId) {
    sessions = sessions.filter(s => s.token !== token && (!userId || s.userId !== userId));
    writeJson(FILES.sessions, sessions);
  }

  res.setHeader('Set-Cookie', [
    'market_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax',
    'market_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
  ]);
  res.json({ success: true });
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
  res.json({
    balance: { enabled: true },
    nowPayments: {
      enabled: nowPaymentsConfigured(),
      provider: 'NOWPayments',
      currencies: ['usdt_trc20', 'btc', 'eth', 'sol']
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

    if (paymentMethod === 'crypto') {
      const orderId = 'ORD-' + Math.random().toString(36).substring(2, 10).toUpperCase();
      const order = {
        id: orderId,
        orderNumber: orderId,
        userId: user.id,
        email: user.email,
        items: quote.orderItems,
        purchasedItems: [],
        total: quote.total,
        paymentMethod: 'Cryptocurrency',
        status: 'AWAITING_PAYMENT',
        createdAt: new Date().toISOString()
      };

      const orders = readJson(FILES.orders, []);
      orders.unshift(order);
      writeJson(FILES.orders, orders);

      const invoiceUrl = `https://nowpayments.io/payment/?iid=${orderId}`;

      return res.json({
        success: true,
        orderId: order.id,
        total: quote.total,
        invoiceUrl: invoiceUrl,
        order
      });
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

    res.json({ success: true, orderId: order.id, order, keys: order.purchasedItems.map(item => item.credentials), balance: user.balance });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Checkout could not be completed.' });
  }
});

app.post('/api/payments/nowpayments/invoice', requireAuth, async (req, res) => {
  if (!nowPaymentsConfigured()) {
    return res.status(503).json({
      code: 'PAYMENTS_NOT_CONFIGURED',
      error: 'Cryptocurrency checkout is not active yet. Please use store balance for now.'
    });
  }

  try {
    const products = readJson(FILES.products, []);
    const quote = buildOrderQuote(req.body.items, products);
    const orderId = newOrderId();
    const requestedCurrency = String(req.body.payCurrency || 'usdt_trc20').toLowerCase();
    const currencyMap = { usdt_trc20: 'usdttrc20', btc: 'btc', eth: 'eth', sol: 'sol' };
    if (!currencyMap[requestedCurrency]) return res.status(400).json({ error: 'Unsupported cryptocurrency.' });

    const baseUrl = PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const providerResponse = await fetch(`${NOWPAYMENTS_API_URL}/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': NOWPAYMENTS_API_KEY },
      body: JSON.stringify({
        price_amount: quote.total,
        price_currency: 'usd',
        pay_currency: currencyMap[requestedCurrency],
        order_id: orderId,
        order_description: `BULK OTP order ${orderId}`,
        ipn_callback_url: `${baseUrl}/api/payments/nowpayments/ipn`,
        success_url: `${baseUrl}/orders.html?payment=success`,
        cancel_url: `${baseUrl}/cart.html?payment=cancelled`
      }),
      signal: AbortSignal.timeout(15000)
    });
    const invoice = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok || !invoice.invoice_url) {
      return res.status(502).json({ error: invoice.message || 'NOWPayments could not create an invoice.' });
    }

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
      status: 'AWAITING_PAYMENT',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const orders = readJson(FILES.orders, []);
    orders.unshift(order);
    writeJson(FILES.orders, orders);
    res.status(201).json({ success: true, orderId, invoiceUrl: invoice.invoice_url });
  } catch (error) {
    const timeout = error.name === 'TimeoutError' || error.name === 'AbortError';
    res.status(timeout ? 504 : 500).json({ error: timeout ? 'Payment provider timed out. Please try again.' : 'Could not create the payment invoice.' });
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
  if (!nowPaymentsConfigured()) return res.status(503).json({ error: 'Payment callbacks are not configured.' });
  const signature = String(req.get('x-nowpayments-sig') || '');
  const expected = crypto.createHmac('sha512', NOWPAYMENTS_IPN_SECRET).update(JSON.stringify(sortObject(req.body))).digest('hex');
  const validSignature = signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!validSignature) return res.status(401).json({ error: 'Invalid payment signature.' });

  const orders = readJson(FILES.orders, []);
  const order = orders.find(candidate => candidate.id === req.body.order_id || candidate.externalPaymentId === String(req.body.payment_id || req.body.id));
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  const paymentStatus = String(req.body.payment_status || '').toLowerCase();
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
  res.json(result);
});

// Create/Update Product
app.post('/api/admin/products', requireAdmin, (req, res) => {
  const products = readJson(FILES.products, []);
  const pData = req.body;

  const keysInput = (pData.keysText || '').split('\n').map(k => k.trim()).filter(k => k.length > 0);
  const stock = keysInput.map((k, idx) => ({
    id: `stk_${Date.now()}_${idx}`,
    credentials: k,
    isSold: false
  }));

  const newProd = {
    id: pData.id || `prod_${Date.now()}`,
    category: pData.category || 'hourly',
    title: pData.title || 'Untitled Pass',
    shortTitle: pData.shortTitle || pData.title,
    price: parseFloat(pData.price) || 0,
    hidden: Boolean(pData.hidden),
    duration: pData.duration || '1-Hour',
    description: pData.description || '',
    prefix: pData.prefix || 'BOT-KEY',
    art: pData.art || 'assets/compact_pass_1h.jpg',
    stock
  };

  products.push(newProd);
  writeJson(FILES.products, products);

  logAudit(req.currentUser.email, 'CREATE_PRODUCT', `Created product ${newProd.title}`, req.ip);
  res.json({ success: true, product: newProd });
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const products = readJson(FILES.products, []);
  const idx = products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Product not found' });

  const pData = req.body;
  const existing = products[idx];

  if (pData.keysText !== undefined) {
    const keysInput = (pData.keysText || '').split('\n').map(k => k.trim()).filter(k => k.length > 0);
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

  if (pData.title !== undefined) existing.title = pData.title;
  if (pData.price !== undefined) existing.price = parseFloat(pData.price);
  if (pData.category !== undefined) existing.category = pData.category;
  if (pData.hidden !== undefined) existing.hidden = Boolean(pData.hidden);
  if (pData.description !== undefined) existing.description = pData.description;
  if (pData.art !== undefined) existing.art = pData.art;
  if (pData.prefix !== undefined) existing.prefix = pData.prefix;

  products[idx] = existing;
  writeJson(FILES.products, products);

  logAudit(req.currentUser.email, 'UPDATE_PRODUCT', `Updated product ${existing.title}`, req.ip);
  res.json({ success: true, product: existing });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  let products = readJson(FILES.products, []);
  const prod = products.find(p => p.id === req.params.id);
  products = products.filter(p => p.id !== req.params.id);
  writeJson(FILES.products, products);

  logAudit(req.currentUser.email, 'DELETE_PRODUCT', `Deleted product ${prod ? prod.title : req.params.id}`, req.ip);
  res.json({ success: true });
});

// Admin User Management & Balance Adjustment
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = readJson(FILES.users, []);
  const safeUsers = users.map(({ passwordHash, ...u }) => u);
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
  res.json(orders);
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

app.listen(PORT, () => {
  console.log(`BULK OTP Server running on port ${PORT}`);
});
