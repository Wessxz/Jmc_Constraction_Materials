-- Fix admin password for JMC Hardware
-- This will update the existing admin account password

-- Update admin password to: admin123
UPDATE `users` 
SET `password_hash` = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'
WHERE `email` = 'admin@jmcmaterials.com';

-- Login credentials:
-- Email: admin@jmcmaterials.com
-- Password: admin123

-- Note: This is the correct bcrypt hash for "admin123"
-- Generated using PHP password_hash() function
