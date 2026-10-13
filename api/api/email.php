<?php
// Email verification sender using PHP's built-in mail() with Gmail SMTP via PHPMailer.
// If PHPMailer is not installed, falls back to native mail() — or skips and logs token.
// To install PHPMailer: composer require phpmailer/phpmailer
// Then include the autoloader: require_once __DIR__ . '/../vendor/autoload.php';

function send_verification_email(string $toEmail, string $fullName, string $token): bool {
    // Load constants set by db.php (already included by callers)
    $mailUser = MAIL_USER;
    $mailPass = MAIL_PASS;
    $baseUrl  = BASE_URL;

    $verifyUrl = rtrim($baseUrl, '/') . '/api/auth/verify-email.php?token=' . urlencode($token);

    $subject = 'Verify your JMC Hardware account';

    $htmlBody = <<<HTML
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
        .container { max-width: 560px; margin: 40px auto; background: #fff;
                     border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.1); }
        .header { background: #1a3c5e; padding: 24px; text-align: center; }
        .header img { height: 48px; }
        .header h1 { color: #fff; margin: 8px 0 0; font-size: 20px; }
        .body { padding: 32px 40px; color: #333; line-height: 1.6; }
        .btn { display: inline-block; margin: 24px 0; padding: 14px 32px;
               background: #e8a020; color: #fff; text-decoration: none;
               border-radius: 6px; font-weight: bold; font-size: 15px; }
        .footer { padding: 16px 40px; font-size: 12px; color: #999; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>JMC Hardware &amp; General Merchandise</h1>
        </div>
        <div class="body">
          <p>Hi <strong>$fullName</strong>,</p>
          <p>Thanks for registering. Click the button below to verify your email address.
             The link is valid for <strong>24 hours</strong>.</p>
          <p style="text-align:center;">
            <a href="$verifyUrl" class="btn">Verify My Email</a>
          </p>
          <p>Or copy and paste this URL into your browser:</p>
          <p style="word-break:break-all; font-size:13px; color:#555;">$verifyUrl</p>
          <p>If you did not create an account, you can safely ignore this email.</p>
        </div>
        <div class="footer">
          &copy; JMC Hardware &amp; General Merchandise. All rights reserved.
        </div>
      </div>
    </body>
    </html>
    HTML;

    // ── Try PHPMailer (composer install) ─────────────────────────────────────
    $autoload = __DIR__ . '/../vendor/autoload.php';
    if (file_exists($autoload)) {
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
            $mail->AltBody = "Hi $fullName,\n\nVerify your email: $verifyUrl\n\nLink expires in 24 hours.";

            $mail->send();
            return true;
        } catch (\Exception $e) {
            error_log('PHPMailer error: ' . $e->getMessage());
            // Fall through to dev-mode logging below
        }
    }

    // ── Dev / fallback: log token to PHP error log ────────────────────────────
    if (!$mailUser || !$mailPass) {
        error_log("[JMC Dev] Verification token for $toEmail: $token");
        error_log("[JMC Dev] Verify URL: $verifyUrl");
        return true; // Return true so registration still succeeds in dev
    }

    // ── Fallback: native mail() (works if server has sendmail configured) ────
    $headers  = "From: JMC Hardware <$mailUser>\r\n";
    $headers .= "Reply-To: $mailUser\r\n";
    $headers .= "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";

    $sent = mail($toEmail, $subject, $htmlBody, $headers);
    if (!$sent) {
        error_log("[JMC] mail() failed for $toEmail. Token: $token");
    }
    return $sent;
}
