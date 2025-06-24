<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);
$dbConfig = getenv('DB_CONFIG');
if ($dbConfig && file_exists($dbConfig)) {
    include $dbConfig;
} else {
    include '../db.php';
}

if (!headers_sent()) {
    header('Content-Type: application/json');
}

$data = [];
$stmt = $conn->prepare(
    "SELECT plant_id,
            SUM(event_type='watered') AS watered,
            SUM(event_type='fertilized') AS fertilized
       FROM plant_events
      GROUP BY plant_id"
);
if ($stmt && $stmt->execute()) {
    $result = $stmt->get_result();
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $data[] = $row;
        }
    }
    $stmt->close();
}

echo json_encode($data);
?>
