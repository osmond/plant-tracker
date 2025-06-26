<?php
require_once __DIR__ . '/../csrf.php';
if (getenv('DEBUG')) {
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
if (!csrf_validate()) {
    return;
}

$id = intval($_POST['id']);
$snooze = isset($_POST['snooze_days']) ? intval($_POST['snooze_days']) : 0;

if ($id <= 0) {
    @http_response_code(400);
    echo json_encode(['status' => 'error', 'error' => 'Invalid plant ID']);
    return;
}

$date = new DateTime();
if ($snooze > 0) {
    $date->modify("+{$snooze} days");
}
$today = $date->format('Y-m-d');

$stmt = $conn->prepare("UPDATE plants SET last_fertilized = ? WHERE id = ?");
if (!$stmt) {
    @http_response_code(500);
    echo json_encode(['status' => 'error', 'error' => 'Database error', 'details' => $conn->error]);
    return;
}
$stmt->bind_param("si", $today, $id);
if (!$stmt->execute()) {
    @http_response_code(500);
    echo json_encode(['status' => 'error', 'error' => 'Database error', 'details' => $stmt->error]);
    return;
}

if ($stmt->affected_rows === 0) {
    $stmt->close();
    @http_response_code(404);
    echo json_encode(['status' => 'error', 'error' => 'Plant not found']);
    return;
}

$stmt->close();

@http_response_code(200);

echo json_encode(['status' => 'success', 'updated' => $today]);

