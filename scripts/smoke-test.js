const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const port = 5517;
const root = path.resolve(__dirname, '..');
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bulkotp-smoke-'));
const baseUrl = `http://127.0.0.1:${port}`;

function cookieFrom(response) {
  return (response.headers.get('set-cookie') || '').split(';')[0];
}

async function request(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/products`);
      if (response.ok) return;
    } catch (_) {
      // Server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('Smoke-test server did not start.');
}

async function main() {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: root,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: path.join(testRoot, 'data'),
      UPLOADS_DIR: path.join(testRoot, 'uploads'),
      NOWPAYMENTS_API_KEY: '',
      NOWPAYMENTS_IPN_SECRET: ''
    }
  });

  let stderr = '';
  server.stderr.on('data', chunk => { stderr += chunk.toString(); });

  try {
    await waitForServer();
    const email = `qa-${Date.now()}@example.com`;

    const registration = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Customer123' })
    });
    assert.equal(registration.response.status, 201);
    assert.equal(registration.data.user.role, 'USER');
    assert.equal(Object.hasOwn(registration.data, 'token'), false);
    const customerCookie = cookieFrom(registration.response);
    assert.ok(customerCookie.startsWith('market_session='));

    const config = await request('/api/payments/config');
    assert.equal(config.data.nowPayments.enabled, false);

    const crypto = await request('/api/payments/nowpayments/invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: customerCookie },
      body: JSON.stringify({ items: [{ productId: 'compact-1h', qty: 1 }], payCurrency: 'btc' })
    });
    assert.equal(crypto.response.status, 503);
    assert.equal(crypto.data.code, 'PAYMENTS_NOT_CONFIGURED');

    const adminLogin = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin', password: 'admin123' })
    });
    assert.equal(adminLogin.response.status, 200);
    const adminCookie = cookieFrom(adminLogin.response);

    const balance = await request('/api/admin/users/balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ email, amount: 50 })
    });
    assert.equal(balance.response.status, 200);

    const checkout = await request('/api/orders/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: customerCookie },
      body: JSON.stringify({ items: [{ productId: 'compact-1h', qty: 1 }], paymentMethod: 'balance' })
    });
    assert.equal(checkout.response.status, 200);
    assert.equal(checkout.data.order.status, 'COMPLETED');
    assert.equal(checkout.data.keys.length, 1);
    assert.equal(checkout.data.balance, 33);

    const orders = await request('/api/orders', { headers: { Cookie: customerCookie } });
    assert.equal(orders.response.status, 200);
    assert.equal(orders.data.length, 1);
    assert.ok(orders.data[0].purchasedItems[0].credentials);

    const stats = await request('/api/admin/stats', { headers: { Cookie: adminCookie } });
    assert.equal(stats.response.status, 200);
    assert.ok(stats.data.totalRevenue >= 17);

    console.log(JSON.stringify({
      auth: 'ok',
      cryptoPlaceholder: 'safely-disabled',
      balanceCheckout: 'ok',
      deliveredKeys: checkout.data.keys.length,
      ordersPageApi: 'ok',
      adminStats: 'ok'
    }));
  } finally {
    server.kill();
  }

  if (stderr) process.stderr.write(stderr);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
