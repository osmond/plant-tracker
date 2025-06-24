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

// Prepare and execute
$stmt = $conn->prepare("
    INSERT INTO plants (
        name, species, room, watering_frequency, fertilizing_frequency, last_watered, last_fertilized
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
");
$stmt->bind_param(
    "sssiiss",
    $name,
    $species,
    $room,
    $watering_frequency,
    $fertilizing_frequency,
    $last_watered,
    $last_fertilized
);

$stmt->execute();
$stmt->close();

echo json_encode(['status' => 'success']);
?>
