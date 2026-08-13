export function formatCurrency(amount) {
  return Number(amount).toLocaleString('ru-RU') + ' ₽';
}

export function getDateTime() {
  const d = new Date();
  return `${d.toLocaleDateString()}, ${d.toLocaleTimeString()}`;
}

export function showAlert(message, type = 'success') {
  const alertClass = type === 'success' ? 'alert-success' : 'alert-error';
  const html = `<div class="alert ${alertClass}" style="display:block">${message}</div>`;
  const container = document.getElementById('alertsContainer');
  if (container) {
    container.innerHTML = html;
    setTimeout(() => container.innerHTML = '', 5000);
  } else {
    alert(message);
  }
}
