export const statusNames = {
  reported: "Lost",
  under_review: "Under Review",
  found:
    "Your item has been found. Please submit a claim request to arrange collection at CSA.",
  claimed: "Your item has been claimed. This case is completed and closed.",
  completed: "Your item has been claimed. This case is completed and closed.",
  rejected: "Rejected",
};

export const claimStatusNames = {
  pending: "Claim Pending",
  approved:
    "Your claim has been approved. Please proceed to CSA for ownership verification and item collection.",
  rejected: "Claim Rejected",
  claimed: "Claimed",
};

export const roleNames = {
  student: "Client",
  staff: "Verifier / CSA",
  admin: "Administrator",
};

export function statusText(status) {
  return statusNames[status] || status;
}

export function claimStatusText(status) {
  return claimStatusNames[status] || status;
}
