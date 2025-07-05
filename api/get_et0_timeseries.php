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

if (PHP_SAPI !== 'cli' && session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    if (!headers_sent()) {
        header('Content-Type: application/json');
    }
    @http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    if (!getenv('TESTING')) {
        exit;
    }
    return;
}

if (!headers_sent()) {
    header('Content-Type: application/json');
}

$plantId = isset($_GET['plant_id']) ? intval($_GET['plant_id']) : 0;
$days = isset($_GET['days']) ? max(1, min(30, intval($_GET['days']))) : 30;
if ($plantId <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'plant_id required']);
    return;
}

$stmt = $conn->prepare(
    'SELECT date, et0_mm, water_ml FROM et0_log
     WHERE plant_id = ? AND date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     ORDER BY date'
);
if (!$stmt) {
    http_response_code(500);
    echo json_encode(['error' => 'database error']);
    return;
}
$stmt->bind_param('ii', $plantId, $days);
if (!$stmt->execute()) {
    http_response_code(500);
    $response = ['error' => 'database error'];
    if ($debug) {
        $response['details'] = $stmt->error;
    }
    echo json_encode($response);
    return;
}
$res = $stmt->get_result();
$data = [];
while ($row = $res->fetch_assoc()) {
    $data[] = $row;
}
$stmt->close();

echo json_encode($data);
?>
