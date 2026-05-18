export const normalizeGstin = (value: string) => value.toUpperCase().replace(/\s/g, '').slice(0, 15);

export const extractPanFromGstin = (gstin: string) => {
  const normalizedGstin = normalizeGstin(gstin);
  return normalizedGstin.length >= 12 ? normalizedGstin.slice(2, 12) : '';
};
