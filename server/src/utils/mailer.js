import nodemailer from "nodemailer";

// Retrieve email configuration with flexible fallbacks
const smtpService = (process.env.SMTP_SERVICE || process.env.EMAIL_SERVICE || "").trim().toLowerCase();
const smtpHost = (process.env.SMTP_HOST || process.env.EMAIL_HOST || "").trim();
const smtpPort = Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587);
const smtpUser = (process.env.SMTP_USER || process.env.EMAIL_USER || process.env.MAIL_USER || "").trim();
const rawPass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.MAIL_PASS || process.env.EMAIL_PASSWORD || "";
// Strip any spaces from app passwords (e.g. Google's 16-letter App Password display "xxxx xxxx xxxx xxxx")
const smtpPass = rawPass.replace(/\s+/g, "");
const smtpSecure = process.env.SMTP_SECURE === "true" || smtpPort === 465;
const defaultFrom =
  process.env.SMTP_FROM ||
  (smtpUser ? `"Campus Lost & Found" <${smtpUser}>` : '"Campus Lost & Found" <no-reply@campuslostandfound.edu>');

let transporter = null;
let transportProvider = "none";

// Brevo API Key detection (supports BREVO_API_KEY or xkeysib-... in SMTP_PASS)
const brevoApiKey = (
  process.env.BREVO_API_KEY ||
  process.env.BREVO_KEY ||
  (smtpPass.startsWith("xkeysib-") ? smtpPass : "")
).trim();

// 1. Check if Brevo REST API is configured
if (brevoApiKey) {
  transportProvider = "brevo_api";
  console.log(`[Email] Mailer configured with Brevo REST API.`);
} else if (isGmail && smtpUser && smtpPass) {
  transportProvider = "gmail";
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
  console.log(`[Email] Mailer configured with Gmail service for: ${smtpUser}`);
} else if (smtpHost && smtpUser && smtpPass) {
  transportProvider = "smtp";
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
  console.log(`[Email] Mailer configured with custom SMTP host: ${smtpHost}:${smtpPort}`);
} else {
  console.log(
    "[Email] SMTP credentials not set in .env. Email delivery will run in mock/console mode.",
  );
}

/**
 * Sends transactional email via Brevo REST API (HTTPS port 443).
 */
async function sendViaBrevoApi({ to, subject, html, text }) {
  const fromMatch = defaultFrom.match(/(?:"?([^"]*)"?\s)?<?([^>]+)>?/);
  const senderName = fromMatch?.[1] || "Campus Lost & Found";
  const senderEmail = fromMatch?.[2] || "aguimanallen12@gmail.com";

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": brevoApiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMsg = data?.message || `Brevo API HTTP ${response.status}`;
    throw new Error(errorMsg);
  }
  return { messageId: data.messageId || "brevo-" + Date.now() };
}

// Background verification of SMTP connection
if (transporter) {
  transporter.verify((err) => {
    if (err) {
      console.warn(`[Email Warning] SMTP connection test failed: ${err.message}. If using Gmail, make sure you use an App Password, not your regular password.`);
    } else {
      console.log("[Email] SMTP connection verified successfully! Ready to deliver real emails.");
    }
  });
}

/**
 * Returns current mailer configuration status.
 */
export function getMailerStatus() {
  const isConfigured = Boolean(brevoApiKey || transporter);
  return {
    configured: isConfigured,
    provider: brevoApiKey ? "brevo_api" : transportProvider,
    service: brevoApiKey ? "brevo" : (isGmail ? "gmail" : (smtpService || null)),
    host: brevoApiKey ? "api.brevo.com" : (smtpHost || (isGmail ? "smtp.gmail.com" : null)),
    port: brevoApiKey ? 443 : (isGmail ? 465 : smtpPort),
    user: brevoApiKey ? "Brevo API Key" : (smtpUser ? `${smtpUser.slice(0, 3)}***@${smtpUser.split("@")[1] || ""}` : null),
    from: defaultFrom,
  };
}

/**
 * Tests connection to the configured mail provider (Brevo API or SMTP).
 */
