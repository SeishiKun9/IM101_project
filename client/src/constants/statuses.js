export const statusNames = {
  reported: "Reported (Open)",
  under_review: "Under Review",
  found: "Found",
  claimed: "Claim Approved",
  completed: "Closed & Collected",
  rejected: "Rejected",
};

export const statusMessages = {
  reported: "Report is active on the campus registry.",
  under_review: "Staff is currently comparing and verifying this report.",
  found:
    "Your item has been found! Please submit a claim request to arrange collection at CSA.",
  claimed:
    "Your claim has been approved! Proceed to CSA for ownership verification and collection.",
  completed: "Item has been successfully collected and this case is closed.",
  rejected: "This report was rejected after review.",
};

export const claimStatusNames = {
  pending: "Claim Pending",
  approved: "Claim Approved",
  rejected: "Claim Rejected",
  claimed: "Collected & Completed",
};

export const roleNames = {
  student: "Client",
  staff: "Verifier / CSA",
  admin: "Administrator",
};

export function statusText(status) {
  return statusNames[status] || status;
}

export function statusMessage(status) {
  return statusMessages[status] || "";
}

export function claimStatusText(status) {
  return claimStatusNames[status] || status;
}
