import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/secrets";

export type MailPayload = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrapMailHtml(title: string, contentHtml: string, footer?: string): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f3f6fb;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;background:#ffffff;border:1px solid #dbe4f0;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;background:linear-gradient(120deg,#0f172a,#1e293b);color:#ffffff;">
                <h1 style="margin:0;font-size:20px;line-height:1.2;font-weight:700;">ServerCommander</h1>
                <p style="margin:8px 0 0 0;font-size:13px;opacity:0.9;">${escapeHtml(title)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                ${contentHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#475569;font-size:12px;line-height:1.5;">
                ${escapeHtml(footer ?? "Automatic security message from ServerCommander.")}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildWelcomeCredentialsMail(input: {
  displayName: string;
  username: string;
  temporaryPassword: string;
}): { subject: string; text: string; html: string } {
  const subject = "Welcome to ServerCommander";
  const text = [
    `Hello ${input.displayName},`,
    "",
    "Your ServerCommander account has been created.",
    `Username: ${input.username}`,
    `Temporary password: ${input.temporaryPassword}`,
    "",
    "At first login you must change your password.",
  ].join("\n");

  const html = wrapMailHtml(
    "Your account is ready",
    `<p style="margin:0 0 12px 0;font-size:15px;">Hello ${escapeHtml(input.displayName)},</p>
     <p style="margin:0 0 16px 0;font-size:14px;color:#334155;">Your ServerCommander account was created. Use these initial credentials:</p>
     <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;">
       <tr><td style="padding:12px 14px;font-size:13px;color:#475569;">Username</td><td style="padding:12px 14px;font-size:14px;font-weight:600;color:#0f172a;">${escapeHtml(input.username)}</td></tr>
       <tr><td style="padding:12px 14px;font-size:13px;color:#475569;border-top:1px solid #e2e8f0;">Temporary password</td><td style="padding:12px 14px;font-size:14px;font-weight:600;color:#0f172a;border-top:1px solid #e2e8f0;">${escapeHtml(input.temporaryPassword)}</td></tr>
     </table>
     <p style="margin:16px 0 0 0;font-size:13px;color:#334155;">You will be asked to change this password at first login.</p>`,
    "Do not share this email. If this account was not expected, contact an administrator immediately."
  );

  return { subject, text, html };
}

export function buildLoginCodeMail(input: {
  displayName: string;
  code: string;
  minutesValid: number;
}): { subject: string; text: string; html: string } {
  const subject = "ServerCommander Login Code";
  const text = [
    `Hello ${input.displayName},`,
    "",
    `Your login code is: ${input.code}`,
    `This code expires in ${input.minutesValid} minutes.`,
    "",
    "If you did not request this login, contact your administrator.",
  ].join("\n");

  const html = wrapMailHtml(
    "Two-factor authentication",
    `<p style="margin:0 0 12px 0;font-size:15px;">Hello ${escapeHtml(input.displayName)},</p>
     <p style="margin:0 0 14px 0;font-size:14px;color:#334155;">Use this one-time login code:</p>
     <div style="display:inline-block;padding:12px 18px;border-radius:10px;background:#0f172a;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:4px;">${escapeHtml(input.code)}</div>
     <p style="margin:14px 0 0 0;font-size:13px;color:#334155;">This code expires in ${input.minutesValid} minutes.</p>`,
    "Never share this code with anyone."
  );

  return { subject, text, html };
}

export function buildPasswordResetCodeMail(input: {
  displayName: string;
  code: string;
  minutesValid: number;
}): { subject: string; text: string; html: string } {
  const subject = "ServerCommander Password Reset Code";
  const text = [
    `Hello ${input.displayName},`,
    "",
    `Your password reset code is: ${input.code}`,
    `This code expires in ${input.minutesValid} minutes.`,
  ].join("\n");

  const html = wrapMailHtml(
    "Password reset request",
    `<p style="margin:0 0 12px 0;font-size:15px;">Hello ${escapeHtml(input.displayName)},</p>
     <p style="margin:0 0 14px 0;font-size:14px;color:#334155;">Use this one-time code to reset your password:</p>
     <div style="display:inline-block;padding:12px 18px;border-radius:10px;background:#0f172a;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:4px;">${escapeHtml(input.code)}</div>
     <p style="margin:14px 0 0 0;font-size:13px;color:#334155;">This code expires in ${input.minutesValid} minutes.</p>`,
    "If you did not request a reset, you can ignore this message."
  );

  return { subject, text, html };
}

export function buildSmtpTestMail(input: {
  host: string;
  port: number;
  secure: boolean;
  fromEmail: string;
}): { subject: string; text: string; html: string } {
  const subject = "ServerCommander SMTP Test";
  const transport = input.secure
    ? (input.port === 465 ? "SSL/TLS (implicit)" : "STARTTLS")
    : "unencrypted/optional TLS";
  const text = [
    "This is a test email from ServerCommander.",
    "",
    `Host: ${input.host}`,
    `Port: ${input.port}`,
    `Transport: ${transport}`,
    `From: ${input.fromEmail}`,
  ].join("\n");

  const html = wrapMailHtml(
    "SMTP test successful",
    `<p style="margin:0 0 12px 0;font-size:15px;">This confirms that outgoing email is working.</p>
     <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;">
       <tr><td style="padding:12px 14px;font-size:13px;color:#475569;">Host</td><td style="padding:12px 14px;font-size:14px;font-weight:600;color:#0f172a;">${escapeHtml(input.host)}</td></tr>
       <tr><td style="padding:12px 14px;font-size:13px;color:#475569;border-top:1px solid #e2e8f0;">Port</td><td style="padding:12px 14px;font-size:14px;font-weight:600;color:#0f172a;border-top:1px solid #e2e8f0;">${input.port}</td></tr>
       <tr><td style="padding:12px 14px;font-size:13px;color:#475569;border-top:1px solid #e2e8f0;">Transport</td><td style="padding:12px 14px;font-size:14px;font-weight:600;color:#0f172a;border-top:1px solid #e2e8f0;">${escapeHtml(transport)}</td></tr>
       <tr><td style="padding:12px 14px;font-size:13px;color:#475569;border-top:1px solid #e2e8f0;">From</td><td style="padding:12px 14px;font-size:14px;font-weight:600;color:#0f172a;border-top:1px solid #e2e8f0;">${escapeHtml(input.fromEmail)}</td></tr>
     </table>`,
    "No further action required."
  );

  return { subject, text, html };
}

export async function getSmtpSettings() {
  return db.smtpSettings.findUnique({ where: { id: "default" } });
}

export async function isSmtpEnabled(): Promise<boolean> {
  const cfg = await getSmtpSettings();
  return !!(cfg?.enabled && cfg.host && cfg.port && cfg.username && cfg.passwordEnc && cfg.fromEmail);
}

export async function sendMail(payload: MailPayload): Promise<void> {
  const cfg = await getSmtpSettings();
  if (!cfg?.enabled) {
    throw new Error("SMTP is disabled");
  }
  if (!cfg.host || !cfg.port || !cfg.username || !cfg.passwordEnc || !cfg.fromEmail) {
    throw new Error("SMTP config incomplete");
  }
  if (!payload.text && !payload.html) {
    throw new Error("Mail payload requires text or html content");
  }

  const useImplicitTls = cfg.secure && cfg.port === 465;
  const requireStartTls = cfg.secure && cfg.port !== 465;

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: useImplicitTls,
    requireTLS: requireStartTls,
    auth: {
      user: cfg.username,
      pass: decryptSecret(cfg.passwordEnc),
    },
  });

  const from = cfg.useAlias && cfg.fromName
    ? `${cfg.fromName} <${cfg.fromEmail}>`
    : cfg.fromEmail;

  await transporter.sendMail({
    from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });
}
