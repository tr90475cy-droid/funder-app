(() => {
  'use strict';

  // ── Element refs ──
  const gridEl         = document.getElementById('marketGrid');
  const featuredGrid   = document.getElementById('featuredGrid');
  const featuredSec    = document.getElementById('featuredSection');
  const chipsEl        = document.getElementById('marketChips');
  const listingModal   = document.getElementById('listingModal');
  const listingClose   = document.getElementById('listingClose');
  const listingPost    = document.getElementById('listingPost');
  const listingForm    = document.getElementById('listingForm');
  const newListingBtn  = document.getElementById('newListingBtn');

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

  const buyModal       = document.getElementById('buyModal');
  const buyClose       = document.getElementById('buyClose');
  const buyItemCard    = document.getElementById('buyItemCard');
  const buyProceedBtn  = document.getElementById('buyProceedBtn');

  const promoteModal        = document.getElementById('promoteModal');
  const promoteClose        = document.getElementById('promoteClose');
  const promoPricing        = document.getElementById('promoPricing');
  const promoteProceedBtn   = document.getElementById('promoteProceedBtn');
  const promoSelectionStep  = document.getElementById('promoSelectionStep');
  const promoPaymentStep    = document.getElementById('promoPaymentStep');
  const transferDetails     = document.getElementById('transferDetails');
  const promoDoneBtn        = document.getElementById('promoDoneBtn');

  // ── State ──
  let currentCategory   = 'all';
  let pendingBuyId      = null;
  let pendingPromoteId  = null;
  let selectedTier      = null;
  let banks             = [];
  let banksLoaded       = false;
  let verifiedAccount   = null;
  let pricingLoaded     = false;
  let verifyTimer       = null;
  let verifyRequestId   = 0;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  // ═══════════════════════════════════════════════════
  // LISTINGS
  // ═══════════════════════════════════════════════════
  async function loadListings() {
    gridEl.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const r = await fetch('/api/listings?category=' + currentCategory);
      const items = await r.json();

      const featured = items.filter(l => l.featured && !l.sold);
      const regular  = items.filter(l => !l.featured || l.sold);

      if (featured.length) {
        featuredSec.classList.remove('hidden');
        featuredGrid.innerHTML = featured.map(l => listingHtml(l, true)).join('');
      } else {
        featuredSec.classList.add('hidden');
        featuredGrid.innerHTML = '';
      }

      if (!regular.length && !featured.length) {
        gridEl.innerHTML = '<div class="empty">No listings in this category yet.</div>';
        return;
      }
      gridEl.innerHTML = regular.map(l => listingHtml(l, false)).join('');
    } catch {
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

    if (l.mine) {
      if (l.sold) {
        actionHtml = `<button class="listing-sold-btn" data-sold="${l.id}">Mark available</button>`;
      } else {
        actionHtml = `
          <button class="listing-sold-btn" data-sold="${l.id}">Mark sold</button>
          <button class="listing-promote-btn" data-promote="${l.id}">
            ${l.featured ? `⭐ Boosted · ${l.days_remaining}d left` : '🚀 Promote'}
          </button>`;
      }
    } else if (!l.sold) {
      actionHtml = `<button class="listing-buy-btn" data-buy="${l.id}">Buy now</button>`;
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

  // Global click handler for cards
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
      return;
    }
    const promoteBtn = e.target.closest('[data-promote]');
    if (promoteBtn) {
      openPromoteModal(parseInt(promoteBtn.dataset.promote, 10));
      return;
    }
  });

  // ═══════════════════════════════════════════════════
  // BUY
  // ═══════════════════════════════════════════════════
  async function openBuyModal(id) {
    pendingBuyId = id;
    buyModal.classList.add('open');
    document.body.style.overflow = 'hidden';
    buyItemCard.innerHTML = '<div class="empty">Loading…</div>';

    try {
      const r = await fetch('/api/listings/' + id);
      if (!r.ok) throw new Error();
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

  // ═══════════════════════════════════════════════════
  // PROMOTE
  // ═══════════════════════════════════════════════════
  async function openPromoteModal(listingId) {
    pendingPromoteId = listingId;
    selectedTier = null;
    promoteProceedBtn.disabled = true;
    promoteProceedBtn.textContent = 'Select a duration';
    promoSelectionStep.classList.remove('hidden');
    promoPaymentStep.classList.add('hidden');
    promoteModal.classList.add('open');
    document.body.style.overflow = 'hidden';

    if (!pricingLoaded) {
      try {
        const r = await fetch('/api/ads/pricing');
        const tiers = await r.json();
        renderPricingTiers(tiers);
        pricingLoaded = true;
      } catch {
        promoPricing.innerHTML = '<div class="empty">Could not load prices.</div>';
      }
    }
  }

  function renderPricingTiers(tiers) {
    promoPricing.innerHTML = tiers.map(t => `
      <button class="promo-tier" data-days="${t.days}" data-price="${t.price}">
        <div class="promo-tier-days">${t.days} day${t.days !== 1 ? 's' : ''}</div>
        <div class="promo-tier-price">₦${t.price.toLocaleString()}</div>
        <div class="promo-tier-per">₦${t.per_day}/day</div>
        ${t.saving ? `<div class="promo-tier-saving">Save ₦${t.saving.toLocaleString()}</div>` : ''}
      </button>
    `).join('');

    promoPricing.querySelectorAll('.promo-tier').forEach(btn => {
      btn.addEventListener('click', () => {
        promoPricing.querySelectorAll('.promo-tier').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedTier = {
          days: parseInt(btn.dataset.days, 10),
          price: parseFloat(btn.dataset.price),
        };
        promoteProceedBtn.disabled = false;
        promoteProceedBtn.textContent = `Pay ₦${selectedTier.price.toLocaleString()} for ${selectedTier.days} day${selectedTier.days !== 1 ? 's' : ''}`;
      });
    });
  }

  function closePromoteModal() {
    promoteModal.classList.remove('open');
    document.body.style.overflow = '';
    pendingPromoteId = null;
    selectedTier = null;
  }

  promoteClose.addEventListener('click', closePromoteModal);
  promoteModal.addEventListener('click', (e) => {
    if (e.target === promoteModal) closePromoteModal();
  });

  promoteProceedBtn.addEventListener('click', async () => {
    if (!pendingPromoteId || !selectedTier) return;
    promoteProceedBtn.disabled = true;
    promoteProceedBtn.textContent = 'Generating account…';

    try {
      const r = await fetch('/api/market/promote/' + pendingPromoteId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: selectedTier.days })
      });
      const data = await r.json();

      if (data.account_number) {
        promoSelectionStep.classList.add('hidden');
        promoPaymentStep.classList.remove('hidden');

        transferDetails.innerHTML = `
          <div class="transfer-row">
            <span>Bank</span>
            <strong>${esc(data.bank_name)}</strong>
          </div>
          <div class="transfer-row">
            <span>Account Number</span>
            <strong class="transfer-account-number">${esc(data.account_number)}</strong>
          </div>
          <div class="transfer-row">
            <span>Account Name</span>
            <strong>${esc(data.account_name)}</strong>
          </div>
          <div class="transfer-row transfer-row-highlight">
            <span>Amount</span>
            <strong class="transfer-amount">₦${Number(data.amount).toLocaleString()}</strong>
          </div>
        `;
      } else {
        alert(data.error || 'Could not generate account details.');
        promoteProceedBtn.disabled = false;
        promoteProceedBtn.textContent = `Pay ₦${selectedTier.price.toLocaleString()}`;
      }
    } catch {
      alert('An error occurred. Please try again.');
      promoteProceedBtn.disabled = false;
      promoteProceedBtn.textContent = `Pay ₦${selectedTier.price.toLocaleString()}`;
    }
  });

  promoDoneBtn.addEventListener('click', () => {
    closePromoteModal();
    loadListings();
  });

  // ═══════════════════════════════════════════════════
  // CATEGORY CHIPS
  // ═══════════════════════════════════════════════════
  chipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip || chip.classList.contains('active')) return;
    chipsEl.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentCategory = chip.dataset.cat;
    loadListings();
  });

  // ═══════════════════════════════════════════════════
  // NEW LISTING
  // ═══════════════════════════════════════════════════
  newListingBtn.addEventListener('click', async () => {
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

  // ═══════════════════════════════════════════════════
  // SELLER BANK SETUP
  // ═══════════════════════════════════════════════════
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
    verifyHint.textContent = 'Enter a 10-digit account number to verify.';

    if (!banksLoaded) {
      bankSelect.innerHTML = '<option value="">Loading banks…</option>';
      try {
        const r = await fetch('/api/paystack/banks');
        const list = await r.json();

        if (!Array.isArray(list) || list.length === 0) {
          bankSelect.innerHTML = '<option value="">No banks available — try again later</option>';
          return;
        }

        banks = list;
        banksLoaded = true;
        bankSelect.innerHTML = '<option value="">Select bank</option>' +
          banks.map(b => `<option value="${esc(b.code)}">${esc(b.name)}</option>`).join('');
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
    // Reset state, then schedule verification
    clearTimeout(verifyTimer);
    accountName.value = '';
    verifiedAccount = null;
    bankSave.disabled = true;

    if (accountNumber.value.length !== 10 || !bankSelect.value) {
      verifyHint.textContent = 'Enter a 10-digit account number to verify.';
      return;
    }

    verifyHint.textContent = 'Verifying…';
    verifyTimer = setTimeout(verifyAccount, 350);
  });

  bankSelect.addEventListener('change', () => {
    clearTimeout(verifyTimer);
    accountName.value = '';
    verifiedAccount = null;
    bankSave.disabled = true;
    if (accountNumber.value.length === 10 && bankSelect.value) {
      verifyHint.textContent = 'Verifying…';
      verifyTimer = setTimeout(verifyAccount, 200);
    } else {
      verifyHint.textContent = 'Enter a 10-digit account number to verify.';
    }
  });

  async function verifyAccount() {
    const num = accountNumber.value;
    const bank = bankSelect.value;
    if (num.length !== 10 || !bank) return;

    const thisRequest = ++verifyRequestId;

    try {
      const r = await fetch('/api/paystack/verify-account?account_number=' + encodeURIComponent(num) + '&bank_code=' + encodeURIComponent(bank));
      const data = await r.json();

      // Ignore if a newer request has started
      if (thisRequest !== verifyRequestId) return;

      if (data.account_name) {
        accountName.value = data.account_name;
        verifiedAccount = { account_number: num, bank_code: bank, account_name: data.account_name };
        verifyHint.textContent = '✓ Account verified';
        bankSave.disabled = false;
      } else {
        accountName.value = '';
        verifiedAccount = null;
        verifyHint.textContent = data.error || 'Could not verify. Check details and try again.';
        bankSave.disabled = true;
      }
    } catch {
      if (thisRequest !== verifyRequestId) return;
      accountName.value = '';
      verifiedAccount = null;
      verifyHint.textContent = 'Verification failed. Please try again.';
      bankSave.disabled = true;
    }
  }

  bankSave.addEventListener('click', async () => {
    if (!verifiedAccount) return;
    bankSave.disabled = true;
    bankSave.textContent = 'Saving…';
    try {
      const r = await fetch('/api/me/subaccount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...verifiedAccount,
          date_of_birth: dobField.value || '2000-01-01'
        })
      });
      const data = await r.json();
      if (data.ok) {
        alert('✓ Payments set up! You can now receive money for your sales.');
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

  // ═══════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════
  loadListings();
  checkSellerSetup();
})();