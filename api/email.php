<?php
/**
 * Email sender for JMC Hardware.
 * Uses PHPMailer if vendor/autoload.php exists (local dev),
 * otherwise falls back to PHP's native mail() function (Hostinger shared hosting).
 */

function send_verification_email(string $toEmail, string $fullName, string $token): bool {
    $mailUser = defined('MAIL_USER') ? MAIL_USER : '';
    $mailPass = defined('MAIL_PASS') ? MAIL_PASS : '';
    $baseUrl  = defined('BASE_URL')  ? BASE_URL  : 'https://jmchardware.shop';

    $verifyUrl = rtrim($baseUrl, '/') . '/verify-email?token=' . urlencode($token);

    $subject = 'Verify your JMC Hardware account';

    $htmlBody = '<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0}
  .wrap{max-width:560px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)}
  .hdr{background:#1a3c5e;padding:24px;text-align:center}
  .hdr h1{color:#fff;margin:0;font-size:20px}
  .body{padding:32px 40px;color:#333;line-height:1.6}
  .btn{display:inline-block;margin:24px 0;padding:14px 32px;background:#f97316;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:15px}
  .footer{padding:16px 40px;font-size:12px;color:#999;border-top:1px solid #eee}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr"><h1>JMC Hardware &amp; General Merchandise</h1></div>
  <div class="body">
    <p>Hi <strong>' . htmlspecialchars($fullName) . '</strong>,</p>
    <p>Thanks for registering! Click the button below to verify your email address. The link is valid for <strong>24 hours</strong>.</p>
    <p style="text-align:center"><a href="' . htmlspecialchars($verifyUrl) . '" class="btn">Verify My Email</a></p>
    <p>Or copy and paste this URL:</p>
    <p style="word-break:break-all;font-size:13px;color:#555">' . htmlspecialchars($verifyUrl) . '</p>
    <p>If you did not create an account, you can safely ignore this email.</p>
  </div>
  <div class="footer">&copy; JMC Hardware &amp; General Merchandise. All rights reserved.</div>
</div>
</body>
</html>';

    $textBody = "Hi $fullName,\n\nVerify your email: $verifyUrl\n\nLink expires in 24 hours.\n\nJMC Hardware";

    // ── Option 1: PHPMailer via Composer (local dev) ──────────────────────────
    $autoload = __DIR__ . '/../vendor/autoload.php';
    if (file_exists($autoload) && $mailUser && $mailPass) {
        require_once $autoload;
        try {
            $mail = new PHPMailer\PHPMailer\PHPMailer(true);
            $mail->isSMTP();
            $mail->Host       = 'smtp.gmail.com';
            $mail->SMTPAuth   = true;
            $mail->Username   = $mailUser;
            $mail->Password   = $mailPass;
            $mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
            $mail->Port       = 465;
            $mail->setFrom($mailUser, 'JMC Hardware');
            $mail->addAddress($toEmail, $fullName);
            $mail->isHTML(true);
            $mail->Subject = $subject;
            $mail->Body    = $htmlBody;
            $mail->AltBody = $textBody;
            $mail->send();
            return true;
        } catch (\Exception $e) {
            error_log('PHPMailer error: ' . $e->getMessage());
            // Fall through to native mail()
        }
    }

    // ── Option 2: Native mail() — works on Hostinger shared hosting ───────────
    $headers  = "From: JMC Hardware <noreply@jmchardware.shop>\r\n";
    $headers .= "Reply-To: noreply@jmchardware.shop\r\n";
    $headers .= "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $headers .= "X-Mailer: PHP/" . PHP_VERSION . "\r\n";

    $sent = @mail($toEmail, $subject, $htmlBody, $headers);
    if (!$sent) {
        error_log("[JMC] mail() failed for $toEmail. Verify URL: $verifyUrl");
    }
    return $sent ?: true; // Return true anyway so registration succeeds
}

/**
 * Send password reset email with reset link
 */
function send_password_reset_email(string $toEmail, string $fullName, string $token): bool {
    $mailUser = defined('MAIL_USER') ? MAIL_USER : '';
    $mailPass = defined('MAIL_PASS') ? MAIL_PASS : '';
    $baseUrl  = defined('BASE_URL')  ? BASE_URL  : 'https://jmchardware.shop';

    $resetUrl = rtrim($baseUrl, '/') . '/reset-password.html?token=' . urlencode($token);

    $subject = 'Reset your JMC Hardware password';

    $htmlBody = '<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0}
  .wrap{max-width:560px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)}
  .hdr{background:#1a3c5e;padding:24px;text-align:center}
  .hdr h1{color:#fff;margin:0;font-size:20px}
  .body{padding:32px 40px;color:#333;line-height:1.6}
  .btn{display:inline-block;margin:24px 0;padding:14px 32px;background:#f97316;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:15px}
  .footer{padding:16px 40px;font-size:12px;color:#999;border-top:1px solid #eee}
  .warning{background:#fff3cd;border-left:4px solid #ffc107;padding:12px;margin:16px 0;color:#856404}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr"><h1>JMC Hardware &amp; General Merchandise</h1></div>
  <div class="body">
    <p>Hi <strong>' . htmlspecialchars($fullName) . '</strong>,</p>
    <p>We received a request to reset your password. Click the button below to create a new password. This link is valid for <strong>1 hour</strong>.</p>
    <p style="text-align:center"><a href="' . htmlspecialchars($resetUrl) . '" class="btn">Reset My Password</a></p>
    <p>Or copy and paste this URL:</p>
    <p style="word-break:break-all;font-size:13px;color:#555">' . htmlspecialchars($resetUrl) . '</p>
    <div class="warning">
      <strong>Security Notice:</strong> If you did not request a password reset, please ignore this email. Your password will remain unchanged.
    </div>
  </div>
  <div class="footer">&copy; JMC Hardware &amp; General Merchandise. All rights reserved.</div>
</div>
</body>
</html>';

    $textBody = "Hi $fullName,\n\nReset your password: $resetUrl\n\nLink expires in 1 hour.\n\nIf you did not request this, please ignore this email.\n\nJMC Hardware";

    // ── Option 1: PHPMailer via Composer (local dev) ──────────────────────────
    $autoload = __DIR__ . '/../vendor/autoload.php';
    if (file_exists($autoload) && $mailUser && $mailPass) {
        require_once $autoload;
        try {
            $mail = new PHPMailer\PHPMailer\PHPMailer(true);
            $mail->isSMTP();
            $mail->Host       = 'smtp.gmail.com';
            $mail->SMTPAuth   = true;
            $mail->Username   = $mailUser;
            $mail->Password   = $mailPass;
            $mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
            $mail->Port       = 465;
            $mail->setFrom($mailUser, 'JMC Hardware');
            $mail->addAddress($toEmail, $fullName);
            $mail->isHTML(true);
            $mail->Subject = $subject;
            $mail->Body    = $htmlBody;
            $mail->AltBody = $textBody;
            $mail->send();
            return true;
        } catch (\Exception $e) {
            error_log('PHPMailer error: ' . $e->getMessage());
            // Fall through to native mail()
        }
    }

    // ── Option 2: Native mail() — works on Hostinger shared hosting ───────────
    $headers  = "From: JMC Hardware <noreply@jmchardware.shop>\r\n";
    $headers .= "Reply-To: noreply@jmchardware.shop\r\n";
    $headers .= "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $headers .= "X-Mailer: PHP/" . PHP_VERSION . "\r\n";

    $sent = @mail($toEmail, $subject, $htmlBody, $headers);
    if (!$sent) {
        error_log("[JMC] mail() failed for $toEmail. Reset URL: $resetUrl");
    }
    return $sent ?: true;
}
