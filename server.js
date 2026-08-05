const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static directories
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure directories exist
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const STORE_FILE = path.join(DATA_DIR, 'store.json');

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${Date.now()}_${name}${ext}`);
  }
});
const upload = multer({ storage });

// Helper: Salt & Hash Password
const SALT = 'BULK_OTP_SUPER_SECURE_SALT_2026';
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + SALT).digest('hex');
}

// In-Memory Token Sessions
const activeAdminTokens = new Set();

// Initial Default Store Data
const INITIAL_PRODUCTS = [
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
    stockKeys: [
      'BOT-COMPACT-9A8B-7C6D-KEY',
      'BOT-COMPACT-1E2F-3G4H-KEY',
      'BOT-COMPACT-5I6J-7K8L-KEY',
      'BOT-COMPACT-9M0N-1P2Q-KEY',
      'BOT-COMPACT-3R4S-5T6U-KEY'
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
    stockKeys: [
      'BOT-EXTENDED-AA11-BB22-KEY',
      'BOT-EXTENDED-CC33-DD44-KEY',
      'BOT-EXTENDED-EE55-FF66-KEY'
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
    stockKeys: [
      'BOT-DAYLONG-7788-9900-KEY',
      'BOT-DAYLONG-1122-3344-KEY'
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
    stockKeys: [
      'BOT-MULTIDAY-5566-7788-KEY'
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
    stockKeys: [
      'BOT-WEEKLY-9900-1122-KEY'
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
    stockKeys: [
      'BOT-BIWEEKLY-3344-5566-KEY'
    ]
  }
];

function loadStore() {
  if (!fs.existsSync(STORE_FILE)) {
    const defaultData = {
      admin: {
        username: 'admin',
        passwordHash: hashPassword('BulkOTPSecretAdmin2026!')
      },
      wallets: {
        btc: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        usdt_trc20: 'T9yD14Nj9j7xAB4dbGeiX9hA2A1bC3dE4f',
        eth: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
        sol: '7v99fvB1iEe4aV8yK91qR9tL8mX7zP4qS5wE2r1tN8y',
        ltc: 'LTC1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
      },
      products: INITIAL_PRODUCTS,
      orders: [
        {
          id: 'ORD-1001',
          orderNumber: 'ORD-1001',
          email: 'customer1@gmail.com',
          items: [{ title: '1-Hour Compact Key', qty: 1, price: 17.00 }],
          total: 17.00,
          paymentMethod: 'Crypto (USDT-TRC20)',
          dispensedKeys: ['BOT-COMPACT-X1Y2-Z3A4-KEY'],
          createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
        },
        {
          id: 'ORD-1002',
          orderNumber: 'ORD-1002',
          email: 'vipbuyer@protonmail.com',
          items: [{ title: '24-Hour Daylong Key', qty: 1, price: 60.00 }],
          total: 60.00,
          paymentMethod: 'Crypto (BTC)',
          dispensedKeys: ['BOT-DAYLONG-M9N8-O7P6-KEY'],
          createdAt: new Date(Date.now() - 86400000).toISOString()
        }
      ]
    };
    saveStore(defaultData);
    return defaultData;
  }
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading store.json:', err);
    return { admin: {}, wallets: {}, products: [], orders: [] };
  }
}

function saveStore(data) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Middleware: Authenticate Admin Token
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Admin token required.' });
  }
  const token = authHeader.split(' ')[1];
  if (!activeAdminTokens.has(token)) {
    return res.status(401).json({ error: 'Invalid or expired admin token.' });
  }
  next();
}

// Key Generator Fallback helper
function generateFallbackKey(prefix) {
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

// --- PUBLIC ROUTES ---

// 1. Get Products (Public view filters out hidden products & key arrays)
app.get('/api/products', (req, res) => {
  const store = loadStore();
  const isAdmin = req.headers.authorization && activeAdminTokens.has(req.headers.authorization.split(' ')[1]);

  if (isAdmin) {
    return res.json(store.products);
  }

  // Filter for regular store customers
  const publicProducts = store.products
    .filter(p => !p.hidden)
    .map(p => ({
      id: p.id,
      category: p.category,
      title: p.title,
      shortTitle: p.shortTitle,
      price: p.price,
      stock: (p.stockKeys && p.stockKeys.length > 0) ? p.stockKeys.length : (p.stock || 0),
      duration: p.duration,
      description: p.description,
      prefix: p.prefix,
      art: p.art
    }));

  res.json(publicProducts);
});

// 2. Get Crypto Wallet Info
app.get('/api/wallets', (req, res) => {
  const store = loadStore();
  res.json(store.wallets || {});
});

// 3. Process Customer Checkout
app.post('/api/checkout', (req, res) => {
  const { email, cart, paymentMethod } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (!cart || !Array.isArray(cart) || cart.length === 0) {
    return res.status(400).json({ error: 'Cart is empty.' });
  }

  const store = loadStore();
  let totalAmount = 0;
  const dispensedKeys = [];
  const orderItemsSummary = [];

  for (const cartItem of cart) {
    const product = store.products.find(p => p.id === cartItem.id);
    if (!product) {
      return res.status(404).json({ error: `Product ${cartItem.id} not found.` });
    }

    const qty = Math.max(1, parseInt(cartItem.qty) || 1);
    totalAmount += product.price * qty;
    orderItemsSummary.push({
      id: product.id,
      title: product.shortTitle || product.title,
      price: product.price,
      qty: qty
    });

    // Dispense stock keys
    for (let i = 0; i < qty; i++) {
      if (product.stockKeys && product.stockKeys.length > 0) {
        // Pop key from stock
        const key = product.stockKeys.shift();
        dispensedKeys.push(key);
      } else {
        // Generate fallback key if stock is empty
        const fallback = generateFallbackKey(product.prefix);
        dispensedKeys.push(fallback);
      }
    }
  }

  const orderNumber = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
  const newOrder = {
    id: orderNumber,
    orderNumber,
    email: email.trim(),
    items: orderItemsSummary,
    total: parseFloat(totalAmount.toFixed(2)),
    paymentMethod: paymentMethod || 'Crypto',
    dispensedKeys,
    createdAt: new Date().toISOString()
  };

  store.orders.unshift(newOrder);
  saveStore(store);

  res.json({
    success: true,
    orderNumber,
    total: newOrder.total,
    keys: dispensedKeys,
    dispensedKey: dispensedKeys[0],
    message: 'Purchase completed successfully!'
  });
});

// --- ADMIN ROUTES & AUTH ---

// 4. Admin Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }

  const store = loadStore();
  const hashedInput = hashPassword(password);

  if (username === store.admin.username && hashedInput === store.admin.passwordHash) {
    const token = crypto.randomBytes(32).toString('hex');
    activeAdminTokens.add(token);
    return res.json({ success: true, token, username: store.admin.username });
  }

  res.status(401).json({ error: 'Invalid admin credentials.' });
});

// 5. Admin Verify Token
app.get('/api/admin/verify', requireAdmin, (req, res) => {
  res.json({ valid: true });
});

// 6. Admin Overview Stats
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const store = loadStore();

  const totalRevenue = store.orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalOrders = store.orders.length;
  let totalStockKeys = 0;
  store.products.forEach(p => {
    totalStockKeys += (p.stockKeys ? p.stockKeys.length : 0);
  });
  const totalProducts = store.products.length;

  res.json({
    totalRevenue: parseFloat(totalRevenue.toFixed(2)),
    totalOrders,
    totalStockKeys,
    totalProducts,
    recentOrders: store.orders.slice(0, 10),
    wallets: store.wallets
  });
});

// 7. Product CRUD APIs (Admin Only)

// Create Product
app.post('/api/products', requireAdmin, (req, res) => {
  const store = loadStore();
  const { title, shortTitle, category, price, duration, description, prefix, art, hidden, keysText } = req.body;

  if (!title || price === undefined) {
    return res.status(400).json({ error: 'Title and price are required.' });
  }

  const newId = 'prod-' + Date.now();
  let keysArray = [];
  if (keysText && typeof keysText === 'string') {
    keysArray = keysText.split('\n').map(k => k.trim()).filter(k => k.length > 0);
  }

  const newProduct = {
    id: newId,
    category: category || 'hourly',
    title: title.trim(),
    shortTitle: shortTitle ? shortTitle.trim() : title.trim(),
    price: parseFloat(price) || 0,
    hidden: Boolean(hidden),
    duration: duration || '1-Hour',
    description: description || '',
    prefix: prefix ? prefix.toUpperCase().trim() : 'BOT-KEY',
    art: art || 'assets/compact_pass_1h.jpg',
    stockKeys: keysArray
  };

  store.products.push(newProduct);
  saveStore(store);

  res.json({ success: true, product: newProduct });
});

// Update Product
app.put('/api/products/:id', requireAdmin, (req, res) => {
  const store = loadStore();
  const prodId = req.params.id;
  const index = store.products.findIndex(p => p.id === prodId);

  if (index === -1) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const existing = store.products[index];
  const { title, shortTitle, category, price, duration, description, prefix, art, hidden, keysText } = req.body;

  let updatedKeys = existing.stockKeys || [];
  if (keysText !== undefined && typeof keysText === 'string') {
    updatedKeys = keysText.split('\n').map(k => k.trim()).filter(k => k.length > 0);
  }

  store.products[index] = {
    ...existing,
    title: title !== undefined ? title.trim() : existing.title,
    shortTitle: shortTitle !== undefined ? shortTitle.trim() : existing.shortTitle,
    category: category !== undefined ? category : existing.category,
    price: price !== undefined ? parseFloat(price) : existing.price,
    duration: duration !== undefined ? duration : existing.duration,
    description: description !== undefined ? description : existing.description,
    prefix: prefix !== undefined ? prefix.toUpperCase().trim() : existing.prefix,
    art: art !== undefined ? art : existing.art,
    hidden: hidden !== undefined ? Boolean(hidden) : existing.hidden,
    stockKeys: updatedKeys
  };

  saveStore(store);
  res.json({ success: true, product: store.products[index] });
});

// Delete Product
app.delete('/api/products/:id', requireAdmin, (req, res) => {
  const store = loadStore();
  const prodId = req.params.id;
  const filtered = store.products.filter(p => p.id !== prodId);

  if (filtered.length === store.products.length) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  store.products = filtered;
  saveStore(store);
  res.json({ success: true, message: 'Product deleted.' });
});

// Upload Thumbnail Image
app.post('/api/upload', requireAdmin, upload.single('thumbnail'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded.' });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ success: true, url: fileUrl });
});

// 8. Admin Settings API (Credentials & Wallets)
app.post('/api/admin/settings', requireAdmin, (req, res) => {
  const store = loadStore();
  const { newUsername, newPassword, wallets } = req.body;

  if (newUsername) store.admin.username = newUsername.trim();
  if (newPassword && newPassword.trim().length >= 6) {
    store.admin.passwordHash = hashPassword(newPassword.trim());
  }
  if (wallets && typeof wallets === 'object') {
    store.admin.wallets = { ...store.wallets, ...wallets };
    store.wallets = { ...store.wallets, ...wallets };
  }

  saveStore(store);
  res.json({ success: true, message: 'Settings updated successfully.' });
});

// Catch-all SPA fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/admin')) {
    return res.sendFile(path.join(__dirname, 'admin.html'));
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`================================================`);
  console.log(`🚀 BULK OTP Store Server Running on Port ${PORT}`);
  console.log(`🌐 Public Store: http://localhost:${PORT}`);
  console.log(`🔑 Admin Panel:  http://localhost:${PORT}/admin.html`);
  console.log(`================================================`);
});
