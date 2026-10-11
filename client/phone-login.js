// Identifier-only login without SMS: uses a pseudonymous email internally in
// Firebase Email/Password Auth. It does NOT verify ownership of a phone number.
export function normalizeBrazilPhone(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2);
  if (!/^[1-9][1-9]\d{8,9}$/.test(digits)) {
    throw new Error('Digite um telefone válido com DDD, por exemplo (88) 99999-9999.');
  }
  return digits;
}
export async function phoneLoginAlias(value) {
  const phone = normalizeBrazilPhone(value);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('BR:+55' + phone));
  const hex = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `p${hex}@login.tropidosertao.invalid`;
}
