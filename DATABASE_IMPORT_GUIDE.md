# 📋 JMC Hardware - Database Import Guide

## Problem na Na-encounter
```
MySQL Error #1050 - Table 'activity_logs' already exists
```

Ito ay nangyayari kapag nag-import ng SQL file sa database na may existing tables na.

## ✅ Solution - Fixed SQL File

Gumawa ako ng **`jmc_inventory_fixed.sql`** na may automatic DROP TABLE statements.

---

## 🚀 Step-by-Step Import Instructions

### Option 1: Using Fixed SQL File (RECOMMENDED)

#### Step 1: Backup Your Current Database (Optional but Recommended)
```
1. Open phpMyAdmin
2. Select your database (jmc_hardware or u266998007_jmc_inventory)
3. Click "Export" tab
4. Click "Go" to download backup
5. Save as "jmc_backup_[date].sql"
```

#### Step 2: Drop All Existing Tables (if needed)
```sql
-- Run this in phpMyAdmin SQL tab if you want fresh start:

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `activity_logs`;
DROP TABLE IF EXISTS `bulk_orders`;
DROP TABLE IF EXISTS `cart_items`;
DROP TABLE IF EXISTS `categories`;
DROP TABLE IF EXISTS `deliveries`;
DROP TABLE IF EXISTS `item_returns`;
DROP TABLE IF EXISTS `orders`;
DROP TABLE IF EXISTS `order_cancellations`;
DROP TABLE IF EXISTS `password_resets`;
DROP TABLE IF EXISTS `products`;
DROP TABLE IF EXISTS `product_variants`;
DROP TABLE IF EXISTS `returns`;
DROP TABLE IF EXISTS `sales`;
DROP TABLE IF EXISTS `transactions`;
DROP TABLE IF EXISTS `truck_batches`;
DROP TABLE IF EXISTS `users`;

SET FOREIGN_KEY_CHECKS = 1;
```

#### Step 3: Import the Fixed SQL File
```
1. Open phpMyAdmin
2. Select your database
3. Click "Import" tab
4. Click "Choose File"
5. Select: jmc_inventory_fixed.sql
6. Scroll down and click "Go"
7. Wait for import to complete
```

#### Expected Result:
```
✅ Import has been successfully finished
✅ All tables created
✅ All data imported
✅ No #1050 errors
```

---

### Option 2: Manual Fix (If you want to use original file)

#### If you already started importing and got #1050 error:

**Method A: Ignore and Continue**
- Click "Ignore" when you see the error
- phpMyAdmin will skip existing tables
- Only new data will be imported
- Existing data is preserved

**Method B: Fix the Original SQL File**
1. Open `jmc_inventory.sql` in text editor
2. Find this line:
   ```sql
   -- Table structure for table `activity_logs`
   ```
3. ADD this BEFORE each CREATE TABLE statement:
   ```sql
   DROP TABLE IF EXISTS `table_name`;
   ```
4. Save and re-import

---

## 📊 Tables in Database

The fixed SQL file will create/update these 16 tables:

1. ✅ **activity_logs** - System activity logs
2. ✅ **bulk_orders** - Bulk order requests
3. ✅ **cart_items** - Shopping cart items
4. ✅ **categories** - Product categories
5. ✅ **deliveries** - Delivery records
6. ✅ **item_returns** - Item return requests
7. ✅ **orders** - Regular orders
8. ✅ **order_cancellations** - Order cancellation requests
9. ✅ **password_resets** - Password reset tokens
10. ✅ **products** - Product catalog
11. ✅ **product_variants** - Product size variants
12. ✅ **returns** - Return records
13. ✅ **sales** - Sales transactions
14. ✅ **transactions** - Payment transactions
15. ✅ **truck_batches** - Delivery truck batches
16. ✅ **users** - User accounts

---

## 🔍 Verify Successful Import

### Check 1: Tables Created
```sql
-- Run in phpMyAdmin SQL tab:
SHOW TABLES;
```
Expected: Should show 16 tables

