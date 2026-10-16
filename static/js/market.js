(() => {
  'use strict';
  const gridEl   = document.getElementById('marketGrid');
  const chipsEl  = document.getElementById('marketChips');
  const modalEl  = document.getElementById('listingModal');
  const closeEl  = document.getElementById('listingClose');
  const postEl   = document.getElementById('listingPost');
  const formEl   = document.getElementById('listingForm');
  const newBtn   = document.getElementById('newListingBtn');

  let category = 'all';

  async function load() {
    gridEl.innerHTML = '<div class="empty">Loading…</div>';
    const r = await fetch(`/api/listings?category=${category}`);
    const items = await r.json();
    if (!items.length) {
      gridEl.innerHTML = '<div class="empty">No listings in this category yet.</div>';
      return;
    }
    gridEl.innerHTML = items.map(listingHtml).join('');
  }

  function listingHtml(l) {
    const img = l.image
      ? `<img class="listing-img" src="${esc(l.image)}" alt="">`
      : `<div class="listing-img listing-img-empty">📦</div>`;
    const sold = l.sold ? '<div class="listing-sold">SOLD</div>' : '';
    const own = l.mine ? `<button class="listing-sold-btn" data-id="${l.id}">${l.sold ? 'Mark available' : 'Mark sold'}</button>` : '';
    return `
      <div class="listing ${l.sold ? 'is-sold' : ''}">
        <div class="listing-img-wrap">${img}${sold}</div>
        <div class="listing-body">
          <div class="listing-title">${esc(l.title)}</div>
          <div class="listing-price">₦${l.price.toLocaleString()}</div>
          <div class="listing-meta">${esc(l.seller)} · ${esc(l.time)}</div>
          ${own}
        </div>
      </div>
    `;
  }

  gridEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('.listing-sold-btn');
    if (!btn) return;
    await fetch(`/api/listings/${btn.dataset.id}/sold`, { method: 'POST' });
    load();
  });

  chipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    chipsEl.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    category = chip.dataset.cat;
    load();
  });

  newBtn.addEventListener('click', () => {
    modalEl.classList.add('open');
    document.body.style.overflow = 'hidden';
  });
  function close() {
    modalEl.classList.remove('open');
    document.body.style.overflow = '';
    formEl.reset();
  }
  closeEl.addEventListener('click', close);
  modalEl.addEventListener('click', (e) => { if (e.target === modalEl) close(); });

  postEl.addEventListener('click', async () => {
    const fd = new FormData(formEl);
    if (!fd.get('title') || !fd.get('price')) return;
    postEl.disabled = true;
    try {
      const r = await fetch('/api/listings', { method: 'POST', body: fd });
      if (r.ok) { close(); load(); }
    } finally { postEl.disabled = false; }
  });

  function esc(s) { return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  load();
})();