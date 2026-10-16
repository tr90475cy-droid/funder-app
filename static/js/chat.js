(() => {
  'use strict';

  const socket = io();

  // Screens
  const screenRooms = document.getElementById('screenRooms');
  const screenConvo = document.getElementById('screenConvo');

  // Rooms screen
  const roomListEl      = document.getElementById('roomList');
  const searchToggleBtn = document.getElementById('searchToggleBtn');
  const searchBar       = document.getElementById('searchBar');
  const searchInput     = document.getElementById('searchInput');
  const searchCloseBtn  = document.getElementById('searchCloseBtn');
  const searchResults   = document.getElementById('searchResults');
  const startNewBtn     = document.getElementById('startNewBtn');

  // Conversation screen
  const convoBackBtn    = document.getElementById('convoBackBtn');
  const messagesEl      = document.getElementById('chatMessages');
  const inputEl         = document.getElementById('chatInput');
  const sendEl          = document.getElementById('chatSend');
  const titleEl         = document.getElementById('chatTitle');
  const subtitleEl      = document.getElementById('chatSubtitle');
  const peerAvatar      = document.getElementById('chatPeerAvatar');

  // Group modal
  const newGroupBtn     = document.getElementById('newGroupBtn');
  const newGroupModal   = document.getElementById('newGroupModal');
  const newGroupClose   = document.getElementById('newGroupClose');
  const newGroupCreate  = document.getElementById('newGroupCreate');
  const newGroupName    = document.getElementById('newGroupName');
  const groupUserPicker = document.getElementById('groupUserPicker');

  let currentRoom = null;
  let selectedUsers = new Set();

  // ─────────────────────────────────────────
  // SCREEN SWITCHING
  // ─────────────────────────────────────────
  function showRooms() {
    screenConvo.classList.add('hidden');
    screenRooms.classList.remove('hidden');
    if (currentRoom) {
      socket.emit('leave', { room_id: currentRoom });
      currentRoom = null;
    }
    loadRooms();
  }

  function showConvo() {
    screenRooms.classList.add('hidden');
    screenConvo.classList.remove('hidden');
    setTimeout(() => inputEl.focus(), 150);
  }

  convoBackBtn.addEventListener('click', showRooms);

  window.addEventListener('popstate', () => {
    if (!screenConvo.classList.contains('hidden')) {
      showRooms();
    }
  });

  // ─────────────────────────────────────────
  // ROOMS
  // ─────────────────────────────────────────
  async function loadRooms() {
    try {
      const r = await fetch('/api/chat/rooms');
      const rooms = await r.json();

      if (!rooms.length) {
        roomListEl.innerHTML = `
          <div class="chat-empty">
            <div class="chat-empty-emoji">💬</div>
            <div class="chat-empty-title">No conversations yet</div>
            <div class="chat-empty-sub">Tap the 🔍 icon to find someone, or the + button to start a group.</div>
          </div>
        `;
        return;
      }

      roomListEl.innerHTML = rooms.map(roomItem).join('');
    } catch (e) {
      console.error('loadRooms failed:', e);
      roomListEl.innerHTML = '<div class="empty">Could not load chats.</div>';
    }
  }

  function roomItem(r) {
    const avatarHtml = r.is_group
      ? `<div class="room-avatar room-avatar-group">👥</div>`
      : (r.avatar
          ? `<img class="room-avatar" src="${esc(r.avatar)}" alt="">`
          : `<div class="room-avatar room-avatar-blank"></div>`);

    return `
      <button class="room-item" data-id="${r.id}" data-name="${esc(r.name)}" data-group="${r.is_group}">
        ${avatarHtml}
        <div class="room-info">
          <div class="room-name">${esc(r.name)}</div>
          <div class="room-last">${esc(r.last_message) || 'No messages yet'}</div>
        </div>
        <div class="room-time">${esc(r.last_time)}</div>
      </button>
    `;
  }

  roomListEl.addEventListener('click', async (e) => {
    const item = e.target.closest('.room-item');
    if (!item) return;
    const id = parseInt(item.dataset.id, 10);
    const isGroup = item.dataset.group === 'true';
    await openRoom(id, item.dataset.name, isGroup);
  });

  // ─────────────────────────────────────────
  // OPEN A ROOM
  // ─────────────────────────────────────────
  async function openRoom(id, name, isGroup) {
    if (currentRoom && currentRoom !== id) {
      socket.emit('leave', { room_id: currentRoom });
    }
    currentRoom = id;

    titleEl.textContent = name;
    subtitleEl.textContent = isGroup ? 'Group chat' : 'Direct message';

    if (!isGroup) {
      const meta = await getRoomMeta(id);
      if (meta.avatar) {
        peerAvatar.innerHTML = `<img src="${esc(meta.avatar)}" alt="">`;
      } else {
        peerAvatar.innerHTML = `<div class="room-avatar-blank"></div>`;
      }
    } else {
      peerAvatar.innerHTML = `<div class="room-avatar room-avatar-group" style="width:36px;height:36px;font-size:15px;">👥</div>`;
    }

    showConvo();

    messagesEl.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const r = await fetch(`/api/chat/rooms/${id}/messages`);
      const msgs = await r.json();
      renderMessages(msgs);
      socket.emit('join', { room_id: id });
    } catch {
      messagesEl.innerHTML = '<div class="empty">Could not load messages.</div>';
    }
  }

  async function getRoomMeta(id) {
    try {
      const r = await fetch('/api/chat/rooms');
      const rooms = await r.json();
      return rooms.find(x => x.id === id) || { name: 'Chat', avatar: null };
    } catch {
      return { name: 'Chat', avatar: null };
    }
  }

  function renderMessages(msgs) {
    if (!msgs.length) {
      messagesEl.innerHTML = '<div class="empty">No messages yet. Say hi!</div>';
      return;
    }
    messagesEl.innerHTML = msgs.map(messageHtml).join('');
    scrollToBottom();
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function messageHtml(m) {
    const avatarHtml = m.mine
      ? ''
      : (m.avatar
          ? `<img class="msg-avatar" src="${esc(m.avatar)}" alt="">`
          : `<div class="msg-avatar msg-avatar-blank"></div>`);

    return `
      <div class="msg ${m.mine ? 'mine' : ''}">
        ${avatarHtml}
        <div class="msg-bubble">
          ${!m.mine ? `<div class="msg-author">${esc(m.author)}</div>` : ''}
          <div class="msg-content">${esc(m.content)}</div>
          <div class="msg-time">${esc(m.time)}</div>
        </div>
      </div>
    `;
  }

  // ─────────────────────────────────────────
  // SEND MESSAGE
  // ─────────────────────────────────────────
  function send() {
    const content = inputEl.value.trim();
    if (!content || !currentRoom) return;
    socket.emit('message', { room_id: currentRoom, content });
    inputEl.value = '';
    inputEl.focus();
  }

  sendEl.addEventListener('click', send);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  socket.on('message', (m) => {
    if (!currentRoom) return;
    const emptyState = messagesEl.querySelector('.empty');
    if (emptyState) emptyState.remove();
    messagesEl.insertAdjacentHTML('beforeend', messageHtml({ ...m, mine: false }));
    scrollToBottom();
  });

  // ─────────────────────────────────────────
  // SEARCH — by name or email
  // ─────────────────────────────────────────
  console.log('[CHAT] search elements:', {
    btn: !!searchToggleBtn,
    bar: !!searchBar,
    input: !!searchInput,
  });

  searchToggleBtn.addEventListener('click', () => {
    console.log('[CHAT] search clicked');
    searchBar.classList.toggle('hidden');
    if (!searchBar.classList.contains('hidden')) {
      setTimeout(() => searchInput.focus(), 100);
    } else {
      searchResults.classList.add('hidden');
      searchInput.value = '';
    }
  });

  searchCloseBtn.addEventListener('click', () => {
    searchBar.classList.add('hidden');
    searchResults.classList.add('hidden');
    searchInput.value = '';
  });

  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (q.length < 1) {
      searchResults.classList.add('hidden');
      searchResults.innerHTML = '';
      return;
    }
    searchTimer = setTimeout(() => runSearch(q), 200);
  });

  async function runSearch(q) {
    console.log('[CHAT] searching:', q);
    try {
      const r = await fetch('/api/users/search?q=' + encodeURIComponent(q));
      if (!r.ok) {
        searchResults.classList.remove('hidden');
        searchResults.innerHTML = `<div class="search-empty">Error ${r.status}</div>`;
        return;
      }
      const users = await r.json();
      console.log('[CHAT] results:', users);

      searchResults.classList.remove('hidden');

      if (!users.length) {
        searchResults.innerHTML = '<div class="search-empty">No students found.</div>';
        return;
      }

      searchResults.innerHTML = users.map(u => {
        const avatarHtml = u.avatar
          ? `<img class="search-avatar" src="${esc(u.avatar)}" alt="">`
          : `<div class="search-avatar search-avatar-blank"></div>`;
        const isExisting = u.existing_room_id ? 'Open' : 'Message';
        return `
          <button class="search-item" data-uid="${u.id}" data-rid="${u.existing_room_id || ''}" data-name="${esc(u.name)}">
            ${avatarHtml}
            <div class="search-body">
              <div class="search-name">${esc(u.name)}</div>
              <div class="search-meta">${esc(u.email)}</div>
            </div>
            <span class="search-action">${isExisting}</span>
          </button>
        `;
      }).join('');
    } catch (err) {
      console.error('[CHAT] search error:', err);
      searchResults.classList.remove('hidden');
      searchResults.innerHTML = '<div class="search-empty">Could not reach server.</div>';
    }
  }

  searchResults.addEventListener('click', async (e) => {
    const item = e.target.closest('.search-item');
    if (!item) return;

    const uid = parseInt(item.dataset.uid, 10);
    const rid = item.dataset.rid ? parseInt(item.dataset.rid, 10) : null;
    const name = item.dataset.name;

    let roomId = rid;

    if (!roomId) {
      const r = await fetch(`/api/chat/dm/${uid}`, { method: 'POST' });
      const data = await r.json();
      if (data.error) return alert(data.error);
      roomId = data.id;
    }

    searchBar.classList.add('hidden');
    searchResults.classList.add('hidden');
    searchInput.value = '';

    await openRoom(roomId, name, false);
  });

  // ─────────────────────────────────────────
  // NEW GROUP MODAL
  // ─────────────────────────────────────────
  async function loadUsersForPicker() {
    try {
      const r = await fetch('/api/users');
      const users = await r.json();
      if (!users.length) {
        groupUserPicker.innerHTML = '<div class="empty">No verified users yet.</div>';
        return;
      }
      groupUserPicker.innerHTML = users.map(u => `
        <label class="user-pick-item">
          <input type="checkbox" value="${u.id}">
          ${u.avatar
            ? `<img src="${esc(u.avatar)}" alt="">`
            : `<div class="user-pick-avatar-blank"></div>`}
          <span>${esc(u.name)}</span>
        </label>
      `).join('');
    } catch {
      groupUserPicker.innerHTML = '<div class="empty">Could not load users.</div>';
    }
  }

  function openNewGroup() {
    selectedUsers.clear();
    newGroupName.value = '';
    loadUsersForPicker();
    newGroupModal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeNewGroup() {
    newGroupModal.classList.remove('open');
    document.body.style.overflow = '';
  }

  if (newGroupBtn) newGroupBtn.addEventListener('click', openNewGroup);
  if (startNewBtn) startNewBtn.addEventListener('click', openNewGroup);
  if (newGroupClose) newGroupClose.addEventListener('click', closeNewGroup);
  if (newGroupModal) newGroupModal.addEventListener('click', (e) => {
    if (e.target === newGroupModal) closeNewGroup();
  });

  if (groupUserPicker) groupUserPicker.addEventListener('change', (e) => {
    const id = parseInt(e.target.value, 10);
    if (e.target.checked) selectedUsers.add(id);
    else selectedUsers.delete(id);
  });

  if (newGroupCreate) newGroupCreate.addEventListener('click', async () => {
    const name = newGroupName.value.trim();
    if (!name) return alert('Enter a group name');
    if (selectedUsers.size < 2) return alert('Pick at least 2 members');

    const r = await fetch('/api/chat/group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, member_ids: Array.from(selectedUsers) })
    });
    const data = await r.json();
    if (data.error) return alert(data.error);

    closeNewGroup();
    openRoom(data.id, data.name, true);
  });

  // ─────────────────────────────────────────
  // AUTO-OPEN DM (from ?dm=<uid>)
  // ─────────────────────────────────────────
  async function checkDmQuery() {
    const params = new URLSearchParams(window.location.search);
    const uid = parseInt(params.get('dm') || '0', 10);
    if (!uid) return;

    try {
      const r = await fetch(`/api/chat/dm/${uid}`, { method: 'POST' });
      if (!r.ok) return;
      const data = await r.json();
      if (data.error) return;
      await openRoom(data.id, data.name, false);
    } catch (e) {
      console.error('DM auto-open failed:', e);
    }
  }

  // ─────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────
  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  // ─────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────
  loadRooms().then(() => checkDmQuery());

})();