### Check 2: Check Table Counts
```sql
-- Count records in important tables:
SELECT 
  (SELECT COUNT(*) FROM users) as total_users,
  (SELECT COUNT(*) FROM products) as total_products,
  (SELECT COUNT(*) FROM orders) as total_orders,
  (SELECT COUNT(*) FROM deliveries) as total_deliveries;
```

### Check 3: Test a Query
```sql
-- Get recent orders:
SELECT order_ref, customer_name, total, status, created_at 
FROM orders 
ORDER BY created_at DESC 
LIMIT 5;
```

---

## ⚙️ Update .env File

Make sure your `.env` file matches your database:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=jmc_hardware
# OR if using Hostinger structure:
# DB_NAME=u266998007_jmc_inventory

SECRET_KEY=your-secret-key-here
BASE_URL=http://localhost
```

---

## 🐛 Troubleshooting

### Error: "Can't connect to MySQL server"
**Solution:**
- Start XAMPP MySQL service
- Check if port 3306 is not blocked
- Verify DB_HOST and DB_PORT in .env

### Error: "Access denied for user"
**Solution:**
- Check DB_USER and DB_PASSWORD in .env
- Make sure user has permissions:
```sql
GRANT ALL PRIVILEGES ON jmc_hardware.* TO 'root'@'localhost';
FLUSH PRIVILEGES;
```

### Error: "Table doesn't exist"
**Solution:**
- Import was incomplete
- Re-run the import with jmc_inventory_fixed.sql
- Check for error messages during import

### Error: "Duplicate entry"
**Solution:**
- Trying to import same data twice
- Either:
  - Drop all tables first (Step 2)
  - Or skip duplicate errors

### Some tables are empty
**Solution:**
- Check if INSERT statements are in the SQL file
- Make sure import didn't timeout
- Increase phpMyAdmin timeout:
  ```
  php.ini: max_execution_time = 300
  php.ini: upload_max_filesize = 64M
  php.ini: post_max_size = 64M
  ```

---

## 🎯 Quick Import Commands

### For Command Line (if you prefer):

```bash
# Navigate to XAMPP mysql bin folder
cd C:\xampp\mysql\bin

# Import using command line
mysql -u root -p jmc_hardware < "C:\xampp\htdocs\Jmc_new\jmc_inventory_fixed.sql"

# Enter password when prompted (usually empty for XAMPP)
```

---

## 📁 File Comparison

### Original File
- **File:** `jmc_inventory.sql`
- **Issue:** Missing DROP TABLE IF EXISTS
- **Result:** #1050 errors on re-import

### Fixed File
- **File:** `jmc_inventory_fixed.sql` ✅
- **Added:** DROP TABLE IF EXISTS for all 16 tables
- **Added:** SET FOREIGN_KEY_CHECKS = 0
- **Result:** Clean import without errors

---

## 💡 Best Practices

### For Development:
1. Always backup before import
2. Use the fixed SQL file
3. Drop tables if you want fresh data
4. Keep a copy of working database

### For Production (Hostinger):
1. **NEVER** drop tables in production
2. Export backup first
3. Test locally before deploying
4. Use migrations for schema changes

### For Testing:
1. Keep a "clean" SQL file
2. Reset database between tests
3. Use the fixed file for quick resets

---

## 📞 Need Help?

If you encounter other errors:

1. Check the error message carefully
2. Look in `error.log` file in project root
3. Check XAMPP error logs:
   - `C:\xampp\mysql\data\mysql_error.log`
   - `C:\xampp\apache\logs\error.log`

---

## ✅ Success Checklist

After import, verify:

- [ ] All 16 tables exist
- [ ] Users table has at least 1 admin user
- [ ] Products table has sample products
- [ ] No errors in phpMyAdmin
- [ ] Can login to admin panel
- [ ] Can view products on website
- [ ] API endpoints respond correctly

---

**Import Status:** ✅ Fixed and Ready to Use

Use **`jmc_inventory_fixed.sql`** for error-free imports!
