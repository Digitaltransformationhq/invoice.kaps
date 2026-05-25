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
