<?php
/**
 * Import Bulk Order Products
 * 
 * This script imports construction materials and bulk products 
 * commonly found in Philippine hardware stores.
 * 
 * Usage: Run this file once to populate the database with bulk order products.
 * Access: http://your-domain/api/products/import-bulk-products.php
 */

require_once __DIR__ . '/../db.php';

// Ensure this is only run by authorized users
$user = require_role('admin');

$pdo = get_db();
$pdo->beginTransaction();

try {
    // First, add categories if they don't exist
    $categories = [
        'Bulk Materials',
        'Aggregates',
        'Cement & Concrete',
        'Steel & Metal',
        'Lumber & Wood',
        'Roofing Materials',
        'Blocks & Masonry'
    ];

    foreach ($categories as $catName) {
        $stmt = $pdo->prepare('SELECT id FROM categories WHERE name = ? LIMIT 1');
        $stmt->execute([$catName]);
        if (!$stmt->fetch()) {
            $pdo->prepare('INSERT INTO categories (name) VALUES (?)')->execute([$catName]);
        }
    }

    // Define all bulk products
    $bulkProducts = [
        // AGGREGATES & SAND
        [
            'name' => 'Gravel 3/4"',
            'price' => 1200.00,
            'category' => 'Aggregates',
            'stock' => 500,
            'min_quantity' => 1,
            'critical_quantity' => 50,
            'unit' => 'cu.m',
            'specifications' => ['Commonly used for concrete mixing', 'Size: 3/4 inch', 'Delivery: Per cubic meter', 'Minimum order: 1 cubic meter'],
            'discount' => 0,
            'image' => 'img/gravel.jpg',
            'sku' => 'SKU-GRVL001'
        ],
        [
            'name' => 'Gravel 1/2"',
            'price' => 1150.00,
            'category' => 'Aggregates',
            'stock' => 450,
            'min_quantity' => 1,
            'critical_quantity' => 50,
            'unit' => 'cu.m',
            'specifications' => ['Used for concrete and drainage', 'Size: 1/2 inch', 'Delivery: Per cubic meter', 'Minimum order: 1 cubic meter'],
            'discount' => 0,
            'image' => 'img/gravel-half.jpg',
            'sku' => 'SKU-GRVL002'
        ],
        [
            'name' => 'Gravel 1"',
            'price' => 1250.00,
            'category' => 'Aggregates',
            'stock' => 400,
            'min_quantity' => 1,
            'critical_quantity' => 50,
            'unit' => 'cu.m',
            'specifications' => ['Large aggregate for concrete base', 'Size: 1 inch', 'Delivery: Per cubic meter', 'Minimum order: 1 cubic meter'],
            'discount' => 0,
            'image' => 'img/gravel-one.jpg',
            'sku' => 'SKU-GRVL003'
        ],
        [
            'name' => 'Washed Sand',
            'price' => 800.00,
            'category' => 'Aggregates',
            'stock' => 600,
            'min_quantity' => 1,
            'critical_quantity' => 50,
            'unit' => 'cu.m',
            'specifications' => ['Clean washed sand for concrete', 'Fine grade', 'Delivery: Per cubic meter', 'Minimum order: 1 cubic meter'],
            'discount' => 0,
            'image' => 'img/washed-sand.jpg',
            'sku' => 'SKU-SAND001'
        ],
        [
            'name' => 'Filling Sand',
            'price' => 600.00,
            'category' => 'Aggregates',
            'stock' => 700,
            'min_quantity' => 1,
            'critical_quantity' => 50,
            'unit' => 'cu.m',
            'specifications' => ['Used for land filling and base', 'Delivery: Per cubic meter', 'Minimum order: 1 cubic meter'],
            'discount' => 0,
            'image' => 'img/filling-sand.jpg',
            'sku' => 'SKU-SAND002'
        ],
        [
            'name' => 'Concrete Sand',
            'price' => 850.00,
            'category' => 'Aggregates',
            'stock' => 550,
            'min_quantity' => 1,
            'critical_quantity' => 50,
            'unit' => 'cu.m',
            'specifications' => ['Premium grade for concrete mixing', 'Fine to medium grade', 'Delivery: Per cubic meter', 'Minimum order: 1 cubic meter'],
            'discount' => 0,
            'image' => 'img/concrete-sand.jpg',
            'sku' => 'SKU-SAND003'
        ],
        [
            'name' => 'Plastering Sand',
            'price' => 750.00,
            'category' => 'Aggregates',
            'stock' => 500,
            'min_quantity' => 1,
            'critical_quantity' => 50,
            'unit' => 'cu.m',
            'specifications' => ['Fine sand for plastering works', 'Smooth finish', 'Delivery: Per cubic meter', 'Minimum order: 1 cubic meter'],
            'discount' => 0,
            'image' => 'img/plaster-sand.jpg',
            'sku' => 'SKU-SAND004'
        ],
        [
            'name' => 'Crushed Stone S1',
            'price' => 950.00,
            'category' => 'Aggregates',
            'stock' => 400,
            'min_quantity' => 1,
            'critical_quantity' => 50,
            'unit' => 'cu.m',
            'specifications' => ['Size 1 crushed stone', 'For concrete and base course', 'Delivery: Per cubic meter', 'Minimum order: 1 cubic meter'],
            'discount' => 0,
            'image' => 'img/crushed-stone.jpg',
            'sku' => 'SKU-CRSH001'
        ],
        [
            'name' => 'Crushed Stone S2',
            'price' => 900.00,
            'category' => 'Aggregates',
            'stock' => 450,
            'min_quantity' => 1,
            'critical_quantity' => 50,
            'unit' => 'cu.m',
            'specifications' => ['Size 2 crushed stone', 'For drainage and landscaping', 'Delivery: Per cubic meter', 'Minimum order: 1 cubic meter'],
            'discount' => 0,
            'image' => 'img/crushed-stone-2.jpg',
            'sku' => 'SKU-CRSH002'
        ],

        // CEMENT & CONCRETE
        [
            'name' => 'Portland Cement - Republic',
            'price' => 285.00,
            'category' => 'Cement & Concrete',
            'stock' => 2000,
            'min_quantity' => 50,
            'critical_quantity' => 100,
            'unit' => 'bag',
            'specifications' => ['40kg per bag', 'Type I Portland Cement', 'Republic Cement brand', 'Bulk orders available'],
            'discount' => 0,
            'image' => 'img/cement-republic.jpg',
            'sku' => 'SKU-CMNT001'
        ],
        [
            'name' => 'Portland Cement - Eagle',
            'price' => 280.00,
            'category' => 'Cement & Concrete',
            'stock' => 2000,
            'min_quantity' => 50,
            'critical_quantity' => 100,
            'unit' => 'bag',
            'specifications' => ['40kg per bag', 'Type I Portland Cement', 'Eagle Cement brand', 'Bulk orders available'],
            'discount' => 0,
            'image' => 'img/cement-eagle.jpg',
            'sku' => 'SKU-CMNT002'
        ],
        [
            'name' => 'Portland Cement - Holcim',
            'price' => 290.00,
            'category' => 'Cement & Concrete',
            'stock' => 1800,
            'min_quantity' => 50,
            'critical_quantity' => 100,
            'unit' => 'bag',
            'specifications' => ['40kg per bag', 'Type I Portland Cement', 'Holcim brand', 'Bulk orders available'],
            'discount' => 0,
            'image' => 'img/cement-holcim.jpg',
            'sku' => 'SKU-CMNT003'
        ],
        [
            'name' => 'Ready-Mix Concrete 3000 PSI',
            'price' => 4500.00,
            'category' => 'Cement & Concrete',
            'stock' => 100,
            'min_quantity' => 1,
            'critical_quantity' => 10,
            'unit' => 'cu.m',
            'specifications' => ['3000 PSI strength', 'Ready-to-pour', 'Delivery with transit mixer', 'Minimum order: 1 cubic meter'],
            'discount' => 0,
            'image' => 'img/ready-mix.jpg',
            'sku' => 'SKU-RMIX001'
        ],
        [
            'name' => 'Ready-Mix Concrete 4000 PSI',
            'price' => 5000.00,
            'category' => 'Cement & Concrete',
            'stock' => 100,
            'min_quantity' => 1,
            'critical_quantity' => 10,
            'unit' => 'cu.m',
            'specifications' => ['4000 PSI strength', 'High-strength concrete', 'Delivery with transit mixer', 'Minimum order: 1 cubic meter'],
            'discount' => 0,
            'image' => 'img/ready-mix-4000.jpg',
            'sku' => 'SKU-RMIX002'
        ],

        // STEEL & METAL
        [
            'name' => 'Deformed Steel Bar 10mm',
            'price' => 85.00,
            'category' => 'Steel & Metal',
            'stock' => 1000,
            'min_quantity' => 20,
            'critical_quantity' => 50,
            'unit' => 'pc',
            'specifications' => ['Grade 40/60', 'Length: 6 meters', 'Diameter: 10mm', 'Bulk orders available'],
            'discount' => 0,
            'image' => 'img/rebar-10mm.jpg',
            'sku' => 'SKU-RBAR001'
        ],
        [
            'name' => 'Deformed Steel Bar 12mm',
            'price' => 120.00,
            'category' => 'Steel & Metal',
            'stock' => 1000,
            'min_quantity' => 20,
            'critical_quantity' => 50,
            'unit' => 'pc',
            'specifications' => ['Grade 40/60', 'Length: 6 meters', 'Diameter: 12mm', 'Bulk orders available'],
            'discount' => 0,
            'image' => 'img/rebar-12mm.jpg',
            'sku' => 'SKU-RBAR002'
        ],
        [
            'name' => 'Deformed Steel Bar 16mm',
            'price' => 210.00,
            'category' => 'Steel & Metal',
            'stock' => 800,
            'min_quantity' => 20,
            'critical_quantity' => 50,
            'unit' => 'pc',
            'specifications' => ['Grade 40/60', 'Length: 6 meters', 'Diameter: 16mm', 'Bulk orders available'],
            'discount' => 0,
            'image' => 'img/rebar-16mm.jpg',
            'sku' => 'SKU-RBAR003'
        ],
        [
            'name' => 'Deformed Steel Bar 20mm',
            'price' => 320.00,
            'category' => 'Steel & Metal',
            'stock' => 600,
            'min_quantity' => 20,
            'critical_quantity' => 50,
            'unit' => 'pc',
            'specifications' => ['Grade 40/60', 'Length: 6 meters', 'Diameter: 20mm', 'Bulk orders available'],
            'discount' => 0,
            'image' => 'img/rebar-20mm.jpg',
            'sku' => 'SKU-RBAR004'
        ],
        [
            'name' => 'Deformed Steel Bar 25mm',
            'price' => 480.00,
            'category' => 'Steel & Metal',
            'stock' => 400,
            'min_quantity' => 10,
            'critical_quantity' => 30,
            'unit' => 'pc',
            'specifications' => ['Grade 40/60', 'Length: 6 meters', 'Diameter: 25mm', 'Bulk orders available'],
            'discount' => 0,
            'image' => 'img/rebar-25mm.jpg',
            'sku' => 'SKU-RBAR005'
        ],
        [
            'name' => 'Steel Plate 6mm (4x8 ft)',
            'price' => 3500.00,
            'category' => 'Steel & Metal',
            'stock' => 100,
            'min_quantity' => 5,
            'critical_quantity' => 10,
            'unit' => 'sheet',
            'specifications' => ['Thickness: 6mm', 'Size: 4ft x 8ft', 'Hot rolled steel', 'Bulk orders available'],
            'discount' => 0,
            'image' => 'img/steel-plate.jpg',
            'sku' => 'SKU-STPL001'
        ],
        [
            'name' => 'GI Wire #16',
            'price' => 1200.00,
            'category' => 'Steel & Metal',
            'stock' => 200,
            'min_quantity' => 5,
            'critical_quantity' => 20,
            'unit' => 'roll',
            'specifications' => ['Galvanized Iron Wire', 'Gauge #16', '50kg per roll', 'For binding and tying'],
            'discount' => 0,
            'image' => 'img/gi-wire.jpg',
            'sku' => 'SKU-WIRE001'
        ],

        // LUMBER & PLYWOOD
        [
            'name' => 'Marine Plywood 1/4" (4x8)',
            'price' => 850.00,
            'category' => 'Lumber & Wood',
            'stock' => 300,
            'min_quantity' => 10,
            'critical_quantity' => 20,
            'unit' => 'sheet',
            'specifications' => ['Thickness: 1/4 inch', 'Size: 4ft x 8ft', 'Marine grade', 'Waterproof'],
            'discount' => 0,
            'image' => 'img/marine-plywood-quarter.jpg',
            'sku' => 'SKU-PLYW001'
        ],
        [
            'name' => 'Marine Plywood 1/2" (4x8)',
            'price' => 1350.00,
            'category' => 'Lumber & Wood',
            'stock' => 250,
            'min_quantity' => 10,
            'critical_quantity' => 20,
            'unit' => 'sheet',
            'specifications' => ['Thickness: 1/2 inch', 'Size: 4ft x 8ft', 'Marine grade', 'Waterproof'],
            'discount' => 0,
            'image' => 'img/marine-plywood-half.jpg',
            'sku' => 'SKU-PLYW002'
        ],
        [
            'name' => 'Marine Plywood 3/4" (4x8)',
            'price' => 1800.00,
            'category' => 'Lumber & Wood',
            'stock' => 200,
            'min_quantity' => 10,
            'critical_quantity' => 20,
            'unit' => 'sheet',
            'specifications' => ['Thickness: 3/4 inch', 'Size: 4ft x 8ft', 'Marine grade', 'Waterproof'],
            'discount' => 0,
            'image' => 'img/marine-plywood-three.jpg',
            'sku' => 'SKU-PLYW003'
        ],
        [
            'name' => 'Ordinary Plywood 1/4" (4x8)',
            'price' => 580.00,
            'category' => 'Lumber & Wood',
            'stock' => 350,
            'min_quantity' => 10,
            'critical_quantity' => 20,
            'unit' => 'sheet',
            'specifications' => ['Thickness: 1/4 inch', 'Size: 4ft x 8ft', 'Standard grade', 'For interior use'],
            'discount' => 0,
            'image' => 'img/ordinary-plywood-quarter.jpg',
            'sku' => 'SKU-PLYW004'
        ],
        [
            'name' => 'Ordinary Plywood 1/2" (4x8)',
            'price' => 950.00,
            'category' => 'Lumber & Wood',
            'stock' => 300,
            'min_quantity' => 10,
            'critical_quantity' => 20,
            'unit' => 'sheet',
            'specifications' => ['Thickness: 1/2 inch', 'Size: 4ft x 8ft', 'Standard grade', 'For interior use'],
            'discount' => 0,
            'image' => 'img/ordinary-plywood-half.jpg',
            'sku' => 'SKU-PLYW005'
        ],
        [
            'name' => 'Coco Lumber 2x2x10',
            'price' => 180.00,
            'category' => 'Lumber & Wood',
            'stock' => 500,
            'min_quantity' => 20,
            'critical_quantity' => 50,
            'unit' => 'pc',
            'specifications' => ['Size: 2" x 2" x 10ft', 'Coco lumber', 'For framing and support', 'Bulk orders available'],
            'discount' => 0,
            'image' => 'img/coco-lumber-2x2.jpg',
            'sku' => 'SKU-LMBR001'
        ],
        [
            'name' => 'Coco Lumber 2x3x10',
            'price' => 250.00,
            'category' => 'Lumber & Wood',
            'stock' => 450,
            'min_quantity' => 20,
            'critical_quantity' => 50,
            'unit' => 'pc',
            'specifications' => ['Size: 2" x 3" x 10ft', 'Coco lumber', 'For framing and support', 'Bulk orders available'],
            'discount' => 0,
            'image' => 'img/coco-lumber-2x3.jpg',
            'sku' => 'SKU-LMBR002'
        ],
        [
            'name' => 'Coco Lumber 2x4x10',
            'price' => 320.00,
            'category' => 'Lumber & Wood',
            'stock' => 400,
            'min_quantity' => 20,
            'critical_quantity' => 50,
            'unit' => 'pc',
            'specifications' => ['Size: 2" x 4" x 10ft', 'Coco lumber', 'For framing and support', 'Bulk orders available'],
            'discount' => 0,
            'image' => 'img/coco-lumber-2x4.jpg',
            'sku' => 'SKU-LMBR003'
        ],

        // ROOFING MATERIALS
        [
            'name' => 'GI Roofing Sheet 6ft (Gauge 26)',
            'price' => 480.00,
            'category' => 'Roofing Materials',
            'stock' => 500,
            'min_quantity' => 20,
            'critical_quantity' => 50,
            'unit' => 'sheet',
            'specifications' => ['Galvanized Iron', 'Length: 6 feet', 'Gauge 26', 'Corrugated profile'],
            'discount' => 0,
            'image' => 'img/gi-sheet-6ft.jpg',
            'sku' => 'SKU-ROOF001'
        ],
        [
            'name' => 'GI Roofing Sheet 8ft (Gauge 26)',
            'price' => 640.00,
            'category' => 'Roofing Materials',
            'stock' => 450,
            'min_quantity' => 20,
            'critical_quantity' => 50,
            'unit' => 'sheet',
            'specifications' => ['Galvanized Iron', 'Length: 8 feet', 'Gauge 26', 'Corrugated profile'],
            'discount' => 0,
            'image' => 'img/gi-sheet-8ft.jpg',
            'sku' => 'SKU-ROOF002'
        ],
        [
            'name' => 'GI Roofing Sheet 10ft (Gauge 26)',
            'price' => 800.00,
            'category' => 'Roofing Materials',
            'stock' => 400,
            'min_quantity' => 20,
            'critical_quantity' => 50,
            'unit' => 'sheet',
            'specifications' => ['Galvanized Iron', 'Length: 10 feet', 'Gauge 26', 'Corrugated profile'],
            'discount' => 0,
            'image' => 'img/gi-sheet-10ft.jpg',
            'sku' => 'SKU-ROOF003'
        ],
        [
            'name' => 'Pre-Painted GI Sheet 6ft',
            'price' => 650.00,
            'category' => 'Roofing Materials',
            'stock' => 350,
            'min_quantity' => 20,
            'critical_quantity' => 50,
            'unit' => 'sheet',
            'specifications' => ['Color: Various', 'Length: 6 feet', 'Gauge 26', 'Weather resistant'],
            'discount' => 0,
            'image' => 'img/prepainted-gi-6ft.jpg',
            'sku' => 'SKU-ROOF004'
        ],
        [
            'name' => 'Pre-Painted GI Sheet 8ft',
            'price' => 860.00,
            'category' => 'Roofing Materials',
            'stock' => 300,
            'min_quantity' => 20,
            'critical_quantity' => 50,
            'unit' => 'sheet',
            'specifications' => ['Color: Various', 'Length: 8 feet', 'Gauge 26', 'Weather resistant'],
            'discount' => 0,
            'image' => 'img/prepainted-gi-8ft.jpg',
            'sku' => 'SKU-ROOF005'
        ],
        [
            'name' => 'Long Span Roofing 12ft',
            'price' => 1450.00,
            'category' => 'Roofing Materials',
            'stock' => 250,
            'min_quantity' => 10,
            'critical_quantity' => 30,
            'unit' => 'sheet',
            'specifications' => ['Wide span coverage', 'Length: 12 feet', 'Gauge 26', 'For large structures'],
            'discount' => 0,
            'image' => 'img/longspan-12ft.jpg',
            'sku' => 'SKU-ROOF006'
        ],

        // CONCRETE BLOCKS & MASONRY
        [
            'name' => 'Concrete Hollow Block 4"',
            'price' => 18.00,
            'category' => 'Blocks & Masonry',
            'stock' => 5000,
            'min_quantity' => 100,
            'critical_quantity' => 500,
            'unit' => 'pc',
            'specifications' => ['Size: 4 inches', 'Standard CHB', '40cm x 20cm x 10cm', 'Bulk orders available'],
            'discount' => 0,
            'image' => 'img/chb-4inch.jpg',
            'sku' => 'SKU-BLCK001'
        ],
        [
            'name' => 'Concrete Hollow Block 5"',
            'price' => 21.00,
            'category' => 'Blocks & Masonry',
            'stock' => 5000,
            'min_quantity' => 100,
            'critical_quantity' => 500,
            'unit' => 'pc',
            'specifications' => ['Size: 5 inches', 'Standard CHB', '40cm x 20cm x 13cm', 'Bulk orders available'],
            'discount' => 0,
            'image' => 'img/chb-5inch.jpg',
            'sku' => 'SKU-BLCK002'
        ],
        [
            'name' => 'Concrete Hollow Block 6"',
            'price' => 25.00,
            'category' => 'Blocks & Masonry',
            'stock' => 4500,
            'min_quantity' => 100,
            'critical_quantity' => 500,
            'unit' => 'pc',
            'specifications' => ['Size: 6 inches', 'Standard CHB', '40cm x 20cm x 15cm', 'Bulk orders available'],
            'discount' => 0,
            'image' => 'img/chb-6inch.jpg',
            'sku' => 'SKU-BLCK003'
        ],
        [
            'name' => 'Solid Concrete Block',
            'price' => 28.00,
            'category' => 'Blocks & Masonry',
            'stock' => 3000,
            'min_quantity' => 100,
            'critical_quantity' => 300,
            'unit' => 'pc',
            'specifications' => ['Solid concrete', '40cm x 20cm x 10cm', 'High strength', 'Bulk orders available'],
            'discount' => 0,
            'image' => 'img/solid-block.jpg',
            'sku' => 'SKU-BLCK004'
        ],
        [
            'name' => 'Interlocking Paver Block',
            'price' => 45.00,
            'category' => 'Blocks & Masonry',
            'stock' => 2000,
            'min_quantity' => 50,
            'critical_quantity' => 200,
            'unit' => 'pc',
            'specifications' => ['For driveways and walkways', 'Various colors available', '30cm x 30cm', 'Bulk orders available'],
            'discount' => 0,
            'image' => 'img/paver-block.jpg',
            'sku' => 'SKU-BLCK005'
        ],
        [
            'name' => 'Red Bricks',
            'price' => 12.00,
            'category' => 'Blocks & Masonry',
            'stock' => 8000,
            'min_quantity' => 200,
            'critical_quantity' => 1000,
            'unit' => 'pc',
            'specifications' => ['Clay red bricks', 'Standard size', 'For walls and structures', 'Bulk orders available'],
            'discount' => 0,
            'image' => 'img/red-bricks.jpg',
            'sku' => 'SKU-BRCK001'
        ],

        // ADDITIONAL BULK MATERIALS
        [
            'name' => 'Limestone (Anapog)',
            'price' => 950.00,
            'category' => 'Aggregates',
            'stock' => 300,
            'min_quantity' => 1,
            'critical_quantity' => 30,
            'unit' => 'cu.m',
            'specifications' => ['Crushed limestone', 'For base course', 'Delivery: Per cubic meter', 'Minimum order: 1 cubic meter'],
            'discount' => 0,
            'image' => 'img/limestone.jpg',
            'sku' => 'SKU-LMST001'
        ],
        [
            'name' => 'Base Course',
            'price' => 1100.00,
            'category' => 'Aggregates',
            'stock' => 350,
            'min_quantity' => 1,
            'critical_quantity' => 40,
            'unit' => 'cu.m',
            'specifications' => ['Road base material', 'Compacted aggregate', 'Delivery: Per cubic meter', 'Minimum order: 1 cubic meter'],
            'discount' => 0,
            'image' => 'img/base-course.jpg',
            'sku' => 'SKU-BASE001'
        ],
        [
            'name' => 'Sub-Base Aggregate',
            'price' => 980.00,
            'category' => 'Aggregates',
            'stock' => 400,
            'min_quantity' => 1,
            'critical_quantity' => 40,
            'unit' => 'cu.m',
            'specifications' => ['Foundation layer material', 'Drainage and support', 'Delivery: Per cubic meter', 'Minimum order: 1 cubic meter'],
            'discount' => 0,
            'image' => 'img/subbase.jpg',
            'sku' => 'SKU-SUBS001'
        ],
    ];

    $insertedCount = 0;
    $skippedCount = 0;

    foreach ($bulkProducts as $product) {
        // Check if product with same SKU already exists
        $stmt = $pdo->prepare('SELECT id FROM products WHERE sku = ? LIMIT 1');
        $stmt->execute([$product['sku']]);
        
        if ($stmt->fetch()) {
            $skippedCount++;
            continue; // Skip if already exists
        }

        // Insert the product
        $stmt = $pdo->prepare(
            'INSERT INTO products (name, price, category, stock, min_quantity, critical_quantity, unit, specifications, discount, image, sku)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        
        $stmt->execute([
            $product['name'],
            $product['price'],
            $product['category'],
            $product['stock'],
            $product['min_quantity'],
            $product['critical_quantity'],
            $product['unit'],
            json_encode($product['specifications']),
            $product['discount'],
            $product['image'],
            $product['sku']
        ]);

        $insertedCount++;
    }

    $pdo->commit();

    // Log the import
    write_log(
        $user['full_name'],
        $user['role'],
        'import_bulk_products',
        'products',
        '',
        "Imported $insertedCount bulk order products. Skipped $skippedCount existing products."
    );

    json_ok([
        'inserted' => $insertedCount,
        'skipped' => $skippedCount,
        'total' => count($bulkProducts),
        'message' => "Successfully imported $insertedCount bulk order products."
    ]);

} catch (Exception $e) {
    $pdo->rollBack();
    error_log('Bulk products import error: ' . $e->getMessage());
    json_err('Failed to import bulk products: ' . $e->getMessage(), 500);
}
