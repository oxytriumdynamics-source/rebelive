// ─── Email HTML Templates ──────────────────────────────
// Clean black-and-white minimal design with REBELIVE logo + panther mascot.
// Images are served from the frontend (CLIENT_URL env var).

const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:3000';

// Logo images hosted on the frontend's /public/brand/ folder
const LOGO_WHITE   = `${CLIENT_URL}/brand/rebelive-white.png`;  // white wordmark (for dark bg)
const LOGO_BLACK   = `${CLIENT_URL}/brand/REBELIVE Logo Black.png`;  // black wordmark (for white sections)
const PANTHER_ICON = `${CLIENT_URL}/brand/panther_white_icon-transparent.png`; // mascot seal

// ─── Base wrapper ──────────────────────────────────────

function baseWrapper(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>REBELIVE</title>
</head>
<body style="margin:0; padding:0; background:#ffffff; font-family: Arial, Helvetica, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5; padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background:#ffffff; border:1px solid #e0e0e0;">

          <!-- ── Header bar (black) ── -->
          <tr>
            <td style="background:#0a0a0a; padding:28px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <!-- REBELIVE wordmark -->
                    <img
                      src="${LOGO_WHITE}"
                      alt="REBELIVE"
                      width="160"
                      height="auto"
                      style="display:block; border:0; max-width:160px;"
                    />
                  </td>
                  <td align="right" valign="middle">
                    <!-- Panther mascot (moscourt) -->
                    <img
                      src="${PANTHER_ICON}"
                      alt="Panther"
                      width="36"
                      height="36"
                      style="display:block; border:0; opacity:0.75;"
                    />
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Thin accent rule ── -->
          <tr>
            <td style="height:3px; background:#0a0a0a;"></td>
          </tr>

          <!-- ── Body ── -->
          <tr>
            <td style="padding:40px 36px; background:#ffffff;">
              ${content}
            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td style="padding:24px 36px; background:#0a0a0a; border-top:1px solid #1a1a1a;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="middle">
                    <img
                      src="${LOGO_WHITE}"
                      alt="REBELIVE"
                      width="100"
                      height="auto"
                      style="display:block; border:0; opacity:0.55;"
                    />
                  </td>
                  <td align="right" valign="middle">
                    <img
                      src="${PANTHER_ICON}"
                      alt="Panther seal"
                      width="22"
                      height="22"
                      style="display:block; border:0; opacity:0.35;"
                    />
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top:14px;">
                    <p style="margin:0; font-size:10px; letter-spacing:0.14em; text-transform:uppercase; color:rgba(255,255,255,0.25); font-family:Arial,sans-serif;">
                      Wake &middot; Fuel &middot; Rebel &nbsp;&nbsp;&mdash;&nbsp;&nbsp; &copy; ${new Date().getFullYear()} REBELIVE. Automated message &mdash; please do not reply.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <!-- ── Spacer below card ── -->
        <p style="margin:20px 0 0; font-size:10px; color:#aaaaaa; font-family:Arial,sans-serif; letter-spacing:0.1em; text-transform:uppercase;">
          REBELIVE &mdash; rebelive.com
        </p>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

// ─── Shared inner styles ───────────────────────────────

const S = {
  eyebrow: 'margin:0 0 8px; font-size:10px; letter-spacing:0.28em; text-transform:uppercase; color:#888888; font-family:Arial,sans-serif;',
  h1:      'margin:0 0 18px; font-size:26px; font-weight:700; color:#0a0a0a; letter-spacing:-0.02em; line-height:1.2; font-family:Arial,Helvetica,sans-serif;',
  body:    'margin:0 0 24px; font-size:14px; line-height:1.75; color:#444444; font-family:Arial,sans-serif;',
  strong:  'color:#0a0a0a;',
  rule:    'border:none; border-top:1px solid #e8e8e8; margin:28px 0;',
  note:    'margin:0; font-size:11px; color:#bbbbbb; text-align:center; font-family:Arial,sans-serif; letter-spacing:0.06em;',
};

// ─── OTP Email ─────────────────────────────────────────

export function otpEmailHtml(opts: { firstName: string; otp: string }): string {
  const content = `
    <p style="${S.eyebrow}">Verification</p>
    <h1 style="${S.h1}">Your one-time code</h1>
    <p style="${S.body}">
      Hey <strong style="${S.strong}">${opts.firstName}</strong>, use the code below to verify your REBELIVE account.
      It expires in <strong style="${S.strong}">10 minutes</strong>.
    </p>

    <!-- OTP box -->
    <table cellpadding="0" cellspacing="0" style="margin:0 0 28px; width:100%;">
      <tr>
        <td align="center">
          <div style="display:inline-block; background:#0a0a0a; padding:22px 48px;">
            <span style="font-family:'Courier New',Courier,monospace; font-size:40px; font-weight:700; letter-spacing:0.55em; color:#ffffff; padding-right:-0.55em; display:block;">
              ${opts.otp}
            </span>
          </div>
        </td>
      </tr>
    </table>

    <hr style="${S.rule}"/>
    <p style="${S.note}">If you didn't request this, you can safely ignore this email.</p>
  `;
  return baseWrapper(content);
}

// ─── Welcome / Greeting Email ──────────────────────────

export function greetingEmailHtml(opts: {
  firstName: string;
  persona?: { name: string; tagline?: string | null } | null;
}): string {
  const { firstName, persona } = opts;

  // Persona reveal block — shown only when a persona is assigned
  const personaBlock = persona
    ? `
    <!-- Persona reveal -->
    <table cellpadding="0" cellspacing="0" style="margin:0 0 28px; width:100%;">
      <tr>
        <td style="background:#0a0a0a; padding:24px 28px;">
          <p style="margin:0 0 6px; font-size:9px; letter-spacing:0.3em; text-transform:uppercase; color:rgba(255,255,255,0.45); font-family:Arial,sans-serif;">
            Your Rebel Persona
          </p>
          <p style="margin:0; font-size:28px; font-weight:700; color:#ffffff; letter-spacing:0.04em; font-family:Arial,Helvetica,sans-serif; text-transform:uppercase;">
            ${persona.name}
          </p>
          ${persona.tagline ? `<p style="margin:10px 0 0; font-size:12px; line-height:1.6; color:rgba(255,255,255,0.6); font-family:Arial,sans-serif;">${persona.tagline}</p>` : ''}
        </td>
      </tr>
    </table>`
    : `
    <!-- No persona yet — invite to take the quiz -->
    <table cellpadding="0" cellspacing="0" style="margin:0 0 28px; width:100%; border-left:3px solid #0a0a0a;">
      <tr>
        <td style="padding:14px 18px; background:#f8f8f8;">
          <p style="margin:0; font-size:13px; line-height:1.65; color:#444444; font-family:Arial,sans-serif;">
            <strong style="${S.strong}">Next step:</strong> Take the quiz to discover your rebel persona &mdash; APEX, CAPELLA, or AVIVA &mdash; and unlock your annual drop.
          </p>
        </td>
      </tr>
    </table>`;

  const content = `
    <p style="${S.eyebrow}">Welcome to the pack</p>
    <h1 style="${S.h1}">Your Rebel ID is live, ${firstName}.</h1>
    <p style="${S.body}">
      Welcome to <strong style="${S.strong}">REBELIVE</strong>. You've just unlocked access to the rebel world &mdash; personalised drops, exclusive rewards, and a community that moves differently.
    </p>

    ${personaBlock}

    <!-- CTA button -->
    <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
      <tr>
        <td style="background:#0a0a0a;">
          <a href="${CLIENT_URL}" style="display:block; padding:14px 36px; font-size:11px; font-weight:700; letter-spacing:0.22em; text-transform:uppercase; color:#ffffff; text-decoration:none; font-family:Arial,sans-serif;">
            Go to REBELIVE &rarr;
          </a>
        </td>
      </tr>
    </table>

    <hr style="${S.rule}"/>
    <p style="${S.note}">Wake &middot; Fuel &middot; Rebel &mdash; this is just the beginning.</p>
  `;
  return baseWrapper(content);
}
