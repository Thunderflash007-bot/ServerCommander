import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/secrets";

export type MailPayload = {
  to: string;
  subject: string;
  text: string;
};

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

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
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
  });
}
