<?php
$debug = getenv('DEBUG');
if ($debug) {
    ini_set('display_errors', 1);
    error_reporting(E_ALL);
}
$dbConfig = getenv('DB_CONFIG');
if ($dbConfig && file_exists($dbConfig)) {
    include $dbConfig;
} else {
    include '../db.php';
}

if (!headers_sent()) {
    header('Content-Type: application/json');
}

$plantId = isset($_POST['plant_id']) ? intval($_POST['plant_id']) : 0;
$et0 = isset($_POST['et0_mm']) ? floatval($_POST['et0_mm']) : null;
$water = isset($_POST['water_ml']) ? floatval($_POST['water_ml']) : null;

if ($plantId <= 0 || $et0 === null || $water === null) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid params']);
    return;
}

$stmt = $conn->prepare(
    'INSERT IGNORE INTO et0_log (plant_id, date, et0_mm, water_ml)
     VALUES (?, CURDATE(), ?, ?)'
);
if (!$stmt) {
    http_response_code(500);
    echo json_encode(['error' => 'database error']);
    return;
}
$stmt->bind_param('idd', $plantId, $et0, $water);
if (!$stmt->execute()) {
    http_response_code(500);
    $response = ['error' => 'database error'];
    if ($debug) {
        $response['details'] = $stmt->error;
    }
    echo json_encode($response);
    return;
}
$stmt->close();

http_response_code(201);
echo json_encode(['status' => 'ok']);
?>
