export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidPlate(plate: string): boolean {
  return /^[A-Z0-9]{2,10}$/.test(plate);
}
