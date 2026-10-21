// src/lib/orgName.js
// Names that ensure_org_for_user / older flows give a brand-new org. An org
// still carrying one of these is sent to /org-setup.
export const PLACEHOLDER_ORG_NAMES = ["default org", "new company", "organization", "company"];

export function isPlaceholderOrgName(name) {
  const n = String(name || "").trim().toLowerCase();
  return !n || PLACEHOLDER_ORG_NAMES.includes(n);
}
