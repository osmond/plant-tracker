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
$notes                   = trim($_POST['notes'] ?? '');
$photo_path              = null;
if (isset($_FILES['photo']) && is_uploaded_file($_FILES['photo']['tmp_name'])) {
    $ext = pathinfo($_FILES['photo']['name'], PATHINFO_EXTENSION);
    $filename = uniqid('plant_', true) . ($ext ? ".{$ext}" : '');
    $target = __DIR__ . '/../uploads/' . $filename;
    if (move_uploaded_file($_FILES['photo']['tmp_name'], $target)) {
        $photo_path = 'uploads/' . $filename;
    }
}

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
        notes              = ?,
        photo              = COALESCE(?, photo)
    WHERE id = ?
");
$stmt->bind_param(
    'sssiiisssi',
    $name,
    $species,
    $room,
    $watering_frequency,
    $fertilizing_frequency,
    $last_watered,
    $last_fertilized,
    $notes,
    $photo_path,
    $id
);

if (!$stmt->execute()) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error', 'details' => $stmt->error]);
    exit;
}

$stmt->close();
echo json_encode(['status' => 'success']);
