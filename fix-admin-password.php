<?php
// Generate correct password hash for admin123
$password = 'admin123';
$hash = password_hash($password, PASSWORD_DEFAULT);

echo "Password: $password\n";
echo "Hash: $hash\n";
echo "\n";
echo "Copy this SQL and run in phpMyAdmin:\n\n";
echo "UPDATE `users` SET `password_hash` = '$hash' WHERE `email` = 'admin@jmcmaterials.com';\n";
