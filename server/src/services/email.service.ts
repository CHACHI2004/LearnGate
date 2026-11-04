import { env } from "../config/env.js";

export class EmailDeliveryError extends Error {
  constructor() {
    super("Email delivery failed. Configure RESEND_API_KEY and MAIL_FROM, then request the message again.");
    this.name = "EmailDeliveryError";
  }
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function verificationEmailHtml(firstName: string, verificationUrl: string) {
  const name = escapeHtml(firstName.trim() || "there");
  const safeUrl = escapeHtml(verificationUrl);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>Verify your LearnGate email</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f1f5f0;font-family:Arial,Helvetica,sans-serif;color:#183229;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">One quick step to open your LearnGate learning space.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f0;">
      <tr>
        <td align="center" style="padding:42px 16px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;">
            <tr>
              <td style="padding:0 0 18px 4px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td width="38" height="38" align="center" valign="middle" style="width:38px;height:38px;border-radius:11px;background-color:#17684f;color:#ffffff;font-size:19px;font-weight:bold;">L</td>
                    <td style="padding-left:10px;color:#183229;font-size:19px;font-weight:bold;letter-spacing:-0.5px;">Learn<span style="color:#17684f;">Gate</span></td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0;border:1px solid #dce5dc;border-radius:18px;background-color:#ffffff;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="padding:38px 42px 34px;">
                      <div style="width:54px;height:54px;line-height:54px;border-radius:16px;background-color:#e2f0df;color:#17684f;text-align:center;font-size:25px;font-weight:bold;">✓</div>
                      <p style="margin:26px 0 10px;color:#17684f;font-size:11px;font-weight:bold;letter-spacing:1.6px;">ONE QUICK STEP</p>
                      <h1 style="margin:0;color:#183229;font-size:30px;line-height:1.2;letter-spacing:-1px;">Your next chapter<br>starts here.</h1>
                      <p style="margin:18px 0 0;color:#53665b;font-size:15px;line-height:1.75;">Hi ${name},<br>Thanks for joining LearnGate. Verify your email address to activate your account and get started.</p>
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:27px;">
                        <tr>
                          <td align="center" style="border-radius:9px;background-color:#17684f;">
                            <a href="${safeUrl}" style="display:inline-block;padding:15px 25px;border:1px solid #17684f;border-radius:9px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Verify my email&nbsp; →</a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:23px 0 7px;color:#68786e;font-size:12px;line-height:1.6;">This secure link expires in <strong style="color:#183229;">1 hour</strong> and can only be used once.</p>
                      <p style="margin:18px 0 6px;color:#68786e;font-size:11px;line-height:1.6;">If the button doesn’t work, copy and paste this link into your browser:</p>
                      <p style="margin:0;word-break:break-all;color:#17684f;font-size:11px;line-height:1.6;"><a href="${safeUrl}" style="color:#17684f;text-decoration:underline;">${safeUrl}</a></p>
                      <div style="height:1px;margin:27px 0 18px;background-color:#e7ece7;"></div>
                      <p style="margin:0;color:#849087;font-size:11px;line-height:1.6;">If you didn’t create a LearnGate account, you can safely ignore this email.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:19px 12px 0;color:#849087;font-size:10px;line-height:1.7;">Room to learn. Space to grow.<br>This is an automated account message from LearnGate.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendAccountEmail(to: string, subject: string, text: string, html?: string) {
  try {
    if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
      throw new Error("Resend email delivery is not configured");
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text, ...(html ? { html } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Resend API returned HTTP ${response.status}`);
  } catch (error) {
    console.error("Email delivery failed", error instanceof Error ? error.message : "Unknown email error");
    throw new EmailDeliveryError();
  }
}
