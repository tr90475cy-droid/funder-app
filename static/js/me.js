(() => {
  'use strict';

  // Element refs
  const postsEl         = document.getElementById('myPosts');
  const followersList   = document.getElementById('followersList');
  const followingList   = document.getElementById('followingList');
  const followersCount  = document.getElementById('followersCount');
  const followingCount  = document.getElementById('followingCount');

  const tabsEl          = document.getElementById('profileTabs');
  const panels = {
    posts:     document.getElementById('panelPosts'),
    followers: document.getElementById('panelFollowers'),
    following: document.getElementById('panelFollowing'),
  };

  // Edit modal
  const editBtn   = document.getElementById('editProfileBtn');
  const editModal = document.getElementById('editProfileModal');
  const editClose = document.getElementById('editProfileClose');
  const editSave  = document.getElementById('editProfileSave');
  const editName  = document.getElementById('editName');
  const editBio   = document.getElementById('editBio');
  const bioEl     = document.getElementById('profileBio');

  // Avatar
  const avatarFile   = document.getElementById('avatarFile');
  const avatarRemove = document.getElementById('avatarRemove');

  // ─────────────────────────────────────────
  // MY POSTS
  // ─────────────────────────────────────────
  async function loadPosts() {
    postsEl.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const r = await fetch('/api/me/posts');
      const posts = await r.json();
      if (!posts.length) {
        postsEl.innerHTML = '<div class="empty">You haven\'t posted yet.</div>';
        return;
      }
      postsEl.innerHTML = posts.map(postHtml).join('');
    } catch {
      postsEl.innerHTML = '<div class="empty">Could not load posts.</div>';
    }
  }

  function postHtml(p) {
    const avatar = p.anonymous
      ? `<div class="avatar avatar-anon">🥷</div>`
      : (p.avatar
          ? `<img class="avatar" src="${esc(p.avatar)}" alt="">`
          : `<div class="avatar avatar-blank"></div>`);

    return `
      <article class="post ${p.anonymous ? 'anon' : ''}">
        <div class="post-head">
          ${avatar}
          <div class="post-meta">
            <div class="post-name-row">
              <span class="post-name">${esc(p.author)}</span>
              ${p.anonymous ? '<span class="badge-anon">ANON</span>' : (p.verified ? '<span class="verified">✓</span>' : '')}
            </div>
            <div class="post-time">${esc(p.time)} ago</div>
          </div>
        </div>
        <p class="post-body">${esc(p.content)}</p>
        ${p.image ? `<img class="post-img" src="${esc(p.image)}" alt="">` : ''}
        <div class="post-actions">
          <div class="act">❤️ <span>${p.likes}</span></div>
          <div class="act">💬 <span>${p.comments}</span></div>
        </div>
      </article>
    `;
  }

  // ─────────────────────────────────────────
  // FOLLOWERS / FOLLOWING
  // ─────────────────────────────────────────
  async function loadFollowers() {
    followersList.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const r = await fetch('/api/me/followers');
      const users = await r.json();
      followersCount.textContent = users.length;
      followersList.innerHTML = users.length
        ? users.map(u => userCard(u, 'follower')).join('')
        : '<div class="empty">No followers yet. Post often to get noticed!</div>';
    } catch {
      followersList.innerHTML = '<div class="empty">Could not load followers.</div>';
    }
  }

  async function loadFollowing() {
    followingList.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const r = await fetch('/api/me/following');
      const users = await r.json();
      followingCount.textContent = users.length;
      followingList.innerHTML = users.length
        ? users.map(u => userCard(u, 'following')).join('')
        : '<div class="empty">You aren\'t following anyone yet. Tap "Find friends".</div>';
    } catch {
      followingList.innerHTML = '<div class="empty">Could not load following.</div>';
    }
  }

  function userCard(u, mode) {
    const avatarHtml = u.avatar
      ? `<img class="connect-avatar" src="${esc(u.avatar)}" alt="">`
      : `<div class="connect-avatar connect-avatar-blank"></div>`;

    const meta = [u.level ? u.level + 'L' : '', u.department].filter(Boolean).join(' · ');
    const action = `<button class="btn btn-ghost btn-sm" data-action="message" data-uid="${u.id}">Message</button>`;

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

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="message"]');
    if (!btn) return;
    const uid = btn.dataset.uid;
    await fetch('/api/chat/dm/' + uid, { method: 'POST' });
    window.location.href = '/chat?dm=' + uid;
  });

  // Preload counts on page load
  loadFollowers();
  loadFollowing();

  // ─────────────────────────────────────────
  // TABS
  // ─────────────────────────────────────────
  tabsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    tabsEl.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');

    const tab = chip.dataset.tab;
    Object.entries(panels).forEach(([k, el]) => {
      el.classList.toggle('hidden', k !== tab);
    });

    if (tab === 'posts') loadPosts();
    else if (tab === 'followers') loadFollowers();
    else if (tab === 'following') loadFollowing();
  });

  // ─────────────────────────────────────────
  // EDIT PROFILE
  // ─────────────────────────────────────────
  editBtn.addEventListener('click', () => {
    editModal.classList.add('open');
    document.body.style.overflow = 'hidden';
  });
  function closeEdit() {
    editModal.classList.remove('open');
    document.body.style.overflow = '';
  }
  editClose.addEventListener('click', closeEdit);
  editModal.addEventListener('click', (e) => { if (e.target === editModal) closeEdit(); });

  editSave.addEventListener('click', async () => {
    editSave.disabled = true;
    try {
      const r = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: editName.value, bio: editBio.value })
      });
      const data = await r.json();
      if (data.ok) {
        bioEl.textContent = data.bio || 'No bio yet.';
        closeEdit();
      }
    } finally { editSave.disabled = false; }
  });

  // ─────────────────────────────────────────
  // AVATAR UPLOAD
  // ─────────────────────────────────────────
  if (avatarFile) {
    avatarFile.addEventListener('change', async () => {
      const file = avatarFile.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        alert('Please choose an image file.');
        return;
      }

      const fd = new FormData();
      fd.append('picture', file);

      try {
        const r = await fetch('/api/me/picture', { method: 'POST', body: fd });
        if (r.ok) {
          window.location.reload();
        } else {
          const err = await r.json().catch(() => ({}));
          alert(err.error || 'Could not upload picture.');
        }
      } catch {
        alert('Upload failed. Please try again.');
      }
    });
  }

  if (avatarRemove) {
    avatarRemove.addEventListener('click', async () => {
      if (!confirm('Remove your profile picture?')) return;
      const r = await fetch('/api/me/picture', { method: 'DELETE' });
      if (r.ok) window.location.reload();
    });
  }

  // ─────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  // Initial load
  loadPosts();
})();