(() => {
  'use strict';

  console.log('[CONNECT] script loaded');

  const tabsEl          = document.getElementById('connectTabs');
  const reqCountBadge   = document.getElementById('reqCountBadge');

  const discoverList    = document.getElementById('discoverList');
  const incomingList    = document.getElementById('incomingList');
  const outgoingList    = document.getElementById('outgoingList');
  const connectionsList = document.getElementById('connectionsList');

  const panels = {
    discover:    document.getElementById('panelDiscover'),
    requests:    document.getElementById('panelRequests'),
    connections: document.getElementById('panelConnections'),
  };

  console.log('[CONNECT] elements:', {
    tabs: !!tabsEl,
    discover: !!panels.discover,
    requests: !!panels.requests,
    connections: !!panels.connections,
  });

  // ═══════════════════════════════════════
  // LOADERS
  // ═══════════════════════════════════════
  async function loadDiscover() {
    if (!discoverList) return;
    discoverList.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const r = await fetch('/api/connect/suggestions');
      const items = await r.json();
      if (!items.length) {
        discoverList.innerHTML = '<div class="empty">No suggestions yet. Check back when more students join.</div>';
        return;
      }
      discoverList.innerHTML = items.map(u => cardHtml(u, 'discover')).join('');
    } catch (e) {
      console.error('[CONNECT] discover error:', e);
      discoverList.innerHTML = '<div class="empty">Could not load suggestions.</div>';
    }
  }

  async function loadRequests() {
    if (!incomingList || !outgoingList) return;
    incomingList.innerHTML = '<div class="empty">Loading…</div>';
    outgoingList.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const r = await fetch('/api/connect/requests');
      const data = await r.json();
      console.log('[CONNECT] requests:', data);

      if (reqCountBadge) {
        if (data.incoming && data.incoming.length) {
          reqCountBadge.textContent = data.incoming.length;
          reqCountBadge.classList.remove('hidden');
        } else {
          reqCountBadge.classList.add('hidden');
        }
      }

      incomingList.innerHTML = (data.incoming && data.incoming.length)
        ? data.incoming.map(u => cardHtml(u, 'incoming')).join('')
        : '<div class="empty">No incoming requests.</div>';

      outgoingList.innerHTML = (data.outgoing && data.outgoing.length)
        ? data.outgoing.map(u => cardHtml(u, 'outgoing')).join('')
        : '<div class="empty">You haven\'t sent any requests.</div>';
    } catch (e) {
      console.error('[CONNECT] requests error:', e);
      incomingList.innerHTML = '<div class="empty">Could not load requests.</div>';
      outgoingList.innerHTML = '';
    }
  }

  async function loadConnections() {
    if (!connectionsList) return;
    connectionsList.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const r = await fetch('/api/connect/mine');
      const items = await r.json();
      console.log('[CONNECT] connections:', items);
      if (!items.length) {
        connectionsList.innerHTML = '<div class="empty">You haven\'t connected with anyone yet.<br>Go to Discover to find people.</div>';
        return;
      }
      connectionsList.innerHTML = items.map(u => cardHtml(u, 'connected')).join('');
    } catch (e) {
      console.error('[CONNECT] connections error:', e);
      connectionsList.innerHTML = '<div class="empty">Could not load connections.</div>';
    }
  }

  // ═══════════════════════════════════════
  // CARD
  // ═══════════════════════════════════════
  function cardHtml(u, mode) {
    const avatarHtml = u.avatar
      ? `<img class="connect-avatar" src="${esc(u.avatar)}" alt="">`
      : `<div class="connect-avatar connect-avatar-blank"></div>`;

    const meta = [u.level ? u.level + 'L' : '', u.department].filter(Boolean).join(' · ');

    let action = '';
    if (mode === 'discover') {
      action = `<button class="btn btn-primary btn-sm" data-action="connect" data-uid="${u.id}">Add Up</button>`;
    } else if (mode === 'incoming') {
      action = `
        <div class="connect-actions">
          <button class="btn btn-success btn-sm" data-action="accept" data-cid="${u.connection_id}">Accept</button>
          <button class="btn btn-ghost btn-sm" data-action="decline" data-cid="${u.connection_id}">Decline</button>
        </div>`;
    } else if (mode === 'outgoing') {
      action = `<span class="tag tag-pending">Requested</span>`;
    } else if (mode === 'connected') {
      action = `<button class="btn btn-ghost btn-sm" data-action="message" data-uid="${u.id}">Message</button>`;
    }

    return `
      <div class="connect-card">
        ${avatarHtml}
        <div class="connect-body">
          <div class="connect-name">${esc(u.name)}</div>
          ${meta ? `<div class="connect-meta">${esc(meta)}</div>` : ''}
          ${u.bio ? `<div class="connect-bio">${esc(u.bio)}</div>` : ''}
        </div>
        <div class="connect-action">${action}</div>
      </div>
    `;
  }

  // ═══════════════════════════════════════
  // ACTION HANDLER
  // ═══════════════════════════════════════
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    console.log('[CONNECT] action:', action);

    if (action === 'connect') {
      btn.disabled = true;
      btn.textContent = 'Sending…';
      try {
        await fetch('/api/connect/send/' + btn.dataset.uid, { method: 'POST' });
        btn.textContent = 'Requested';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-ghost');
      } catch {
        btn.textContent = 'Try again';
        btn.disabled = false;
      }
      return;
    }

    if (action === 'accept') {
      btn.disabled = true;
      await fetch('/api/connect/accept/' + btn.dataset.cid, { method: 'POST' });
      await loadRequests();
      await loadConnections();
      return;
    }

    if (action === 'decline') {
      btn.disabled = true;
      await fetch('/api/connect/decline/' + btn.dataset.cid, { method: 'POST' });
      await loadRequests();
      return;
    }

    if (action === 'message') {
      window.location.href = '/chat?dm=' + btn.dataset.uid;
      return;
    }
  });

  // ═══════════════════════════════════════
  // TABS
  // ═══════════════════════════════════════
  if (tabsEl) {
    tabsEl.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;

      console.log('[CONNECT] tab clicked:', chip.dataset.tab);

      tabsEl.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      const tab = chip.dataset.tab;
      Object.entries(panels).forEach(([key, el]) => {
        if (!el) return;
        el.classList.toggle('hidden', key !== tab);
      });

      if (tab === 'discover') loadDiscover();
      else if (tab === 'requests') loadRequests();
      else if (tab === 'connections') loadConnections();
    });
  } else {
    console.error('[CONNECT] tabsEl not found!');
  }

  // ═══════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  // ═══════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════
  loadDiscover();

  // Pre-fetch count
  fetch('/api/connect/requests').then(r => r.json()).then(data => {
    if (reqCountBadge && data.incoming && data.incoming.length) {
      reqCountBadge.textContent = data.incoming.length;
      reqCountBadge.classList.remove('hidden');
    }
  }).catch(() => {});

})();