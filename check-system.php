<?php
// Quick diagnostic script for Hostinger
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "<h1>System Check</h1>";

// Check 1: Database connection
echo "<h2>1. Database Connection</h2>";
try {
    require_once 'api/db.php';
    $pdo = get_db();
    echo "✅ Database connected successfully<br>";
} catch (Exception $e) {
    echo "❌ Database connection failed: " . $e->getMessage() . "<br>";
    exit;
}

// Check 2: Users table structure
echo "<h2>2. Users Table Structure</h2>";
try {
    $stmt = $pdo->query("DESCRIBE users");
    $columns = $stmt->fetchAll();
    
    $hasIsActive = false;
    echo "<table border='1' cellpadding='5'>";
    echo "<tr><th>Field</th><th>Type</th><th>Null</th><th>Default</th></tr>";
    foreach ($columns as $col) {
        echo "<tr>";
        echo "<td>{$col['Field']}</td>";
        echo "<td>{$col['Type']}</td>";
        echo "<td>{$col['Null']}</td>";
        echo "<td>{$col['Default']}</td>";
        echo "</tr>";
        
        if ($col['Field'] === 'is_active') {
            $hasIsActive = true;
        }
    }
    echo "</table>";
    
    if ($hasIsActive) {
        echo "<p style='color:green;'>✅ Column 'is_active' EXISTS</p>";
    } else {
        echo "<p style='color:red;'>❌ Column 'is_active' NOT FOUND</p>";
        echo "<p><strong>Run this SQL:</strong></p>";
        echo "<pre>ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1;</pre>";
    }
} catch (Exception $e) {
    echo "❌ Error checking table: " . $e->getMessage() . "<br>";
}

// Check 3: Sample users data
echo "<h2>3. Sample Users Data</h2>";
try {
    $stmt = $pdo->query("SELECT id, full_name, email, role FROM users LIMIT 3");
    $users = $stmt->fetchAll();
    echo "<pre>";
    print_r($users);
    echo "</pre>";
} catch (Exception $e) {
    echo "❌ Error fetching users: " . $e->getMessage() . "<br>";
}

// Check 4: Test login endpoint
echo "<h2>4. Check API Files</h2>";
$files = [
    'api/auth/login.php',
    'api/auth/toggle-account-status.php',
    'api/auth/employees.php',
    'api/customers/index.php',
];

foreach ($files as $file) {
    if (file_exists($file)) {
        echo "✅ $file exists<br>";
    } else {
        echo "❌ $file NOT FOUND<br>";
    }
}

// Check 5: PHP version and errors
echo "<h2>5. PHP Environment</h2>";
echo "PHP Version: " . phpversion() . "<br>";
echo "Error Reporting: " . error_reporting() . "<br>";
echo "Display Errors: " . ini_get('display_errors') . "<br>";

echo "<h2>Done!</h2>";
?>
