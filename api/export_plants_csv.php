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
    header('Content-Type: text/csv');
    header('Content-Disposition: attachment; filename="plants.csv"');
}

$archived = isset($_GET['archived']) && $_GET['archived'] == '1' ? 1 : 0;
$stmt = $conn->prepare(
    "SELECT id, name, species, plant_type, watering_frequency, fertilizing_frequency, room, last_watered, last_fertilized, photo_url, water_amount, archived FROM plants WHERE archived = ? ORDER BY id DESC"
);
if (!$stmt) {
    @http_response_code(500);
    if ($debug) {
        echo 'Database error: ' . $conn->error;
    }
    return;
}
$stmt->bind_param('i', $archived);
if (!$stmt->execute()) {
    @http_response_code(500);
    if ($debug) {
        echo 'Database error: ' . $stmt->error;
    }
    return;
}
$res = $stmt->get_result();
$out = fopen('php://output', 'w');

fputcsv($out, [
    'id',
    'name',
    'species',
    'plant_type',
    'watering_frequency',
    'fertilizing_frequency',
    'room',
    'last_watered',
    'last_fertilized',
    'photo_url',
    'water_amount',
    'archived'
]);
while ($row = $res->fetch_assoc()) {
    fputcsv($out, $row);
}
fclose($out);
$stmt->close();
?>
