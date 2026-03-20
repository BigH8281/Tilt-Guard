export function formatDateTime(value) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatTime(value) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    signDisplay: "always",
    minimumFractionDigits: 2,
  }).format(value);
}

export function isImageFile(filePath) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(filePath);
}
