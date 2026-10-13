require("dotenv").config();

const { setGlobalOptions } = require("firebase-functions");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();
setGlobalOptions({ maxInstances: 10 });

function formatRecipient(recipient) {
  if (typeof recipient === "string") return recipient;
  if (!recipient?.email) return "";
  return recipient.name ? `"${recipient.name}" <${recipient.email}>` : recipient.email;
}

/**
 * Sends mail when a document is created in emails/{emailId}.
 * SMTP settings come from functions/.env (SMTP_HOST, SMTP_PORT, SMTP_USER,
 * SMTP_PASS, FROM_EMAIL, FROM_NAME). Set TEST_MODE=true to log instead of send.
 */
exports.sendEmailViaNodemailer = onDocumentCreated("emails/{emailId}", async (event) => {
  const emailDoc = event.data.data();
  const emailId = event.params.emailId;
  const docRef = event.data.ref;

  if (emailDoc.sent === true) {
    logger.info(`Email ${emailId} already sent, skipping.`);
    return null;
  }

  try {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT || "587";
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const fromEmail = process.env.FROM_EMAIL || smtpUser;
    const fromName = process.env.FROM_NAME || "GatheredHub";
    const isTestMode = process.env.TEST_MODE === "true";
    const port = parseInt(smtpPort, 10);

    if (!smtpHost || !smtpUser || !smtpPass || !fromEmail) {
      throw new Error("SMTP configuration missing. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and FROM_EMAIL in functions/.env.");
    }

    logger.info(isTestMode ? "Test mode: email will be logged, not sent." : "Sending email via SMTP.", {
      host: smtpHost,
      port,
    });

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure: port === 465,
      auth: { user: smtpUser, pass: smtpPass },
      ...(smtpHost.includes("gmail.com") ? { service: "gmail" } : {}),
      ...(smtpHost.includes("outlook.com") ? { service: "hotmail" } : {}),
    });

    if (!isTestMode) {
      await transporter.verify();
    }

    const mailOptions = {
      from: emailDoc.from || `"${fromName}" <${fromEmail}>`,
      to: Array.isArray(emailDoc.to)
        ? emailDoc.to.map(formatRecipient).filter(Boolean).join(", ")
        : formatRecipient(emailDoc.to),
      subject: emailDoc.subject || "No subject",
      html: emailDoc.html || "",
      text: emailDoc.text || String(emailDoc.html || "").replace(/<[^>]*>/g, ""),
    };
    if (emailDoc.replyTo) mailOptions.replyTo = emailDoc.replyTo;
    if (!mailOptions.to) throw new Error("Email is missing a recipient.");

    const response = isTestMode
      ? { messageId: `test_${emailId}_${Date.now()}`, response: "250 Message queued as simulated" }
      : await transporter.sendMail(mailOptions);

    await docRef.update({
      status: "sent",
      sent: true,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      messageId: response.messageId || "",
      response: response.response || "Sent via Nodemailer",
      provider: "nodemailer",
    });
    logger.info(`Email ${emailId} sent.`, { messageId: response.messageId });
    return null;
  } catch (error) {
    logger.error(`Error sending email ${emailId}:`, error);
    await docRef.update({
      status: "failed",
      sent: false,
      error: error.message || "Unknown error occurred",
      errorTime: admin.firestore.FieldValue.serverTimestamp(),
      errorCode: error.code || "UNKNOWN",
    });
    return null;
  }
});
