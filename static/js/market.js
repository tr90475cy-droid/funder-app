(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  const gridEl         = $('marketGrid');
  const featuredGrid   = $('featuredGrid');
  const featuredSec    = $('featuredSection');
  const chipsEl        = $('marketChips');
  const searchInput    = $('marketSearch');
  const listingModal   = $('listingModal');
  const listingClose   = $('listingClose');
  const listingPost    = $('listingPost');
  const listingForm    = $('listingForm');
  const newListingBtn  = $('newListingBtn');
  const listingWhatsapp = $('listingWhatsapp');

  const buyModal       = $('buyModal');
  const buyClose       = $('buyClose');
  const buyItemCard    = $('buyItemCard');
  const buyProceedBtn  = $('buyProceedBtn');

  const promoteModal       = $('promoteModal');
  const promoteClose       = $('promoteClose');
  const promoPricing       = $('promoPricing');
  const promoSelectionStep = $('promoSelectionStep');
  const promoPaymentStep   = $('promoPaymentStep');
  const boostSummary       = $('boostSummary');
  const transferDetails    = $('transferDetails');
  const promoDoneBtn       = $('promoDoneBtn');
  const promoBackBtn       = $('promoBackBtn');

  let currentCategory = 'all';
  let currentSearch   = '';
  let allListings     = [];
  let pendingBuyId    = null;
  let pendingPromoteId = null;
  let pricingLoaded   = false;
  let currentTier     = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  // ── LOAD & RENDER LISTINGS ──
  async function loadListings() {
    gridEl.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const r = await fetch('/api/listings?category=' + currentCategory);
      allListings = await r.json();
      renderListings();
    } catch {
      gridEl.innerHTML = '<div class="empty">Could not load listings.</div>';
    }
  }

  function renderListings() {
    // Apply search filter locally
    let items = allListings;
    if (currentSearch) {
      const q = currentSearch.toLowerCase();
      items = items.filter(l =>
        (l.title || '').toLowerCase().includes(q) ||
        (l.description || '').toLowerCase().includes(q)
      );
    }

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
      gridEl.innerHTML = `<div class="empty">${currentSearch ? 'No matches for "' + esc(currentSearch) + '"' : 'No listings here yet.'}</div>`;
      return;
    }
    gridEl.innerHTML = regular.map(l => listingHtml(l, false)).join('');
  }

  function listingHtml(l, isFeatured) {
    const img = l.image
      ? `<img class="listing-img" src="${esc(l.image)}" alt="">`
      : `<div class="listing-img listing-img-empty">📦</div>`;
    const sold = l.sold ? '<div class="listing-sold">SOLD</div>' : '';
    const featuredBadge = isFeatured ? '<div class="listing-featured-badge">⭐ Featured</div>' : '';

    // Verified seller badge
    const verifiedBadge = l.seller_verified !== false
      ? '<span class="seller-verified" title="Verified student">✓</span>'
      : '';

    const waDigits = (l.seller_whatsapp || '').replace(/\D/g, '');

    // Owner controls (only on own listings)
    let ownerControls = '';
    if (l.mine) {
      if (l.sold) {
        ownerControls = `<button class="listing-sold-btn" data-sold="${l.id}">Mark available</button>`;
      } else {
        ownerControls = `
          <button class="listing-sold-btn" data-sold="${l.id}">Mark sold</button>
          <button class="listing-promote-btn" data-promote="${l.id}">
            ${l.featured ? `⭐ Boosted · ${l.days_remaining}d left` : '🚀 Boost listing'}
          </button>`;
      }
    } else if (!l.sold) {
      ownerControls = `<button class="listing-buy-btn" data-buy="${l.id}">Buy now</button>`;
    }

    // Contact buttons — the heart of FB Marketplace UX
    let contact = '';
    if (l.mine) {
      // Preview for the owner
      contact = `
        <div class="listing-contact-row">
          <button class="listing-contact-btn" disabled title="Buyers tap this to chat">
            💬 Message
          </button>
          ${waDigits
            ? `<a class="listing-contact-btn wa" href="https://wa.me/${esc(waDigits)}"
                  target="_blank" rel="noopener" title="Your WhatsApp — buyers tap this">
                  🟢 WhatsApp
                </a>`
            : `<button class="listing-contact-btn wa-add" data-add-wa="${l.id}"
                       title="Add WhatsApp so buyers can message you directly">
                  🟢 Add WhatsApp
                </button>`}
        </div>
      `;
    } else {
      contact = `
        <div class="listing-contact-row">
          <button class="listing-contact-btn primary" data-message="${l.seller_id}">
            💬 Message
          </button>
          ${waDigits
            ? `<a class="listing-contact-btn wa" href="https://wa.me/${esc(waDigits)}"
                  target="_blank" rel="noopener">
                  🟢 WhatsApp
                </a>`
            : ''}
        </div>
      `;
    }

    return `
      <div class="listing ${l.sold ? 'is-sold' : ''} ${isFeatured ? 'is-featured' : ''}" data-id="${l.id}">
        <div class="listing-img-wrap">
          ${img}
          ${sold}
          ${featuredBadge}
        </div>
        <div class="listing-body">
          <div class="listing-price">₦${Number(l.price).toLocaleString()}</div>
          <div class="listing-title">${esc(l.title)}</div>
          <div class="listing-seller">
            ${esc(l.seller)} ${verifiedBadge} · ${esc(l.time)}
          </div>
          ${ownerControls}
          ${contact}
        </div>
      </div>
    `;
  }

  // ── CLICK HANDLER ──
  document.addEventListener('click', async (e) => {
    const buy = e.target.closest('[data-buy]');
    if (buy) { openBuyModal(parseInt(buy.dataset.buy, 10)); return; }

    const sold = e.target.closest('[data-sold]');
    if (sold) {
      await fetch('/api/listings/' + sold.dataset.sold + '/sold', { method: 'POST' });
      loadListings();
      return;
    }

    const promote = e.target.closest('[data-promote]');
    if (promote) { openPromoteModal(parseInt(promote.dataset.promote, 10)); return; }

    const message = e.target.closest('[data-message]');
    if (message) {
      const sellerId = message.dataset.message;
      await fetch('/api/chat/dm/' + sellerId, { method: 'POST' });
      window.location.href = '/chat?dm=' + sellerId;
      return;
    }

    const addWa = e.target.closest('[data-add-wa]');
    if (addWa) {
      promptAddWhatsapp();
      return;
    }
  });

  function promptAddWhatsapp() {
    const num = prompt(
      'Add your WhatsApp number\n\n' +
      'Buyers will tap a "WhatsApp" button on your listings to chat with you directly.\n' +
      'Include country code, no + or spaces.\n\n' +
      'Example: 2348012345678'
    );
    if (!num || !num.trim()) return;

    fetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ whatsapp_number: num.trim().replace(/\D/g, '') })
    }).then(r => r.json()).then(data => {
      if (data.ok) {
        alert('✓ WhatsApp number saved. Buyers can now message you directly!');
        loadListings();
      } else {
        alert('Could not save — please try again.');
      }
    }).catch(() => alert('Could not save — please try again.'));
  }

  // ── SEARCH ──
  searchInput.addEventListener('input', () => {
    currentSearch = searchInput.value.trim();
    renderListings();
  });

  // ── CATEGORY CHIPS ──
  chipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip || chip.classList.contains('active')) return;
    chipsEl.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentCategory = chip.dataset.cat;
    loadListings();
  });

  // ── BUY MODAL ──
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
    buyProceedBtn.textContent = 'Pay securely →';
  }

  buyClose.addEventListener('click', closeBuyModal);
  buyModal.addEventListener('click', e => { if (e.target === buyModal) closeBuyModal(); });

  buyProceedBtn.addEventListener('click', async () => {
    if (!pendingBuyId) return;
    buyProceedBtn.disabled = true;
    buyProceedBtn.textContent = 'Opening checkout…';
    try {
      const r = await fetch('/api/market/buy/' + pendingBuyId, { method: 'POST' });
      const data = await r.json();
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      } else {
        alert(data.error || 'Could not start payment');
        buyProceedBtn.disabled = false;
        buyProceedBtn.textContent = 'Pay securely →';
      }
    } catch {
      alert('Payment could not start. Try again.');
      buyProceedBtn.disabled = false;
      buyProceedBtn.textContent = 'Pay securely →';
    }
  });

  // ── BOOST MODAL (single-flow) ──
  function openPromoteModal(listingId) {
    pendingPromoteId = listingId;
    currentTier = null;
    promoSelectionStep.classList.remove('hidden');
    promoPaymentStep.classList.add('hidden');
    promoteModal.classList.add('open');
    document.body.style.overflow = 'hidden';

    if (!pricingLoaded) {
      fetch('/api/ads/pricing')
        .then(r => r.json())
        .then(tiers => {
          renderPricingTiers(tiers);
          pricingLoaded = true;
        })
        .catch(() => {
          promoPricing.innerHTML = '<div class="empty">Could not load prices.</div>';
        });
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
      btn.addEventListener('click', () => pickTier(btn));
    });
  }

  async function pickTier(btn) {
    const days = parseInt(btn.dataset.days, 10);
    const price = parseFloat(btn.dataset.price);
    currentTier = { days, price };

    // Immediately fetch OPay details
    promoPricing.querySelectorAll('.promo-tier').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');

    try {
      const r = await fetch('/api/market/promote/' + pendingPromoteId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days })
      });
      const data = await r.json();

      if (data.account_number) {
        // Show payment step immediately
        promoSelectionStep.classList.add('hidden');
        promoPaymentStep.classList.remove('hidden');

        boostSummary.innerHTML = `
          <div class="boost-summary-inner">
            <div class="boost-summary-icon">⭐</div>
            <div class="boost-summary-body">
              <div class="boost-summary-title">Boost for ${days} day${days !== 1 ? 's' : ''}</div>
              <div class="boost-summary-sub">Your listing will appear at the top of the marketplace</div>
            </div>
            <div class="boost-summary-price">₦${price.toLocaleString()}</div>
          </div>
        `;

        transferDetails.innerHTML = `
          <div class="transfer-row">
            <span>Bank</span>
            <strong>${esc(data.bank)}</strong>
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
          <div class="transfer-row">
            <span>Reference</span>
            <strong style="font-family: monospace; font-size: 12px;">${esc(data.reference)}</strong>
          </div>
        `;
      } else {
        alert(data.error || 'Could not generate payment details.');
        btn.classList.remove('selected');
      }
    } catch {
      alert('Something went wrong. Please try again.');
      btn.classList.remove('selected');
    }
  }

  function closePromoteModal() {
    promoteModal.classList.remove('open');
    document.body.style.overflow = '';
    pendingPromoteId = null;
    currentTier = null;
  }

  promoteClose.addEventListener('click', closePromoteModal);
  promoteModal.addEventListener('click', e => {
    if (e.target === promoteModal) closePromoteModal();
  });

  promoBackBtn.addEventListener('click', () => {
    promoPaymentStep.classList.add('hidden');
    promoSelectionStep.classList.remove('hidden');
    promoPricing.querySelectorAll('.promo-tier').forEach(b => b.classList.remove('selected'));
  });

  promoDoneBtn.addEventListener('click', () => {
    closePromoteModal();
    loadListings();
  });

  // ── NEW LISTING ──
  newListingBtn.addEventListener('click', () => {
    listingModal.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Pre-fill WhatsApp if we can (optional — will save on post)
  });

  function closeListingModal() {
    listingModal.classList.remove('open');
    document.body.style.overflow = '';
    listingForm.reset();
    listingPost.disabled = true;
  }

  listingClose.addEventListener('click', closeListingModal);
  listingModal.addEventListener('click', e => { if (e.target === listingModal) closeListingModal(); });

  listingForm.addEventListener('input', () => {
    const data = new FormData(listingForm);
    listingPost.disabled = !data.get('title') || !data.get('price');
  });

  listingPost.addEventListener('click', async () => {
    const fd = new FormData(listingForm);
    if (!fd.get('title') || !fd.get('price')) return;
    listingPost.disabled = true;
    listingPost.textContent = 'Posting…';

    // Save WhatsApp if provided and different
    const wa = (fd.get('whatsapp_number') || '').trim();
    if (wa) {
      fd.delete('whatsapp_number');
      try {
        await fetch('/api/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ whatsapp_number: wa.replace(/\D/g, '') })
        });
      } catch { /* non-blocking */ }
    } else {
      fd.delete('whatsapp_number');
    }

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

  // ── INIT ──
  loadListings();
})();