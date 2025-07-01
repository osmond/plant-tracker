<?php
$days = isset($_GET['days']) ? max(1, min(30, intval($_GET['days']))) : 7;
$today = new DateTime('today');
$data = [];
for ($i = 0; $i < $days; $i++) {
    $date = clone $today;
    $date->modify("-$i day");
    $data[] = [
        'date' => $date->format('Y-m-d'),
        'et0_mm' => round(mt_rand(25, 45) / 10, 1)
    ];
}
$data = array_reverse($data);
header('Content-Type: application/json');
echo json_encode($data);

