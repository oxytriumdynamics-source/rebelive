// ─── Email HTML Templates ──────────────────────────────
// All templates share the same base layout matching the REBELIVE brand.

const BASE_STYLE = `
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background: #0a0a0a;
  color: #e8e6e0;
  margin: 0;
  padding: 0;
`;

function baseWrapper(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>REBELIVE</title>
</head>
<body style="${BASE_STYLE}">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a; padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px; background:#111111; border:1px solid rgba(216,172,82,0.15); border-radius:2px; overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:32px 36px 24px; background: linear-gradient(135deg, #111 0%, #1a1500 100%); border-bottom:1px solid rgba(216,172,82,0.12);">
              <div style="display:flex; align-items:center; gap:10px;">
                <div style="width:6px; height:6px; background:#d8ac52; border-radius:50%;"></div>
                <span style="font-family:'Anton',Arial,sans-serif; font-size:22px; letter-spacing:0.12em; color:#ffffff; text-transform:uppercase;">REBELIVE</span>
              </div>
              <p style="margin:6px 0 0; font-size:10px; letter-spacing:0.25em; text-transform:uppercase; color:rgba(216,172,82,0.6);">Wake · Fuel · Rebel</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 36px; border-top:1px solid rgba(255,255,255,0.06); background:#0d0d0d;">
              <p style="margin:0; font-size:10px; letter-spacing:0.18em; text-transform:uppercase; color:rgba(255,255,255,0.2); text-align:center;">
                © REBELIVE — This is an automated message, please do not reply.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── OTP Email ─────────────────────────────────────────

export function otpEmailHtml(opts: { firstName: string; otp: string }): string {
  const content = `
    <h2 style="margin:0 0 6px; font-size:11px; letter-spacing:0.28em; text-transform:uppercase; color:rgba(216,172,82,0.7);">
      Verify Your Identity
    </h2>
    <h1 style="margin:0 0 20px; font-size:28px; font-weight:700; color:#ffffff; letter-spacing:-0.01em;">
      Your verification code
    </h1>
    <p style="margin:0 0 28px; font-size:14px; line-height:1.7; color:rgba(255,255,255,0.55);">
      Hey <strong style="color:#e8e6e0;">${opts.firstName}</strong>, use the code below to verify your REBELIVE account.
      It expires in <strong style="color:#d8ac52;">10 minutes</strong>.
    </p>

    <!-- OTP box -->
    <div style="text-align:center; margin:0 0 28px;">
      <div style="display:inline-block; background:rgba(216,172,82,0.08); border:1px solid rgba(216,172,82,0.3); padding:20px 40px; border-radius:2px;">
        <span style="font-family:'Courier New',monospace; font-size:38px; font-weight:700; letter-spacing:0.5em; color:#d8ac52; padding-right:-0.5em;">
          ${opts.otp}
        </span>
      </div>
    </div>

    <p style="margin:0; font-size:12px; color:rgba(255,255,255,0.3); text-align:center; letter-spacing:0.06em;">
      If you didn't request this, you can safely ignore this email.
    </p>
  `;
  return baseWrapper(content);
}

// ─── Greeting / Welcome Email ──────────────────────────

export function greetingEmailHtml(opts: { firstName: string }): string {
  const content = `
    <h2 style="margin:0 0 6px; font-size:11px; letter-spacing:0.28em; text-transform:uppercase; color:rgba(216,172,82,0.7);">
      Welcome to the Pack
    </h2>
    <h1 style="margin:0 0 20px; font-size:30px; font-weight:700; color:#ffffff; letter-spacing:-0.01em;">
      Your Rebel ID is live, ${opts.firstName}.
    </h1>
    <p style="margin:0 0 24px; font-size:14px; line-height:1.7; color:rgba(255,255,255,0.55);">
      Welcome to <strong style="color:#d8ac52;">REBELIVE</strong>. You've just unlocked access to the rebel world — personalised drops, exclusive rewards, and a community that moves differently.
    </p>

    <div style="background:rgba(216,172,82,0.06); border-left:3px solid #d8ac52; padding:16px 20px; margin:0 0 28px; border-radius:1px;">
      <p style="margin:0; font-size:13px; line-height:1.6; color:rgba(255,255,255,0.7);">
        <strong style="color:#d8ac52;">Next step:</strong> Verify your email using the OTP we just sent — then take the quiz to discover your rebel persona.
      </p>
    </div>

    <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
      <tr>
        <td style="background:#d8ac52; padding:0;">
          <a href="http://localhost:3000/auth" style="display:block; padding:14px 32px; font-size:11px; font-weight:600; letter-spacing:0.22em; text-transform:uppercase; color:#0a0a0a; text-decoration:none;">
            Go to REBELIVE →
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0; font-size:12px; color:rgba(255,255,255,0.25); text-align:center; letter-spacing:0.06em;">
      Wake · Fuel · Rebel — this is just the beginning.
    </p>
  `;
  return baseWrapper(content);
}
