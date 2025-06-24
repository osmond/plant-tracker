<?php
$dbConfig = getenv('DB_CONFIG');
if ($dbConfig && file_exists($dbConfig)) {
    include $dbConfig;
} else {
    include '../db.php';
}

// Basic validation
if (!isset($_POST['name']) || trim($_POST['name']) === '') {
    @http_response_code(400);
    echo json_encode(['error' => 'Plant name is required']);
    if (!getenv('TESTING')) {
        exit;
    }
    return;
}

// Clean and trim inputs
$name = trim($_POST['name']);
$species = trim($_POST['species'] ?? '');
$room = trim($_POST['room'] ?? '');
$watering_frequency = intval($_POST['watering_frequency'] ?? 0);
$fertilizing_frequency = intval($_POST['fertilizing_frequency'] ?? 0);
$last_watered = $_POST['last_watered'] ?? null;
$last_fertilized = $_POST['last_fertilized'] ?? null;
$notes = trim($_POST['notes'] ?? '');
$photo_path = null;
if (isset($_FILES['photo']) && is_uploaded_file($_FILES['photo']['tmp_name'])) {
    $ext = pathinfo($_FILES['photo']['name'], PATHINFO_EXTENSION);
    $filename = uniqid('plant_', true) . ($ext ? ".{$ext}" : '');
    $target = __DIR__ . '/../uploads/' . $filename;
    if (move_uploaded_file($_FILES['photo']['tmp_name'], $target)) {
        $photo_path = 'uploads/' . $filename;
    }
}

// Prepare and execute
$stmt = $conn->prepare("
    INSERT INTO plants (
        name, species, room, watering_frequency, fertilizing_frequency, last_watered, last_fertilized, notes, photo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
");
$stmt->bind_param(
    "sssiissss",
    $name,
    $species,
    $room,
    $watering_frequency,
    $fertilizing_frequency,
    $last_watered,
    $last_fertilized,
    $notes,
    $photo_path
);

$stmt->execute();
$stmt->close();

echo json_encode(['status' => 'success']);
?>
