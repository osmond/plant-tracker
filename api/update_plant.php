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
$photo_path              = $_POST['photo_path'] ?? null;

if (isset($_FILES['photo']) && $_FILES['photo']['error'] === UPLOAD_ERR_OK) {
    $uploadDir = __DIR__ . '/../uploads/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0777, true);
    }
    $ext = pathinfo($_FILES['photo']['name'], PATHINFO_EXTENSION);
    $fileName = uniqid('plant_', true) . '.' . $ext;
    $target = $uploadDir . $fileName;
    if (move_uploaded_file($_FILES['photo']['tmp_name'], $target)) {
        $photo_path = 'uploads/' . $fileName;
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
        photo_path         = ?
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
