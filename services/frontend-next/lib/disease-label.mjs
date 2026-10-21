/** "ISPA)" is a cut "(ISPA)". A balanced name such as "(Bird Flu)" stays. */
export function tidyDiseaseLabel(name) {
  const text = String(name || '').trim()
  const open = (text.match(/\(/g) || []).length
  const close = (text.match(/\)/g) || []).length
  if (close > open) return text.replace(/\)+$/, '').trim()
  return text
}
