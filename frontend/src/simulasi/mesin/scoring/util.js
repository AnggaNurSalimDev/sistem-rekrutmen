export function clamp(nilai, min = 0, max = 100) {
  return Math.min(max, Math.max(min, nilai));
}

export function bulatkan(nilai, desimal = 2) {
  const faktor = 10 ** desimal;
  return Math.round((nilai + Number.EPSILON) * faktor) / faktor;
}
