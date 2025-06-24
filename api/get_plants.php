<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);
$dbConfig = getenv('DB_CONFIG');
if ($dbConfig && file_exists($dbConfig)) {
    include $dbConfig;
} else {
    include '../db.php';
}

header('Content-Type: application/json');

$plants = [];
$result = $conn->query("
    SELECT id, name, species, watering_frequency, fertilizing_frequency, room, last_watered, last_fertilized, notes, photo
    FROM plants 
    ORDER BY id DESC
");

while ($row = $result->fetch_assoc()) {
    $plants[] = $row;
}

echo json_encode($plants);
?>
