export function getFamilyId() {
  return localStorage.getItem('artha_family_id')
    ?? (import.meta.env.DEV ? import.meta.env.VITE_DEV_FAMILY_ID : null)
}

export function setFamilyId(id) {
  localStorage.setItem('artha_family_id', id)
}
