-- Add missing columns to users table

ALTER TABLE `users` 
ADD COLUMN IF NOT EXISTS `last_login` DATETIME NULL DEFAULT NULL AFTER `created_at`;

-- If the column already exists, this won't cause an error
-- Run this in phpMyAdmin SQL tab
