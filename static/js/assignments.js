(() => {
  'use strict';

  const listEl     = document.getElementById('assignList');
  const modalEl    = document.getElementById('assignModal');
  const closeEl    = document.getElementById('assignClose');
  const postEl     = document.getElementById('assignPost');
  const formEl     = document.getElementById('assignForm');
  const newBtn     = document.getElementById('newAssignBtn');

  const fileInput  = document.getElementById('assignFile');
  const previewBox = document.getElementById('assignPreview');
  const previewImg = document.getElementById('assignPreviewImg');
  const previewX   = document.getElementById('assignPreviewRemove');
  const fileNameEl = document.getElementById('assignFileName');

  // ═══════════════════════════════════════
  // LOAD & RENDER
  // ═══════════════════════════════════════
  async function load() {
    listEl.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const r = await fetch('/api/assignments');
      const items = await r.json();
      if (!items.length) {
        listEl.innerHTML = '<div class="empty">No assignments yet. Tap + Add to start.</div>';
        return;
      }
      listEl.innerHTML = items.map(itemHtml).join('');
    } catch {
      listEl.innerHTML = '<div class="empty">Could not load assignments.</div>';
    }
  }

  function itemHtml(a) {
    let attachmentHtml = '';

    if (a.attachment_url) {
      if (a.has_image) {
        // Image thumbnail
        attachmentHtml = `
          <a class="assign-attach assign-attach-image" href="${esc(a.attachment_url)}" target="_blank" rel="noopener">
            <img src="${esc(a.attachment_url)}" alt="">
          </a>`;
      } else {
        // PDF / doc link
        const ext = (a.attachment_name || '').split('.').pop().toUpperCase();
        attachmentHtml = `
          <a class="assign-attach assign-attach-file" href="${esc(a.attachment_url)}" target="_blank" rel="noopener">
            <span class="assign-attach-icon">${fileIcon(ext)}</span>
            <span class="assign-attach-name">${esc(a.attachment_name || 'Attachment')}</span>
          </a>`;
      }
    }

    return `
      <div class="assign-item urgency-${a.urgency} ${a.completed ? 'done' : ''}" data-id="${a.id}">
        <div class="assign-check">
          <input type="checkbox" ${a.completed ? 'checked' : ''} data-toggle>
        </div>
        <div class="assign-body">
          <div class="assign-course">${esc(a.course_code)}${a.course_title ? ' · ' + esc(a.course_title) : ''}</div>
          <div class="assign-title">${esc(a.title)}</div>
          ${a.description ? `<div class="assign-desc">${esc(a.description)}</div>` : ''}
          ${attachmentHtml}
          <div class="assign-due">⏰ ${esc(a.due_label)}</div>
        </div>
        <button class="assign-del" data-del aria-label="Delete">✕</button>
      </div>
    `;
  }

  function fileIcon(ext) {
    if (ext === 'PDF') return '📄';
    if (ext === 'DOC' || ext === 'DOCX') return '📝';
    if (ext === 'PPT' || ext === 'PPTX') return '📊';
    if (ext === 'TXT') return '🗒️';
    return '📎';
  }

  // ═══════════════════════════════════════
  // ROW ACTIONS
  // ═══════════════════════════════════════
  listEl.addEventListener('click', async (e) => {
    const item = e.target.closest('.assign-item');
    if (!item) return;
    const id = item.dataset.id;

    if (e.target.closest('[data-toggle]')) {
      await fetch(`/api/assignments/${id}/toggle`, { method: 'POST' });
      load();
    } else if (e.target.closest('[data-del]')) {
      if (!confirm('Delete this assignment?')) return;
      await fetch(`/api/assignments/${id}`, { method: 'DELETE' });
      load();
    }
  });

  // ═══════════════════════════════════════
  // MODAL — OPEN / CLOSE
  // ═══════════════════════════════════════
  function openModal() {
    formEl.reset();
    resetPreview();
    modalEl.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modalEl.classList.remove('open');
    document.body.style.overflow = '';
    formEl.reset();
    resetPreview();
  }

  newBtn.addEventListener('click', openModal);
  closeEl.addEventListener('click', closeModal);
  modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalEl.classList.contains('open')) closeModal();
  });

  // ═══════════════════════════════════════
  // FILE PREVIEW
  // ═══════════════════════════════════════
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) { resetPreview(); return; }

    const isImage = file.type.startsWith('image/');

    if (isImage) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        previewImg.src = ev.target.result;
        previewBox.classList.remove('hidden');
        fileNameEl.classList.add('hidden');
      };
      reader.readAsDataURL(file);
    } else {
      previewBox.classList.add('hidden');
      previewImg.src = '';
      fileNameEl.textContent = `📎 ${file.name}`;
      fileNameEl.classList.remove('hidden');
    }
  });

  previewX.addEventListener('click', () => {
    fileInput.value = '';
    resetPreview();
  });

  function resetPreview() {
    previewBox.classList.add('hidden');
    previewImg.src = '';
    fileNameEl.classList.add('hidden');
    fileNameEl.textContent = '';
  }

  // ═══════════════════════════════════════
  // SAVE
  // ═══════════════════════════════════════
  postEl.addEventListener('click', async () => {
    const data = new FormData(formEl);
    if (!data.get('title') || !data.get('course_code') || !data.get('due_date')) {
      alert('Fill course code, title and due date');
      return;
    }
    postEl.disabled = true;
    postEl.textContent = 'Saving…';

    try {
      const r = await fetch('/api/assignments', { method: 'POST', body: data });
      if (r.ok) {
        closeModal();
        load();
      } else {
        const err = await r.json().catch(() => ({}));
        alert(err.error || 'Could not save assignment');
      }
    } catch {
      alert('Could not save. Please try again.');
    } finally {
      postEl.disabled = false;
      postEl.textContent = 'Save';
    }
  });

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  load();
})();