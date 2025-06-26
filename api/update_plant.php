<?php
$dbConfig = getenv('DB_CONFIG');
if ($dbConfig && file_exists($dbConfig)) {
    include $dbConfig;
} else {
    include '../db.php';
}

$debug = getenv('DEBUG');
if ($debug) {
    ini_set('display_errors', 1);
    error_reporting(E_ALL);
}

if (!headers_sent()) {
    header('Content-Type: application/json');
}

// Collect and sanitize
$id                      = intval($_POST['id'] ?? 0);
$name                    = trim($_POST['name'] ?? '');
$species                 = trim($_POST['species'] ?? '');
$room                    = trim($_POST['room'] ?? '');
$watering_frequency      = intval($_POST['watering_frequency'] ?? 0);
$fertilizing_frequency   = intval($_POST['fertilizing_frequency'] ?? 0);
$water_amount            = isset($_POST['water_amount']) ? floatval($_POST['water_amount']) : 0;
$last_watered            = $_POST['last_watered'] ?? null;
$last_fertilized         = $_POST['last_fertilized'] ?? null;
$photo_url               = trim($_POST['photo_url'] ?? '');

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
if ($water_amount <= 0) {
    $errors[] = 'Water amount must be positive';
}

if ($errors) {
    http_response_code(400);
    echo json_encode(['error' => implode('; ', $errors)]);
    exit;
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
            // archive old image if one was supplied
            if (!empty($_POST['photo_url'])) {
                $oldPath = __DIR__ . '/../' . ltrim($_POST['photo_url'], '/\\');
                $oldReal = realpath($oldPath);
                $uploadsRoot = realpath(__DIR__ . '/../uploads');
                if (
                    $oldReal &&
                    $uploadsRoot &&
                    strpos($oldReal, $uploadsRoot) === 0 &&
                    is_file($oldReal)
                ) {
                    $archiveDir = $uploadsRoot . '/archive';
                    if (!is_dir($archiveDir)) {
                        mkdir($archiveDir, 0755, true);
                    }
                    $archivePath = $archiveDir . '/' . basename($oldReal);
                    if (file_exists($archivePath)) {
                        $info = pathinfo($oldReal);
                        $archivePath = $archiveDir . '/' . $info['filename'] . '_' . time() . '.' . $info['extension'];
                    }
                    rename($oldReal, $archivePath);
                }
            }
            $photo_url = 'uploads/' . $fileName;
        }
    }
}

// Basic validation

if (!$id || $name === '' || $watering_frequency <= 0 || $water_amount <= 0) {
    @http_response_code(400);
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
        photo_url          = ?,
        water_amount       = ?
    WHERE id = ?
");
$stmt->bind_param(
    'sssiisssdi',
    $name,
    $species,
    $room,
    $watering_frequency,
    $fertilizing_frequency,
    $last_watered,
    $last_fertilized,
    $photo_url,
    $water_amount,
    $id
);

if (!$stmt->execute()) {
    @http_response_code(500);
    $response = ['error' => 'Database error'];
    if ($debug) {
        $response['details'] = $stmt->error;
    }
    echo json_encode($response);
    exit;
}

$stmt->close();
@http_response_code(200);
echo json_encode(['status' => 'success']);
