<?php
$dbConfig = getenv('DB_CONFIG');
if ($dbConfig && file_exists($dbConfig)) {
    include $dbConfig;
} else {
    include '../db.php';
}
include_once __DIR__ . '/../image_utils.php';

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
$plant_type              = trim($_POST['plant_type'] ?? 'houseplant');
$valid_types = ['succulent','houseplant','vegetable','flower','cacti'];
if (!in_array($plant_type, $valid_types, true)) {
    $plant_type = 'houseplant';
}
$watering_frequency      = intval($_POST['watering_frequency'] ?? 0);
$fertilizing_frequency   = intval($_POST['fertilizing_frequency'] ?? 0);
$water_amount            = isset($_POST['water_amount']) ? floatval($_POST['water_amount']) : 0;
$last_watered            = $_POST['last_watered'] ?? null;
$last_fertilized         = $_POST['last_fertilized'] ?? null;
$photo_url               = trim($_POST['photo_url'] ?? '');
$scientific_name         = trim($_POST['scientific_name'] ?? '');
$thumbnail_url           = trim($_POST['thumbnail_url'] ?? '');

$errors = [];
$namePattern = "/^[\p{L}0-9\s'-]{1,100}$/u";
if (!preg_match($namePattern, $name)) {
    $errors[] = 'Invalid name';
}

// If no new photo or URL is provided, retain the existing one
if ($photo_url === '' && (!isset($_FILES['photo']) || $_FILES['photo']['error'] !== UPLOAD_ERR_OK)) {
    $stmt = $conn->prepare("SELECT photo_url FROM plants WHERE id = ?");
    if ($stmt) {
        $stmt->bind_param('i', $id);
        if ($stmt->execute()) {
            $stmt->bind_result($existingUrl);
            if ($stmt->fetch()) {
                $photo_url = $existingUrl;
            }
        }
        $stmt->close();
    }
}

// further validation
if ($species !== '' && !preg_match("/^[\p{L}0-9\s.'-]{1,100}$/u", $species)) {
    $errors[] = 'Invalid species';
}
if ($room !== '' && !preg_match('/^[\p{L}0-9\s-]{1,50}$/u', $room)) {
    $errors[] = 'Invalid room';
}
if ($watering_frequency < 1 || $watering_frequency > 365) {
    $errors[] = 'Watering frequency must be 1-365';
}
if ($water_amount < 0) {
    $errors[] = 'Water amount must be non-negative';
}

if ($errors) {
    @http_response_code(400);
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
                    unlink($oldReal);
                }
            }
            $converted = convert_to_webp($dest);
            generate_responsive_variants($converted);
            $photo_url = 'uploads/' . basename($converted);
        }
    }
}

// Basic validation

if (!$id) {
    @http_response_code(400);
    echo json_encode(['error' => 'Missing or invalid fields']);
    if (!getenv('TESTING')) {
        exit;
    }
    return;
}

// Prepare update statement
$stmt = $conn->prepare("
    UPDATE plants
    SET name               = ?,
        species            = ?,
        plant_type         = ?,
        room               = ?,
        watering_frequency = ?,
        fertilizing_frequency = ?,
        last_watered       = ?,
        last_fertilized    = ?,
        photo_url          = ?,
        water_amount       = ?,
        scientific_name    = ?,
        thumbnail_url      = ?
    WHERE id = ?
");
$stmt->bind_param(
    'ssssiisssdssi',
    $name,
    $species,
    $plant_type,
    $room,
    $watering_frequency,
    $fertilizing_frequency,
    $last_watered,
    $last_fertilized,
    $photo_url,
    $water_amount,
    $scientific_name,
    $thumbnail_url,
    $id
);

if (!$stmt->execute()) {
    @http_response_code(500);
    $response = ['error' => 'Database error'];
    if ($debug) {
        $response['details'] = $stmt->error;
    }
    echo json_encode($response);
    if (!getenv('TESTING')) {
        exit;
    }
    return;
}

$stmt->close();
@http_response_code(200);
echo json_encode(['status' => 'success']);