export async function verifyMailerConnection() {
  if (brevoApiKey) {
    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": brevoApiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sender: { email: "test@example.com" },
          to: [{ email: "test@example.com" }],
          subject: "ping",
          textContent: "ping",
        }),
      });
      const data = await response.json().catch(() => ({}));
      // If unauthorized due to IP restriction, return specific message
      if (response.status === 401 || data?.code === "unauthorized") {
        return {
          success: false,
          configured: true,
          provider: "brevo_api",
          error: data?.message || "Brevo API: IP address needs authorization at https://app.brevo.com/security/authorised_ips",
        };
      }
      return { success: true, configured: true, provider: "brevo_api" };
    } catch (err) {
      return { success: false, configured: true, error: err.message };
    }
  }

  if (!transporter) {
    return {
      success: false,
      configured: false,
      error: "No email credentials configured in .env (BREVO_API_KEY, SMTP_USER, or SMTP_PASS).",
    };
  }
  try {
    await transporter.verify();
    return { success: true, configured: true, provider: transportProvider };
  } catch (err) {
    return { success: false, configured: true, error: err.message };
  }
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
export async function sendMail({ to, subject, html, text }) {
  if (!to) {
    console.warn("[Email] Cannot send email: recipient address is empty.");
    return { success: false, error: "No recipient address provided" };
  }

  // 1. Brevo REST API Dispatch (HTTPS port 443)
  if (brevoApiKey) {
    try {
      const result = await sendViaBrevoApi({ to, subject, html, text });
      console.log(`[Email] Message sent via Brevo API to ${to}: ${result.messageId}`);
      return { success: true, messageId: result.messageId, provider: "brevo_api", to };
    } catch (err) {
      console.error(`[Email] Failed sending mail via Brevo API to ${to}:`, err.message);
      if (err.message.includes("unrecognised IP address") || err.message.includes("authorised_ips")) {
        console.warn("\n⚠️ [Brevo IP Notice]: Brevo blocked this request because your IP address is not yet authorized.");
        console.warn("👉 Please authorize your IP here: https://app.brevo.com/security/authorised_ips (or disable IP whitelist in Brevo security settings).\n");
      }
      console.log(`\n=======================================================`);
      console.log(`[EMAIL FALLBACK - BREVO API FAILURE TO ${to}]`);
      console.log(`Subject: ${subject}`);
      console.log(`Error: ${err.message}`);
      console.log(`-------------------------------------------------------`);
      console.log(text);
      console.log(`=======================================================\n`);
      return { success: false, error: err.message, simulated: true, to, provider: "brevo_api" };
    }
  }

  // 2. Nodemailer Transporter Dispatch (Gmail or Custom SMTP)
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
      return { success: true, messageId: info.messageId, provider: transportProvider, to };
    } catch (err) {
      console.error(`[Email] Failed sending mail to ${to}:`, err.message);
      // Fallback: log to console so production admins can still retrieve reset tokens or notices
      console.log(`\n=======================================================`);
      console.log(`[EMAIL FALLBACK - FAILED SMTP DELIVERY TO ${to}]`);
      console.log(`Subject: ${subject}`);
      console.log(`Error: ${err.message}`);
      console.log(`-------------------------------------------------------`);
      console.log(text);
      console.log(`=======================================================\n`);
      return { success: false, error: err.message, simulated: true, to };
    }
  }

  // 3. Development & Unconfigured Fallback
  console.log("\n=======================================================");
  console.log(`[EMAIL DISPATCH - CONSOLE FALLBACK (NO SMTP IN .ENV)]`);
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log("-------------------------------------------------------");
  console.log(text);
  console.log("=======================================================\n");
  return { success: true, simulated: true, provider: "console_fallback", to };
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
 * 1. Sends a password reset email containing the security token and direct reset link.
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
 * 2. Sends an email notification when a staff verifier approves or rejects a claim.
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
 * 3. Sends an email notification when a found item is verified and matched to a user's lost report.
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
 * 4. Sends an email confirmation after an item is handed over and marked collected.
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

/**
 * 5. Sends an email notification when a staff member comments on a claim messaging thread.
 */
export async function sendClaimMessageEmail({
  to,
  name = "Claimant",
  senderName,
  senderRole,
  itemTitle,
  claimId,
  messageText,
  appUrl,
}) {
  const base = getAppUrl(appUrl);
  const claimLink = `${base}/?claim=${claimId}`;
  const subject = `New Message on Claim #${claimId} ("${itemTitle}")`;
  const bodyContent = `
    <p>Hello <strong>${name}</strong>,</p>
    <p>You have a new message from <strong>${senderName}</strong> (${senderRole}) regarding your claim for <strong>"${itemTitle}"</strong>:</p>
    
    <div style="background: #f8fafc; border-left: 4px solid #166534; padding: 14px 16px; margin: 18px 0; border-radius: 4px; font-style: italic; color: #1e293b;">
      "${messageText}"
    </div>

    <p>Please log in to your dashboard to view the message thread and reply.</p>
  `;

  const text = `Hello ${name},

You received a message from ${senderName} (${senderRole}) regarding Claim #${claimId} ("${itemTitle}"):

"${messageText}"

Reply on the dashboard:
${claimLink}

Campus Lost & Found System`;

  return sendMail({
    to,
    subject,
    html: wrapHtmlEmail({
      title: subject,
      bodyContent,
      ctaText: "Reply to Message",
      ctaLink: claimLink,
    }),
    text,
  });
}

/**
 * 6. Sends a test email to verify SMTP delivery.
 */
export async function sendTestEmail({ to, appUrl }) {
  const base = getAppUrl(appUrl);
  const subject = "Test Email - Campus Lost & Found Mailer Configuration";
  const bodyContent = `
    <p>Hello!</p>
    <p>This is a verification test email from your <strong>Campus Lost & Found</strong> server.</p>
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 16px; margin: 18px 0; color: #166534;">
      ✓ <strong>SMTP Configuration is Working!</strong> Emails can now be delivered to student and staff inboxes.
    </div>
    <p>Timestamp: <strong>${new Date().toUTCString()}</strong></p>
  `;

  const text = `Test Email - Campus Lost & Found
SMTP is working successfully! Ready to deliver notifications.
Timestamp: ${new Date().toUTCString()}`;

  return sendMail({
    to,
    subject,
    html: wrapHtmlEmail({
      title: subject,
      bodyContent,
      ctaText: "Open Campus Lost & Found",
      ctaLink: base,
    }),
    text,
  });
}
