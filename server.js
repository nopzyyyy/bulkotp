const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 5500;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// JSON File Database Paths
const FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  sessions: path.join(DATA_DIR, 'sessions.json'),
  products: path.join(DATA_DIR, 'products.json'),
  orders: path.join(DATA_DIR, 'orders.json'),
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
const upload = multer({ storage });

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
app.post('/api/auth/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Email and password (min 6 chars) required.' });
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
    role: cleanEmail === 'admin' || cleanEmail === 'admin@bulkotp.com' ? 'ADMIN' : 'USER',
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  writeJson(FILES.users, users);

  // Generate Session Token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + (43200 * 1000); // 12 Hours

  const sessions = readJson(FILES.sessions, []);
  sessions.push({ token, userId: newUser.id, expiresAt });
  writeJson(FILES.sessions, sessions);

  res.cookie('market_session', token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 43200 * 1000
  });

  const { passwordHash, ...userWithoutPassword } = newUser;
  res.json({ success: true, token, user: userWithoutPassword });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email/Username and password required.' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const users = readJson(FILES.users, []);
  const user = users.find(u => u.email === cleanEmail);

  if (!user || !verifyPasswordScrypt(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid admin credentials or password.' });
  }

  // Create Session Token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + (43200 * 1000); // 12 Hours

  const sessions = readJson(FILES.sessions, []);
  sessions.push({ token, userId: user.id, expiresAt });
  writeJson(FILES.sessions, sessions);

  res.cookie('market_session', token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 43200 * 1000
  });

  const { passwordHash, ...userWithoutPassword } = user;
  res.json({ success: true, token, user: userWithoutPassword });
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

// Logout
app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies.market_session;
  if (token) {
    let sessions = readJson(FILES.sessions, []);
    sessions = sessions.filter(s => s.token !== token);
    writeJson(FILES.sessions, sessions);
  }
  res.clearCookie('market_session', { path: '/' });
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

// Checkout Endpoint (Placeholder Payments for Crypto/Card, Balance Checkout Supported)
app.post('/api/orders/checkout', requireAuth, (req, res) => {
  const { items, paymentMethod } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty.' });
  }

  const products = readJson(FILES.products, []);
  let serverTotal = 0;
  const orderItems = [];
  const purchasedItems = [];
  const stockToMark = [];

  // 1. Recalculate Prices Server-side & Assign Redeem Keys
  for (const item of items) {
    const prod = products.find(p => p.id === item.productId || p.id === item.id);
    if (!prod) {
      return res.status(400).json({ error: `Product ${item.title || item.productId} not found.` });
    }

    const qty = parseInt(item.qty || 1, 10);
    const itemPrice = Number(prod.price);
    serverTotal += itemPrice * qty;

    orderItems.push({
      id: prod.id,
      title: prod.title,
      price: itemPrice,
      qty
    });

    // Check available stock
    const stockList = prod.stock || [];
    const unsoldStock = stockList.filter(s => !s.isSold && !stockToMark.includes(s.id));

    if (unsoldStock.length < qty) {
      return res.status(400).json({ error: `Not enough stock keys for ${prod.title}. Available: ${unsoldStock.length}` });
    }

    for (let i = 0; i < qty; i++) {
      const stockItem = unsoldStock[i];
      stockToMark.push(stockItem.id);
      stockItem.isSold = true;
      stockItem.soldTo = req.currentUser.id;

      purchasedItems.push({
        name: prod.title,
        price: itemPrice,
        credentials: stockItem.credentials
      });
    }
  }

  // 2. Handle Balance Payment or Placeholder External Payment
  const isBalance = (paymentMethod || '').toLowerCase().includes('balance');
  const users = readJson(FILES.users, []);
  const user = users.find(u => u.id === req.currentUser.id);

  if (isBalance) {
    if (!user || user.balance < serverTotal) {
      return res.status(400).json({ error: `Insufficient store balance. Total: $${serverTotal.toFixed(2)}, Balance: $${(user ? user.balance : 0).toFixed(2)}` });
    }
    user.balance -= serverTotal;
    writeJson(FILES.users, users);
  }

  // Save updated products stock
  writeJson(FILES.products, products);

  // 3. Create Order
  const orderId = `ORD-${Date.now().toString().slice(-6)}`;
  const newOrder = {
    id: orderId,
    orderNumber: orderId,
    userId: req.currentUser.id,
    email: req.currentUser.email,
    items: orderItems,
    purchasedItems,
    total: serverTotal,
    paymentMethod: paymentMethod || (isBalance ? 'Store Balance' : 'Crypto (USDT-TRC20)'),
    status: 'COMPLETED',
    createdAt: new Date().toISOString()
  };

  const orders = readJson(FILES.orders, []);
  orders.unshift(newOrder);
  writeJson(FILES.orders, orders);

  res.json({
    success: true,
    order: newOrder,
    dispensedKey: purchasedItems.length > 0 ? purchasedItems[0].credentials : null
  });
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

  const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalOrders = orders.length;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const monthStr = now.toISOString().slice(0, 7);

  const todayRevenue = orders
    .filter(o => (o.createdAt || '').slice(0, 10) === todayStr)
    .reduce((sum, o) => sum + (o.total || 0), 0);

  const monthRevenue = orders
    .filter(o => (o.createdAt || '').slice(0, 7) === monthStr)
    .reduce((sum, o) => sum + (o.total || 0), 0);

  // Payment Breakdown
  const cryptoRevenue = orders.filter(o => (o.paymentMethod || '').toLowerCase().includes('crypto')).reduce((sum, o) => sum + (o.total || 0), 0);
  const balanceRevenue = orders.filter(o => (o.paymentMethod || '').toLowerCase().includes('balance')).reduce((sum, o) => sum + (o.total || 0), 0);
  const chimeRevenue = orders.filter(o => (o.paymentMethod || '').toLowerCase().includes('chime')).reduce((sum, o) => sum + (o.total || 0), 0);
  const starsRevenue = orders.filter(o => (o.paymentMethod || '').toLowerCase().includes('stars')).reduce((sum, o) => sum + (o.total || 0), 0);

  // Daily Revenue Line Chart Data (Last 14 days)
  const chartLabels = [];
  const chartData = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    chartLabels.push(dateStr.slice(5)); // MM-DD
    const dayRev = orders
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
    
    existing.stock = keysInput.map((k, i) => {
      if (existingStockMap.has(k)) {
        return existingStockMap.get(k);
      }
      return { id: `stk_${Date.now()}_${i}`, credentials: k, isSold: false };
    });
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

app.listen(PORT, () => {
  console.log(`BULK OTP Server running on port ${PORT}`);
});
