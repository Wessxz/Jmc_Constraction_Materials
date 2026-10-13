# 🚀 JMC Hardware - Setup Instructions

## 📋 Prerequisites
- XAMPP (Apache + MySQL + PHP)
- Git
- Web browser
- Text editor (VS Code, Notepad++, etc.)

---

## 🔧 Installation Steps

### 1. Clone the Repository
```bash
git clone https://github.com/Wessxz/Jmc_Constraction_Materials.git
cd Jmc_Constraction_Materials
```

Or download ZIP from GitHub and extract to `C:\xampp\htdocs\jmc_new`

---

### 2. Create Environment File
```bash
# Copy the example file
cp .env.example .env

# Or manually:
# 1. Copy .env.example
# 2. Rename to .env
# 3. Edit with your settings
```

**Edit `.env` file:**
```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=jmc_inventory
BASE_URL=http://localhost/jmc_new
```

---

### 3. Create Database

**Option A: Using phpMyAdmin**
1. Open: http://localhost/phpmyadmin
2. Click "New" to create database
3. Database name: `jmc_inventory`
4. Collation: `utf8mb4_general_ci`
5. Click "Create"

**Option B: Using SQL**
```sql
CREATE DATABASE IF NOT EXISTS `jmc_inventory` 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_general_ci;
```

---

### 4. Import Database

1. Open phpMyAdmin
2. Select `jmc_inventory` database
3. Click "Import" tab
4. Choose file: `jmc_inventory_fixed.sql`
5. Click "Go"
6. Wait for success message

**If you get errors, also run:**
```sql
-- Run this in SQL tab
ALTER TABLE `users` 
ADD COLUMN `last_login` DATETIME NULL DEFAULT NULL;
```

---

### 5. Verify Installation

**Test Database Connection:**
- Open: http://localhost/jmc_new/test-login.php
- Should show: "✅ Database connected"

**Test API:**
- Open: http://localhost/jmc_new/test-api.html
- Click "Run Tests"
- All tests should pass

---

### 6. Login

**Admin Account:**
- URL: http://localhost/jmc_new/login.html
- Email: `admin@jmcmaterials.com`
- Password: `admin123`

**If login fails:**
1. Open: http://localhost/jmc_new/test-login.php
2. Click "Generate & Update" button
3. Try login again

---

## 🗂️ Project Structure

```
jmc_new/
├── api/                    # Backend API endpoints
│   ├── auth/              # Authentication APIs
│   ├── products/          # Product management
│   ├── orders/            # Order management
│   ├── deliveries/        # Delivery system
│   └── db.php             # Database connection
├── Js/                    # JavaScript files
│   ├── admin.js          # Admin dashboard
│   ├── login.js          # Login functionality
│   └── dispatch-system.js # Truck dispatcher
├── styles/                # CSS files
├── img/                   # Images
├── uploads/               # User uploads
├── .env                   # Environment config (create this!)
├── .env.example          # Environment template
└── *.html                # Frontend pages
```

---

## 🔑 Default Accounts

### Admin
- Email: `admin@jmcmaterials.com`
- Password: `admin123`
- Access: All features

### Create New Users
- Register page: http://localhost/jmc_new/register.html
- Or via admin panel: Employees section

---

## 🐛 Troubleshooting

### Database Connection Error
**Problem:** "SQLSTATE[HY000] [1045] Access denied"

**Solution:**
1. Check `.env` file exists
2. Verify DB_USER and DB_PASSWORD
3. Make sure MySQL is running in XAMPP

---

### Login Error: "Invalid email or password"
**Problem:** Cannot login with admin credentials

**Solution:**
1. Open: http://localhost/jmc_new/test-login.php
2. Click "Generate & Update"
3. Login with: admin@jmcmaterials.com / admin123

---

### 404 Error on API Calls
**Problem:** API endpoints return 404

**Solution:**
1. Check Apache is running
2. Verify .htaccess file exists
3. Enable mod_rewrite in Apache config
4. Restart Apache

---

### Missing Database Column
**Problem:** "Unknown column 'last_login'"

**Solution:**
```sql
ALTER TABLE `users` 
ADD COLUMN `last_login` DATETIME NULL DEFAULT NULL;
```

---

### TRUCK_MAX_ORDERS is not defined
**Problem:** JavaScript error in console

**Solution:**
- Clear browser cache (Ctrl+Shift+Delete)
- Hard reload (Ctrl+Shift+R)
- Check if `Js/dispatch-system.js` exists

---

## 📞 Common Issues

### Apache won't start
- Port 80 is in use
- Check if Skype or IIS is using port 80
- Change port in XAMPP config

### MySQL won't start
- Port 3306 is in use
- Check if another MySQL is running
- Stop other MySQL services

### Session issues
- Clear cookies in browser
- Check session.save_path in php.ini
- Restart Apache

---

## 🚀 Development Workflow

### Making Changes
1. Edit files in `C:\xampp\htdocs\jmc_new`
2. Test in browser
3. Commit changes:
   ```bash
   git add .
   git commit -m "Description of changes"
   git push origin master
   ```

### Pulling Updates
```bash
git pull origin master
```

---

## 📦 Deployment to Production

### Hostinger Setup
1. Update `.env` with production credentials:
   ```env
   DB_HOST=localhost
   DB_USER=u266998007_JMC_HARDWARE
   DB_PASSWORD=Jmcmaterials@11
   DB_NAME=u266998007_jmc_inventory
   BASE_URL=https://jmchardware.shop
   ```

2. Upload files via FTP or File Manager
3. Import database in phpMyAdmin
4. Test all features

---

## 🔒 Security Notes

- ⚠️ **NEVER commit `.env` file** - contains passwords!
- ⚠️ Change `SECRET_KEY` in production
- ⚠️ Use strong passwords for admin accounts
- ⚠️ Keep database backups
- ⚠️ Update password hashes regularly

---

## 📚 Additional Resources

- **phpMyAdmin:** http://localhost/phpmyadmin
- **Apache Logs:** C:\xampp\apache\logs\error.log
- **PHP Logs:** C:\xampp\php\logs\php_error_log
- **Project Docs:** Check FIXES_APPLIED.md

---

## 👥 Team Collaboration

### For Team Members:
1. Clone the repository
2. Create your own `.env` (copy from `.env.example`)
3. Import database
4. Never push `.env` or sensitive files
5. Always pull before making changes
6. Test before committing

---

## ✅ Success Checklist

After setup, verify:
- [ ] Apache is running
- [ ] MySQL is running
- [ ] Database `jmc_inventory` exists
- [ ] `.env` file is configured
- [ ] Can access login page
- [ ] Can login as admin
- [ ] Dashboard loads without errors
- [ ] No console errors in browser

---

**Need help?** Check:
- `FIXES_APPLIED.md` - Recent fixes and solutions
- `DATABASE_IMPORT_GUIDE.md` - Database setup help
- Browser console (F12) for errors
- XAMPP logs for server errors

**Project Repository:** https://github.com/Wessxz/Jmc_Constraction_Materials

---

*Last updated: December 2024*
