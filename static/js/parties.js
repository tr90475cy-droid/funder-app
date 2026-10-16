(() => {
  'use strict';
  const listEl  = document.getElementById('eventsList');
  const modalEl = document.getElementById('eventModal');
  const closeEl = document.getElementById('eventClose');
  const postEl  = document.getElementById('eventPost');
  const formEl  = document.getElementById('eventForm');
  const newBtn  = document.getElementById('newEventBtn');

  async function load() {
    listEl.innerHTML = '<div class="empty">Loading…</div>';
    const r = await fetch('/api/events');
    const items = await r.json();
    if (!items.length) {
      listEl.innerHTML = '<div class="empty">No events yet. Host the first one!</div>';
      return;
    }
    listEl.innerHTML = items.map(eventHtml).join('');
  }

  function eventHtml(e) {
    const img = e.image
      ? `<img class="event-img" src="${esc(e.image)}" alt="">`
      : `<div class="event-img event-img-empty">🎉</div>`;
    return `
      <div class="event-card" data-id="${e.id}">
        ${img}
        <div class="event-body">
          <div class="event-title">${esc(e.title)}</div>
          <div class="event-meta">
            <div>🕒 ${esc(e.starts_label)}</div>
            ${e.venue ? `<div>📍 ${esc(e.venue)}</div>` : ''}
            <div>👤 Hosted by ${esc(e.host)}</div>
          </div>
          ${e.description ? `<div class="event-desc">${esc(e.description)}</div>` : ''}
          <div class="event-actions">
            <button class="btn ${e.going ? 'btn-success' : 'btn-primary'} btn-sm" data-rsvp>
              ${e.going ? '✓ Going' : 'RSVP'}
            </button>
            <span class="event-count">${e.rsvp_count} going</span>
          </div>
        </div>
      </div>
    `;
  }

  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-rsvp]');
    if (!btn) return;
    const card = btn.closest('.event-card');
    await fetch(`/api/events/${card.dataset.id}/rsvp`, { method: 'POST' });
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
    if (!fd.get('title') || !fd.get('starts_at')) return alert('Fill title and date');
    postEl.disabled = true;
    try {
      const r = await fetch('/api/events', { method: 'POST', body: fd });
      if (r.ok) { close(); load(); }
    } finally { postEl.disabled = false; }
  });

  function esc(s) { return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  load();
})();