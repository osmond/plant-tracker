export function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  toast.setAttribute('aria-hidden', 'false');
  clearTimeout(toast.hideTimeout);
  toast.hideTimeout = setTimeout(() => {
    toast.classList.remove('show');
    toast.setAttribute('aria-hidden', 'true');
  }, 3000);
}

export function toggleLoading(show) {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  overlay.classList.toggle('hidden', !show);
}
