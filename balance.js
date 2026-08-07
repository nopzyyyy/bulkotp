document.addEventListener('DOMContentLoaded', () => {
  initBalancePage();
});

async function initBalancePage() {
  const user = await window.SiteShell?.refreshAuth();
  if (!user) {
    window.location.href = 'login.html?redirect=/balance.html';
    return;
  }

  updateBalanceDisplay(user.balance);
  loadBalanceHistory();

  document.addEventListener('site:auth', (e) => {
    if (e.detail?.user) {
      updateBalanceDisplay(e.detail.user.balance);
    }
  });
}

function updateBalanceDisplay(balanceVal) {
  const el = document.getElementById('balanceDisplayVal');
  if (el) {
    el.textContent = `$${Number(balanceVal || 0).toFixed(2)} USD`;
  }
}

function selectTopupAmount(amt, btnEl) {
  const input = document.getElementById('topupAmountInput');
  if (input) input.value = amt;

  document.querySelectorAll('.preset-amt-btn').forEach(btn => btn.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
}

function scrollToTopUp() {
  const el = document.getElementById('topupSection');
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

async function handleCryptoTopupSubmit(event) {
  event.preventDefault();

  const amountInput = document.getElementById('topupAmountInput');
  const currencySelect = document.getElementById('topupCurrencySelect');
  const submitBtn = document.getElementById('cryptoTopupBtn');

  const amount = parseFloat(amountInput?.value || 0);
  const payCurrency = currencySelect?.value || 'usdt_trc20';

  if (!amount || amount < 5) {
    showToast('Minimum top-up amount is $5.00 USD.', 'error');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating Invoice...';
  }

  try {
    const res = await fetch('/api/balance/topup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ amount, payCurrency })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to create top-up invoice.');
    }

    if (data.invoiceUrl) {
      showToast('Invoice created! Redirecting to payment portal...', 'success');
      window.setTimeout(() => {
        window.location.href = data.invoiceUrl;
      }, 1000);
    } else if (data.success) {
      showToast(`Success! $${amount.toFixed(2)} credited to your account balance.`, 'success');
      if (typeof data.balance === 'number') updateBalanceDisplay(data.balance);
      await window.SiteShell?.refreshAuth();
      loadBalanceHistory();
    }
  } catch (err) {
    showToast(err.message || 'Error processing top-up request.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Generate Crypto Invoice';
    }
  }
}

async function handleVoucherRedeemSubmit(event) {
  event.preventDefault();

  const codeInput = document.getElementById('voucherCodeInput');
  const submitBtn = document.getElementById('voucherRedeemBtn');

  const code = (codeInput?.value || '').trim().toUpperCase();

  if (!code) {
    showToast('Please enter a valid voucher code.', 'error');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Redeeming Code...';
  }

  try {
    const res = await fetch('/api/balance/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ code })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Invalid or expired voucher code.');
    }

    showToast(`Code redeemed! $${Number(data.amountRedeemed || 0).toFixed(2)} added to your balance.`, 'success');
    if (codeInput) codeInput.value = '';
    if (typeof data.newBalance === 'number') updateBalanceDisplay(data.newBalance);

    await window.SiteShell?.refreshAuth();
    loadBalanceHistory();
  } catch (err) {
    showToast(err.message || 'Voucher code invalid or already used.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Redeem Code to Balance';
    }
  }
}

async function loadBalanceHistory() {
  const tableBody = document.getElementById('balanceHistoryTable');
  if (!tableBody) return;

  try {
    const res = await fetch('/api/balance/history?t=' + Date.now(), { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load transaction history.');

    const history = await res.json();

    if (!Array.isArray(history) || history.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="padding: 2.5rem; text-align: center; color: var(--text-muted);">
            <i class="fa-solid fa-receipt" style="font-size: 1.75rem; margin-bottom: 0.5rem; display: block; opacity: 0.5;"></i>
            No balance transactions recorded yet.
          </td>
        </tr>`;
      return;
    }

    tableBody.innerHTML = history.map(tx => {
      const isPositive = Number(tx.amount || 0) >= 0;
      const amtStr = `${isPositive ? '+' : ''}$${Math.abs(Number(tx.amount || 0)).toFixed(2)}`;
      const amtClass = isPositive ? 'text-green' : 'text-red';
      const formattedDate = new Date(tx.createdAt || Date.now()).toLocaleString();
      const status = String(tx.status || 'COMPLETED').toUpperCase();

      return `
        <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
          <td style="padding: 1rem; color: var(--text-muted); font-size: 0.85rem;">${formattedDate}</td>
          <td style="padding: 1rem; font-weight: 600;"><span class="badge" style="background: rgba(255,255,255,0.06); color: #fff;">${escapeHtml(tx.type || 'TOPUP')}</span></td>
          <td style="padding: 1rem; color: var(--text-secondary);">${escapeHtml(tx.description || 'Account Balance Deposit')}</td>
          <td style="padding: 1rem; text-align: right; font-weight: 700; font-family: var(--font-heading);" class="${amtClass}">${amtStr}</td>
          <td style="padding: 1rem; text-align: center;">
            <span class="badge" style="background: ${status === 'COMPLETED' ? 'rgba(34,197,94,0.15)' : 'rgba(230,0,50,0.15)'}; color: ${status === 'COMPLETED' ? '#22c55e' : 'var(--accent)'}; border: 1px solid ${status === 'COMPLETED' ? 'rgba(34,197,94,0.3)' : 'rgba(230,0,50,0.3)'};">
              ${status}
            </span>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" style="padding: 2rem; text-align: center; color: var(--accent);">
          Unable to load history. Please try again.
        </td>
      </tr>`;
  }
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check text-green' : type === 'error' ? 'fa-circle-exclamation text-red' : 'fa-info-circle'}"></i> <span>${escapeHtml(msg)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
