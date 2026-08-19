export const normalizeGstin = (value: string) => value.toUpperCase().replace(/\s/g, '').slice(0, 15);

export const extractPanFromGstin = (gstin: string) => {
  const normalizedGstin = normalizeGstin(gstin);
  return normalizedGstin.length >= 12 ? normalizedGstin.slice(2, 12) : '';
};

const GSTIN_STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman and Diu',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
};

export const normalizeIndianState = (value?: string | null) =>
  (value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

export const getGstinStateName = (gstin?: string | null) => {
  const normalizedGstin = normalizeGstin(gstin || '');
  return normalizedGstin.length >= 2 ? GSTIN_STATE_CODES[normalizedGstin.slice(0, 2)] || '' : '';
};

/** The two-digit state code a GSTIN opens with, e.g. "24" for Gujarat. */
export const getGstinStateCode = (gstin?: string | null) => {
  const normalizedGstin = normalizeGstin(gstin || '');
  const prefix = normalizedGstin.slice(0, 2);
  return GSTIN_STATE_CODES[prefix] ? prefix : '';
};

/**
 * Reverse lookup for parties with no GSTIN on file (unregistered buyers), so
 * "State Name : Gujarat, Code : 24" can still print in full. Two codes map to
 * Andhra Pradesh — 37 is the current one, and the table is scanned in order, so
 * the legacy 28 wins. Prefer `getGstinStateCode` whenever a GSTIN exists.
 */
export const getStateCodeByName = (state?: string | null) => {
  const target = normalizeIndianState(state);
  if (!target) return '';
  const match = Object.entries(GSTIN_STATE_CODES).find(
    ([, name]) => normalizeIndianState(name) === target,
  );
  return match ? match[0] : '';
};
