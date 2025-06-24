<?php
$dbConfig = getenv('DB_CONFIG');
if ($dbConfig && file_exists($dbConfig)) {
    include $dbConfig;
} else {
    include '../db.php';
}

// Collect and sanitize
$id                      = intval($_POST['id'] ?? 0);
$name                    = trim($_POST['name'] ?? '');
$species                 = trim($_POST['species'] ?? '');
$room                    = trim($_POST['room'] ?? '');
$watering_frequency      = intval($_POST['watering_frequency'] ?? 0);
$fertilizing_frequency   = intval($_POST['fertilizing_frequency'] ?? 0);
$last_watered            = $_POST['last_watered'] ?: null;
$last_fertilized         = $_POST['last_fertilized'] ?: null;
$photo_url               = trim($_POST['photo_url'] ?? '');

// Basic validation
if (!$id || $name === '' || $watering_frequency <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing or invalid fields']);
    exit;
}

// Prepare update statement
$stmt = $conn->prepare("
    UPDATE plants 
    SET name               = ?,
        species            = ?,
        room               = ?,
        watering_frequency = ?,
        fertilizing_frequency = ?,
        last_watered       = ?,
        last_fertilized    = ?,
        photo_url          = ?
    WHERE id = ?
");
$stmt->bind_param(
    'sssiisssi',
    $name,
    $species,
    $room,
    $watering_frequency,
    $fertilizing_frequency,
    $last_watered,
    $last_fertilized,
    $photo_url,
    $id
);

if (!$stmt->execute()) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error', 'details' => $stmt->error]);
    exit;
}

$stmt->close();
echo json_encode(['status' => 'success']);
