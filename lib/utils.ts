import * as Crypto from 'expo-crypto';

/**
 * Formats a value in paise (integer) into Indian Rupees (INR) format.
 * Accounts for positive and negative values (e.g. negative balance means credit/overpaid).
 */
export function formatCurrency(paise: number): string {
  const isNegative = paise < 0;
  const absRupees = Math.abs(paise) / 100;

  try {
    // Under Hermes, toLocaleString 'en-IN' is generally supported in newer versions,
    // but we add a fallback just in case the JS engine environment lacks full locale support.
    const formatted = absRupees.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${isNegative ? '-' : ''}₹${formatted}`;
  } catch (e) {
    return `${isNegative ? '-' : ''}₹${absRupees.toFixed(2)}`;
  }
}

/**
 * Sanitizes phone number inputs by stripping all non-digit characters.
 */
export function sanitizePhone(phone: string): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

/**
 * Generates a random 15-digit numeric ID as a string, safe for JavaScript's
 * Number.MAX_SAFE_INTEGER and SQLite/D1 INTEGER PRIMARY KEY columns.
 */
export function generateNumericId(): string {
  const bytes = Crypto.getRandomBytes(8);
  let numStr = '';
  for (let i = 0; i < bytes.length; i++) {
    numStr += bytes[i].toString(10);
  }
  
  // Ensure first digit is 1-9 to avoid leading zeros for integer primary keys
  let firstDigit = parseInt(numStr[0], 10);
  if (firstDigit === 0) firstDigit = 1;
  
  return `${firstDigit}${numStr.slice(1, 15)}`.padEnd(15, '0');
}

