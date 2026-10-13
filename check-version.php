<?php
// Upload this file to your Hostinger root and visit it in browser
// It will tell you if your files are updated

header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html>
<head>
    <title>Version Check - JMC Hardware</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 900px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .check {
            background: white;
            padding: 20px;
            margin: 10px 0;
            border-radius: 8px;
            border-left: 4px solid #3b82f6;
        }
        .success { border-left-color: #10b981; background: #d1fae5; }
        .error { border-left-color: #ef4444; background: #fee2e2; }
        .warning { border-left-color: #f59e0b; background: #fef3c7; }
        code {
            background: #1f2937;
            color: #10b981;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
        }
        h1 { color: #1f2937; }
        h2 { color: #374151; margin-top: 30px; }
        pre {
            background: #1f2937;
            color: #e5e7eb;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
        }
    </style>
</head>
<body>
    <h1>🔍 JMC Hardware - File Version Check</h1>
    <p>This page checks if your files are updated with the availability_type feature.</p>

    <h2>1. Check admin.html</h2>
    <?php
    $adminHtml = @file_get_contents(__DIR__ . '/admin.html');
    if ($adminHtml && strpos($adminHtml, 'prod-availability') !== false) {
        echo '<div class="check success">✅ <strong>admin.html is UPDATED</strong> - Contains prod-availability field</div>';
    } else {
        echo '<div class="check error">❌ <strong>admin.html is OLD</strong> - Missing prod-availability field</div>';
        echo '<p>You need to upload the updated admin.html file!</p>';
    }
    ?>

    <h2>2. Check Js/admin.js</h2>
    <?php
    $adminJs = @file_get_contents(__DIR__ . '/Js/admin.js');
    if ($adminJs && strpos($adminJs, 'prod-availability') !== false) {
        echo '<div class="check success">✅ <strong>Js/admin.js is UPDATED</strong> - Contains prod-availability code</div>';
        
        // Check if it's sending availability_type
        if (strpos($adminJs, 'availability_type') !== false) {
            echo '<div class="check success">✅ JavaScript sends <code>availability_type</code> to API</div>';
        } else {
            echo '<div class="check warning">⚠️ JavaScript reads field but might not send it</div>';
        }
    } else {
        echo '<div class="check error">❌ <strong>Js/admin.js is OLD</strong> - Missing prod-availability code</div>';
        echo '<p>You need to upload the updated Js/admin.js file!</p>';
    }
    ?>

    <h2>3. Check api/products/index.php</h2>
    <?php
    $apiIndex = @file_get_contents(__DIR__ . '/api/products/index.php');
    if ($apiIndex && strpos($apiIndex, 'availability_type') !== false) {
        echo '<div class="check success">✅ <strong>api/products/index.php is UPDATED</strong> - Handles availability_type</div>';
        
        // Check if it's in the INSERT statement
        if (strpos($apiIndex, 'INSERT INTO products') !== false && 
            preg_match('/availability_type/', $apiIndex)) {
            echo '<div class="check success">✅ API inserts <code>availability_type</code> into database</div>';
        } else {
            echo '<div class="check warning">⚠️ API might not be inserting availability_type correctly</div>';
        }
    } else {
        echo '<div class="check error">❌ <strong>api/products/index.php is OLD</strong> - Missing availability_type handling</div>';
        echo '<p>You need to upload the updated api/products/index.php file!</p>';
    }
    ?>

    <h2>4. Check api/db.php</h2>
    <?php
    $dbPhp = @file_get_contents(__DIR__ . '/api/db.php');
    if ($dbPhp && strpos($dbPhp, 'availability_type') !== false) {
        echo '<div class="check success">✅ <strong>api/db.php is UPDATED</strong> - Returns availability_type</div>';
    } else {
        echo '<div class="check error">❌ <strong>api/db.php is OLD</strong> - Missing availability_type in product_to_dict()</div>';
        echo '<p>You need to upload the updated api/db.php file!</p>';
    }
    ?>

    <h2>5. Database Connection Test</h2>
    <?php
    try {
        require_once __DIR__ . '/api/db.php';
        $pdo = get_db();
        echo '<div class="check success">✅ Database connection works</div>';
        
        // Check if column exists
        $stmt = $pdo->query("SHOW COLUMNS FROM products LIKE 'availability_type'");
        $column = $stmt->fetch();
        
        if ($column) {
            echo '<div class="check success">✅ Column <code>availability_type</code> exists in products table</div>';
            echo '<pre>' . print_r($column, true) . '</pre>';
        } else {
            echo '<div class="check error">❌ Column <code>availability_type</code> NOT FOUND in products table</div>';
            echo '<p>Run this SQL in phpMyAdmin:</p>';
            echo '<pre>ALTER TABLE products ADD COLUMN availability_type ENUM(\'both\', \'bulk_only\', \'walkin_only\') NOT NULL DEFAULT \'both\' AFTER unit;</pre>';
        }
        
        // Check recent products
        echo '<h2>6. Recent Products in Database</h2>';
        $stmt = $pdo->query("SELECT id, name, unit, availability_type, created_at FROM products ORDER BY id DESC LIMIT 5");
        $products = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        if ($products) {
            echo '<table border="1" cellpadding="10" style="width: 100%; background: white; border-collapse: collapse;">';
            echo '<tr style="background: #1f2937; color: white;">';
            echo '<th>ID</th><th>Name</th><th>Unit</th><th>Availability Type</th><th>Created</th>';
            echo '</tr>';
            foreach ($products as $p) {
                $color = $p['availability_type'] === 'both' ? '#fef3c7' : '#d1fae5';
                echo '<tr style="background: ' . $color . '">';
                echo '<td>' . $p['id'] . '</td>';
                echo '<td>' . htmlspecialchars($p['name']) . '</td>';
                echo '<td>' . htmlspecialchars($p['unit']) . '</td>';
                echo '<td><strong>' . htmlspecialchars($p['availability_type']) . '</strong></td>';
                echo '<td>' . $p['created_at'] . '</td>';
                echo '</tr>';
            }
            echo '</table>';
        }
        
    } catch (Exception $e) {
        echo '<div class="check error">❌ Database error: ' . $e->getMessage() . '</div>';
    }
    ?>

    <hr style="margin: 40px 0;">
    <h2>📋 What to Do Next:</h2>
    <div class="check">
        <p><strong>If any file shows ❌ (OLD):</strong></p>
        <ol>
            <li>Upload that file from your local <code>c:\Users\Vicente\Downloads\updated jmc\</code> folder</li>
            <li>Refresh this page to verify upload</li>
            <li>Clear browser cache (Ctrl + Shift + R)</li>
            <li>Try adding a product again</li>
        </ol>
    </div>

</body>
</html>
