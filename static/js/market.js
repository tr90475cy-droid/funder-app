(() => {
  'use strict';

  const gridEl         = document.getElementById('marketGrid');
  const featuredGrid   = document.getElementById('featuredGrid');
  const featuredSec    = document.getElementById('featuredSection');
  const chipsEl        = document.getElementById('marketChips');
  const listingModal   = document.getElementById('listingModal');
  const listingClose   = document.getElementById('listingClose');
  const listingPost    = document.getElementById('listingPost');
  const listingForm    = document.getElementById('listingForm');
  const newListingBtn  = document.getElementById('newListingBtn');

  // Seller payments
  const sellerBanner   = document.getElementById('sellerBanner');
  const setupBankBtn   = document.getElementById('setupBankBtn');
  const bankModal      = document.getElementById('bankSetupModal');
  const bankClose      = document.getElementById('bankSetupClose');
  const bankSave       = document.getElementById('bankSetupSave');
  const bankSelect     = document.getElementById('bankSelect');
  const accountNumber  = document.getElementById('accountNumber');
  const accountName    = document.getElementById('accountName');
  const verifyHint     = document.getElementById('verifyHint');
  const dobField       = document.getElementById('dobField');

  // Buy modal
  const buyModal       = document.getElementById('buyModal');
  const buyClose       = document.getElementById('buyClose');
  const buyContent     = document.getElementById('buyContent');
  const buyItemCard    = document.getElementById('buyItemCard');
  const buyProceedBtn  = document.getElementById('buyProceedBtn');

  let currentCategory = 'all';
  let pendingBuyId = null;
  let banks = [];
  let verifiedAccount = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  // ═══════════════════════════════════════
  // LOAD LISTINGS
  // ═══════════════════════════════════════
  async function loadListings() {
    gridEl.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const r = await fetch('/api/listings?category=' + currentCategory);
      const items = await r.json();

      const featured = items.filter(l => l.featured && !l.sold);
      const regular = items.filter(l => !l.featured || l.sold);

      // Featured section
      if (featured.length) {
        featuredSec.classList.remove('hidden');
        featuredGrid.innerHTML = featured.map(l => listingHtml(l, true)).join('');
      } else {
        featuredSec.classList.add('hidden');
        featuredGrid.innerHTML = '';
      }

      // Regular grid
      if (!regular.length && !featured.length) {
        gridEl.innerHTML = '<div class="empty">No listings in this category yet.</div>';
        return;
      }
      gridEl.innerHTML = regular.map(l => listingHtml(l, false)).join('');
    } catch (e) {
      gridEl.innerHTML = '<div class="empty">Could not load listings.</div>';
    }
  }

  function listingHtml(l, isFeatured) {
    const img = l.image
      ? `<img class="listing-img" src="${esc(l.image)}" alt="">`
      : `<div class="listing-img listing-img-empty">📦</div>`;
    const sold = l.sold ? '<div class="listing-sold">SOLD</div>' : '';
    const featuredBadge = isFeatured ? '<div class="listing-featured-badge">⭐ Featured</div>' : '';

    let actionHtml = '';

    if (!l.mine && !l.sold) {
      actionHtml = `<button class="listing-buy-btn" data-buy="${l.id}">Buy now</button>`;
    } else if (l.mine) {
      actionHtml = `<button class="listing-sold-btn" data-sold="${l.id}">${l.sold ? 'Mark available' : 'Mark sold'}</button>`;
    }

    return `
      <div class="listing ${l.sold ? 'is-sold' : ''} ${isFeatured ? 'is-featured' : ''}">
        <div class="listing-img-wrap">
          ${img}
          ${sold}
          ${featuredBadge}
        </div>
        <div class="listing-body">
          <div class="listing-title">${esc(l.title)}</div>
          <div class="listing-price">₦${Number(l.price).toLocaleString()}</div>
          <div class="listing-meta">${esc(l.seller)} · ${esc(l.time)}</div>
          ${actionHtml}
        </div>
      </div>
    `;
  }

  // Delegate clicks on listings grid (buy / mark sold)
  document.addEventListener('click', async (e) => {
    const buyBtn = e.target.closest('[data-buy]');
    if (buyBtn) {
      openBuyModal(parseInt(buyBtn.dataset.buy, 10));
      return;
    }
    const soldBtn = e.target.closest('[data-sold]');
    if (soldBtn) {
      await fetch('/api/listings/' + soldBtn.dataset.sold + '/sold', { method: 'POST' });
      loadListings();
    }
  });

  // ═══════════════════════════════════════
  // BUY FLOW
  // ═══════════════════════════════════════
  async function openBuyModal(id) {
    pendingBuyId = id;
    buyModal.classList.add('open');
    document.body.style.overflow = 'hidden';
    buyItemCard.innerHTML = '<div class="empty">Loading…</div>';

    try {
      const r = await fetch('/api/listings/' + id);
      const l = await r.json();

      buyItemCard.innerHTML = `
        <div class="buy-item">
          ${l.image ? `<img src="${esc(l.image)}" alt="">` : '<div class="buy-item-img-empty">📦</div>'}
          <div class="buy-item-info">
            <div class="buy-item-title">${esc(l.title)}</div>
            <div class="buy-item-price">₦${Number(l.price).toLocaleString()}</div>
            <div class="buy-item-seller">Seller: ${esc(l.seller)}</div>
          </div>
        </div>
      `;
    } catch {
      buyItemCard.innerHTML = '<div class="empty">Could not load listing.</div>';
    }
  }

  function closeBuyModal() {
    buyModal.classList.remove('open');
    document.body.style.overflow = '';
    pendingBuyId = null;
    buyProceedBtn.disabled = false;
    buyProceedBtn.textContent = 'Pay with Paystack →';
  }

  buyClose.addEventListener('click', closeBuyModal);
  buyModal.addEventListener('click', (e) => { if (e.target === buyModal) closeBuyModal(); });

  buyProceedBtn.addEventListener('click', async () => {
    if (!pendingBuyId) return;
    buyProceedBtn.disabled = true;
    buyProceedBtn.textContent = 'Opening Paystack…';

    try {
      const r = await fetch('/api/market/buy/' + pendingBuyId, { method: 'POST' });
      const data = await r.json();
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      } else {
        alert(data.error || 'Could not start payment');
        buyProceedBtn.disabled = false;
        buyProceedBtn.textContent = 'Pay with Paystack →';
      }
    } catch {
      alert('Payment could not start. Please try again.');
      buyProceedBtn.disabled = false;
      buyProceedBtn.textContent = 'Pay with Paystack →';
    }
  });

  // ═══════════════════════════════════════
  // CATEGORY CHIPS
  // ═══════════════════════════════════════
  chipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip || chip.classList.contains('active')) return;
    chipsEl.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentCategory = chip.dataset.cat;
    loadListings();
  });

  // ═══════════════════════════════════════
  // NEW LISTING
  // ═══════════════════════════════════════
  newListingBtn.addEventListener('click', async () => {
    // Check if seller has payments set up
    const hasPayments = await checkSellerSetup();
    if (!hasPayments) {
      if (confirm('You need to set up your bank details to sell. Do that now?')) {
        openBankModal();
      }
      return;
    }
    listingModal.classList.add('open');
    document.body.style.overflow = 'hidden';
  });

  function closeListingModal() {
    listingModal.classList.remove('open');
    document.body.style.overflow = '';
    listingForm.reset();
    listingPost.disabled = true;
  }

  listingClose.addEventListener('click', closeListingModal);
  listingModal.addEventListener('click', (e) => { if (e.target === listingModal) closeListingModal(); });

  listingForm.addEventListener('input', () => {
    const data = new FormData(listingForm);
    listingPost.disabled = !data.get('title') || !data.get('price');
  });

  listingPost.addEventListener('click', async () => {
    const fd = new FormData(listingForm);
    if (!fd.get('title') || !fd.get('price')) return;
    listingPost.disabled = true;
    listingPost.textContent = 'Posting…';

    try {
      const r = await fetch('/api/listings', { method: 'POST', body: fd });
      if (r.ok) {
        closeListingModal();
        loadListings();
      } else {
        const err = await r.json().catch(() => ({}));
        alert(err.error || 'Could not create listing');
      }
    } finally {
      listingPost.disabled = false;
      listingPost.textContent = 'Post';
    }
  });

  // ═══════════════════════════════════════
  // SELLER SETUP
  // ═══════════════════════════════════════
  async function checkSellerSetup() {
    try {
      const r = await fetch('/api/me/subaccount-status');
      const data = await r.json();
      if (!data.has_subaccount) {
        sellerBanner.classList.remove('hidden');
        return false;
      }
      sellerBanner.classList.add('hidden');
      return true;
    } catch {
      sellerBanner.classList.remove('hidden');
      return false;
    }
  }

  setupBankBtn.addEventListener('click', openBankModal);

  async function openBankModal() {
    bankModal.classList.add('open');
    document.body.style.overflow = 'hidden';
    accountName.value = '';
    accountNumber.value = '';
    verifiedAccount = null;
    bankSave.disabled = true;

    if (!banks.length) {
      try {
        const r = await fetch('/api/paystack/banks');
        banks = await r.json();
        bankSelect.innerHTML = '<option value="">Select bank</option>' +
          banks.map(b => `<option value="${b.code}">${esc(b.name)}</option>`).join('');
      } catch {
        bankSelect.innerHTML = '<option value="">Could not load banks</option>';
      }
    }
  }

  function closeBankModal() {
    bankModal.classList.remove('open');
    document.body.style.overflow = '';
  }

  bankClose.addEventListener('click', closeBankModal);
  bankModal.addEventListener('click', (e) => { if (e.target === bankModal) closeBankModal(); });

  accountNumber.addEventListener('input', () => {
    accountNumber.value = accountNumber.value.replace(/\D/g, '').slice(0, 10);
    verifyAccount();
  });

  bankSelect.addEventListener('change', verifyAccount);

  async function verifyAccount() {
    const num = accountNumber.value;
    const bank = bankSelect.value;
    if (num.length !== 10 || !bank) {
      accountName.value = '';
      verifyHint.textContent = 'Enter a 10-digit account number to verify.';
      bankSave.disabled = true;
      verifiedAccount = null;
      return;
    }

    verifyHint.textContent = 'Verifying…';
    try {
      const r = await fetch('/api/paystack/verify-account?account_number=' + num + '&bank_code=' + bank);
      const data = await r.json();
      if (data.account_name) {
        accountName.value = data.account_name;
        verifiedAccount = { account_number: num, bank_code: bank, account_name: data.account_name };
        verifyHint.textContent = '✓ Account verified';
        bankSave.disabled = false;
      } else {
        accountName.value = '';
        verifyHint.textContent = 'Could not verify. Check details and try again.';
        bankSave.disabled = true;
        verifiedAccount = null;
      }
    } catch {
      verifyHint.textContent = 'Verification failed. Try again.';
      bankSave.disabled = true;
      verifiedAccount = null;
    }
  }

  bankSave.addEventListener('click', async () => {
    if (!verifiedAccount) return;

    if (!dobField.value) {
      alert('Please enter your date of birth (required by Paystack).');
      return;
    }

    bankSave.disabled = true;
    bankSave.textContent = 'Saving…';

    try {
      const r = await fetch('/api/me/subaccount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...verifiedAccount,
          date_of_birth: dobField.value,
        })
      });
      const data = await r.json();
      if (data.ok) {
        alert('✓ Payments set up! You can now create listings and receive money directly.');
        closeBankModal();
        sellerBanner.classList.add('hidden');
      } else {
        alert(data.error || 'Could not save bank details');
        bankSave.disabled = false;
      }
    } catch {
      alert('Could not save. Please try again.');
      bankSave.disabled = false;
    } finally {
      bankSave.textContent = 'Save';
    }
  });

  // ═══════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════
  loadListings();
  checkSellerSetup();
})();