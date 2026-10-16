/* ═══════════════════════════════════════════════════════════
   FUNDAR — Auth Pages
   Handles: password visibility toggle
   ═══════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  document.querySelectorAll('.password-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;

      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';

      const eye = btn.querySelector('.icon-eye');
      const eyeOff = btn.querySelector('.icon-eye-off');
      if (eye && eyeOff) {
        eye.classList.toggle('hidden', isPassword);
        eyeOff.classList.toggle('hidden', !isPassword);
      }

      btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    });
  });
})();