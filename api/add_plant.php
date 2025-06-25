<?php
$dbConfig = getenv('DB_CONFIG');
if ($dbConfig && file_exists($dbConfig)) {
    include $dbConfig;
} else {
    include '../db.php';
}

if (!headers_sent()) {
    header('Content-Type: application/json');
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
$water_amount = floatval($_POST['water_amount'] ?? 0);
$fertilizing_frequency = intval($_POST['fertilizing_frequency'] ?? 0);
$last_watered = $_POST['last_watered'] ?? null;
$last_fertilized = $_POST['last_fertilized'] ?? null;
$photo_url = trim($_POST['photo_url'] ?? '');

// further validation
$errors = [];
if ($species !== '' && !preg_match('/^[A-Za-z0-9\s-]{1,100}$/', $species)) {
    $errors[] = 'Invalid species';
}
if ($room !== '' && !preg_match('/^[A-Za-z0-9\s-]{1,50}$/', $room)) {
    $errors[] = 'Invalid room';
}
if ($watering_frequency < 1 || $watering_frequency > 365) {
    $errors[] = 'Watering frequency must be 1-365';
}
if ($water_amount < 0) {
    $errors[] = 'Water amount must be positive';
}
if ($errors) {
    http_response_code(400);
    echo json_encode(['error' => implode('; ', $errors)]);
    if (!getenv('TESTING')) {
        exit;
    }
    return;
}

// Handle uploaded photo
if (isset($_FILES['photo']) && $_FILES['photo']['error'] === UPLOAD_ERR_OK) {
    $uploadDir = __DIR__ . '/../uploads/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif'];
    $extension = strtolower(pathinfo($_FILES['photo']['name'], PATHINFO_EXTENSION));

    if (in_array($extension, $allowedExtensions)) {
        $fileName = uniqid('plant_', true) . '.' . $extension;
        $dest = $uploadDir . $fileName;

        if (move_uploaded_file($_FILES['photo']['tmp_name'], $dest)) {
            $photo_url = 'uploads/' . $fileName;
        }
    }
}

// Prepare and execute
$stmt = $conn->prepare(
    "
    INSERT INTO plants (
        name, species, room, watering_frequency, water_amount, fertilizing_frequency, last_watered, last_fertilized, photo_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
);
if (!$stmt) {
    @http_response_code(500);
    echo json_encode(['error' => 'Database error', 'details' => $conn->error]);
    if (!getenv('TESTING')) {
        exit;
    }
    return;
}
$stmt->bind_param(
    "sssidisss",
    $name,
    $species,
    $room,
    $watering_frequency,
    $water_amount,
    $fertilizing_frequency,
    $last_watered,
    $last_fertilized,
    $photo_url
);

if (!$stmt->execute()) {
    @http_response_code(500);
    echo json_encode(['error' => 'Database error', 'details' => $stmt->error]);
    if (!getenv('TESTING')) {
        exit;
    }
    return;
}
$stmt->close();

@http_response_code(201);
echo json_encode(['status' => 'success']);
?>
