<?php
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

$plants = [];
$result = $conn->query(
    "SELECT id, name, species, watering_frequency, fertilizing_frequency, room, last_watered, last_fertilized, photo_url, water_amount
    FROM plants
    ORDER BY id DESC"
);
if (!$result) {
    @http_response_code(500);
    echo json_encode(['error' => 'Database error', 'details' => $conn->error]);
    return;
}

while ($row = $result->fetch_assoc()) {
    $plants[] = $row;
}

echo json_encode($plants);
?>
