import nodemailer from "nodemailer";

// Retrieve email configuration from environment variables
const smtpHost = process.env.SMTP_HOST || "";
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER || "";
const smtpPass = process.env.SMTP_PASS || "";
const smtpSecure = process.env.SMTP_SECURE === "true" || smtpPort === 465;
const defaultFrom =
  process.env.SMTP_FROM ||
  '"Campus Lost & Found" <no-reply@campuslostandfound.edu>';

let transporter = null;

if (smtpHost && smtpUser && smtpPass) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === "production",
    },
  });
  console.log(`[Email] Mailer initialized with SMTP host: ${smtpHost}:${smtpPort}`);
} else {
  console.log(
    "[Email] SMTP credentials not set. Email delivery will run in mock/console mode.",
  );
}

/**
 * Returns the public application base URL for deep links.
 */
function getAppUrl(customUrl) {
  if (customUrl) return customUrl.replace(/\/+$/, "");
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  if (process.env.RENDER_EXTERNAL_URL)
    return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, "");
  return "http://localhost:3000";
}

/**
 * Core send mail dispatcher with graceful fallback.
 */
async function sendMail({ to, subject, html, text }) {
  if (!to) {
    console.warn("[Email] Cannot send email: recipient address is empty.");
    return { success: false, error: "No recipient address provided" };
  }

  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: defaultFrom,
        to,
        subject,
        html,
        text,
      });
      console.log(`[Email] Message sent to ${to}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error(`[Email] Failed sending mail to ${to}:`, err.message);
      // Fallback: log to console so production admins can still retrieve reset tokens or notices
      console.log(`[Email Fallback - Failed SMTP Delivery to ${to}]:\nSubject: ${subject}\nText:\n${text}`);
      return { success: false, error: err.message };
    }
  }

  // Development & Unconfigured Fallback
  console.log("\n=======================================================");
  console.log(`[EMAIL DISPATCH - CONSOLE FALLBACK]`);
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log("-------------------------------------------------------");
  console.log(text);
  console.log("=======================================================\n");
  return { success: true, simulated: true };
}

/**
 * Generates standard campus branded email HTML wrapper.
 */
function wrapHtmlEmail({ title, preheader, bodyContent, ctaText, ctaLink, footerNote }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f6f8f5; margin: 0; padding: 24px; color: #17251c; }
    .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e1e7e0; overflow: hidden; box-shadow: 0 4px 14px rgba(23, 37, 28, 0.06); }
    .header { background: linear-gradient(135deg, #166534 0%, #15803d 100%); padding: 28px 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.9; }
    .content { padding: 32px 28px; line-height: 1.6; font-size: 15px; color: #374151; }
    .token-box { background: #fbfdfb; border: 2px dashed #166534; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center; }
    .token-value { font-family: 'Courier New', Courier, monospace; font-size: 22px; font-weight: 700; color: #166534; letter-spacing: 2px; word-break: break-all; }
    .btn { display: inline-block; background-color: #166534; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px; margin: 18px 0; text-align: center; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .badge-approved { background: #ecfdf5; color: #15803d; border: 1px solid #a7f3d0; }
    .badge-rejected { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
    .badge-match { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
    .footer { padding: 20px 28px; background: #f9fafb; border-top: 1px solid #edf1ec; text-align: center; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Campus Lost & Found</h1>
      <p>Automated Campus Assistance & Recovery System</p>
    </div>
    <div class="content">
      ${bodyContent}
      ${
        ctaText && ctaLink
          ? `<div style="text-align: center; margin: 24px 0;"><a href="${ctaLink}" class="btn" target="_blank">${ctaText}</a></div>`
          : ""
      }
      ${footerNote ? `<p style="font-size: 13px; color: #6b7280; margin-top: 24px;">${footerNote}</p>` : ""}
    </div>
    <div class="footer">
      <p>This automated message was sent by the Campus Lost & Found System. If you did not initiate this request, please contact the Campus Safety & Security Office.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Sends a password reset email containing the security token and direct reset link.
 */
export async function sendPasswordResetEmail({ to, name = "Campus User", resetToken, appUrl }) {
  const base = getAppUrl(appUrl);
  const resetLink = `${base}/?resetToken=${encodeURIComponent(resetToken)}`;

  const subject = "Password Reset Instructions - Campus Lost & Found";
  const bodyContent = `
    <p>Hello <strong>${name}</strong>,</p>
    <p>We received a request to reset the password for your Campus Lost & Found account. Use the security reset token below or click the button to set a new password:</p>
    
    <div class="token-box">
      <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6b7280; margin-bottom: 6px;">Your Security Reset Token</div>
      <div class="token-value">${resetToken}</div>
    </div>

    <p style="text-align: center; font-size: 13px; color: #4b5563;">
      Or click the button below to directly open the reset form:
    </p>
  `;

  const text = `Hello ${name},

We received a request to reset the password for your Campus Lost & Found account.

Your security reset token is:
${resetToken}

You can also use this direct link to set your new password:
${resetLink}

This token will expire in 15 minutes.
If you did not make this request, please ignore this email and your password will remain unchanged.

Campus Lost & Found System`;

  return sendMail({
    to,
    subject,
    html: wrapHtmlEmail({
      title: subject,
      bodyContent,
      ctaText: "Reset My Password",
      ctaLink: resetLink,
      footerNote: "⏰ For your security, this reset token will expire in 15 minutes. If you did not request a password reset, you can safely ignore this message.",
    }),
    text,
  });
}

/**
 * Sends an email notification when a staff verifier approves or rejects a claim.
 */
export async function sendClaimDecisionEmail({
  to,
  name = "Claimant",
  itemTitle,
  decision,
  reason,
  claimId,
  itemId,
  appUrl,
}) {
  const base = getAppUrl(appUrl);
  const itemLink = `${base}/?item=${itemId}`;
  const isApproved = decision === "approved";

  const subject = isApproved
    ? `Claim Approved: "${itemTitle}" is ready for pickup! 🎉`
    : `Claim Update: "${itemTitle}" (Claim #${claimId})`;

  const bodyContent = isApproved
    ? `
      <p>Hello <strong>${name}</strong>,</p>
      <div style="margin-bottom: 16px;">
        <span class="badge badge-approved">✓ Claim Approved</span>
      </div>
      <p>Good news! Your claim for <strong>"${itemTitle}"</strong> has been approved by campus verification staff.</p>
      
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <h4 style="margin: 0 0 8px; color: #166534; font-size: 15px;">Pickup Instructions:</h4>
        <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #14532d; line-height: 1.6;">
          <li>Visit the <strong>Campus Safety Administration (CSA)</strong> office.</li>
          <li>Operating hours: Monday to Friday, 8:00 AM – 5:00 PM.</li>
          <li>Please bring your valid <strong>Campus Student/Faculty ID</strong> for identity confirmation.</li>
          <li>Reference Claim Number: <strong>#${claimId}</strong></li>
        </ul>
      </div>
    `
    : `
      <p>Hello <strong>${name}</strong>,</p>
      <div style="margin-bottom: 16px;">
        <span class="badge badge-rejected">Claim Reviewed</span>
      </div>
      <p>Your claim for <strong>"${itemTitle}"</strong> (Claim #${claimId}) was reviewed by campus verifiers.</p>
      <p><strong>Decision:</strong> Rejected / Additional Info Required</p>
      ${reason ? `<p><strong>Reason provided:</strong> ${reason}</p>` : ""}
      <p>If you have additional proofs of ownership or believe this decision was made in error, please visit the CSA office or submit a new inquiry with additional details.</p>
    `;

  const text = isApproved
    ? `Hello ${name},

Your claim for "${itemTitle}" (Claim #${claimId}) has been APPROVED!

Please visit the Campus Safety Administration (CSA) office to collect your item.
Remember to bring your valid Campus Student/Faculty ID.

View item details: ${itemLink}

Campus Lost & Found System`
    : `Hello ${name},

Your claim for "${itemTitle}" (Claim #${claimId}) was reviewed.
Decision: Rejected
${reason ? `Reason: ${reason}` : ""}

View item details: ${itemLink}

Campus Lost & Found System`;

  return sendMail({
    to,
    subject,
    html: wrapHtmlEmail({
      title: subject,
      bodyContent,
      ctaText: "View Item on Dashboard",
      ctaLink: itemLink,
    }),
    text,
  });
}

/**
 * Sends an email notification when a found item is verified and matched to a user's lost report.
 */
export async function sendItemMatchedEmail({
  to,
  name = "Reporter",
  lostTitle,
  foundTitle,
  itemId,
  appUrl,
}) {
  const base = getAppUrl(appUrl);
  const itemLink = `${base}/?item=${itemId}`;

  const subject = `Your Lost Item May Have Been Found! ("${lostTitle}")`;
  const bodyContent = `
    <p>Hello <strong>${name}</strong>,</p>
    <div style="margin-bottom: 16px;">
      <span class="badge badge-match">✨ Verified Match Found</span>
    </div>
    <p>A found item handed into the campus office has been verified and linked to your lost report:</p>
    
    <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <p style="margin: 0 0 6px; font-size: 13px; color: #92400e;"><strong>Your Lost Report:</strong> ${lostTitle}</p>
      <p style="margin: 0; font-size: 14px; color: #78350f;"><strong>Matched Found Item:</strong> ${foundTitle}</p>
    </div>

    <p>Please check the item details on the dashboard and request a claim or arrange pickup if this is your item.</p>
  `;

  const text = `Hello ${name},

A found item ("${foundTitle}") has been verified and matched to your lost report ("${lostTitle}").

Please visit the dashboard to inspect the item and request a claim:
${itemLink}

Campus Lost & Found System`;

  return sendMail({
    to,
    subject,
    html: wrapHtmlEmail({
      title: subject,
      bodyContent,
      ctaText: "Inspect Found Item",
      ctaLink: itemLink,
    }),
    text,
  });
}

/**
 * Sends an email confirmation after an item is handed over and marked collected.
 */
export async function sendItemHandoverEmail({
  to,
  name = "Claimant",
  itemTitle,
  claimId,
  appUrl,
}) {
  const base = getAppUrl(appUrl);
  const subject = `Receipt: "${itemTitle}" Handover Complete`;
  const bodyContent = `
    <p>Hello <strong>${name}</strong>,</p>
    <p>This email confirms that <strong>"${itemTitle}"</strong> (Claim #${claimId}) was successfully collected from the CSA office.</p>
    <p>Thank you for using the Campus Lost & Found System. We're glad we could help return your item!</p>
  `;

  const text = `Hello ${name},

This email confirms that "${itemTitle}" (Claim #${claimId}) was successfully collected.

Thank you for using Campus Lost & Found!`;

  return sendMail({
    to,
    subject,
    html: wrapHtmlEmail({
      title: subject,
      bodyContent,
      ctaText: "Return to Campus Lost & Found",
      ctaLink: base,
    }),
    text,
  });
}
