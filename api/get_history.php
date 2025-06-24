<?php
$dbConfig = getenv('DB_CONFIG');
if ($dbConfig && file_exists($dbConfig)) {
    include $dbConfig;
} else {
    include '../db.php';
}

header('Content-Type: application/json');

$result = $conn->query(
    "SELECT name, watering_frequency, fertilizing_frequency FROM plants"
);

$plants = [];
$waterTotal = 0;
$fertTotal = 0;
$count = 0;
while ($row = $result->fetch_assoc()) {
    $row['watering_frequency'] = (int)$row['watering_frequency'];
    $row['fertilizing_frequency'] = (int)$row['fertilizing_frequency'];
    $plants[] = $row;
    $waterTotal += $row['watering_frequency'];
    $fertTotal += $row['fertilizing_frequency'];
    $count++;
}

usort($plants, function($a, $b) {
    return $a['watering_frequency'] <=> $b['watering_frequency'];
});

$data = [
    'mostWatered' => $plants,
    'averages' => [
        'watering' => $count ? $waterTotal / $count : 0,
        'fertilizing' => $count ? $fertTotal / $count : 0
    ]
];

echo json_encode($data);
?>
