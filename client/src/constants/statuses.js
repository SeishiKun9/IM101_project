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

export function statusText(status, itemType = "lost") {
  if (itemType === "found") {
    switch (status) {
      case "reported":
        return "Reported";
      case "under_review":
        return "Under Review";
      case "found":
        return "Handed Over to CSA";
      case "claimed":
        return "Handed Over to Owner";
      case "completed":
        return "Complete";
      case "rejected":
        return "Rejected";
      default:
        return statusNames[status] || status;
    }
  }

  return statusNames[status] || status;
}

export function statusMessage(status, itemType = "lost") {
  if (itemType === "found") {
    switch (status) {
      case "reported":
        return "Thank you for reporting! Please bring the item to the CSA office for verification.";
      case "under_review":
        return "Staff is currently verifying this found item submission.";
      case "found":
        return "You handed it over to CSA. Thank you for cooperating!";
      case "claimed":
        return "Claim approved by CSA verifier. Item is scheduled for handover to the owner.";
      case "completed":
        return "Item has been handed over to its owner and this case is complete. Thank you for your cooperation!";
      case "rejected":
        return "This report was rejected after review.";
      default:
        return statusMessages[status] || "";
    }
  }

  return statusMessages[status] || "";
}

export function claimStatusText(status) {
  return claimStatusNames[status] || status;
}

