function normalizePhone(input) {
  if (!input) return null;
  // Strip spreadsheet float suffix (.0, .00, etc.) before removing non-digits
  const clean = String(input).replace(/\.0+$/, '');
  const digits = clean.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  if (digits.length > 11) return `+${digits}`; // international (e.g. UK +44...)
  return null;
}

module.exports = { normalizePhone };
