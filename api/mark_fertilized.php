<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);
$dbConfig = getenv('DB_CONFIG');
if ($dbConfig && file_exists($dbConfig)) {
    include $dbConfig;
} else {
    include '../db.php';
}

$id = intval($_POST['id']);
$snooze = isset($_POST['snooze_days']) ? intval($_POST['snooze_days']) : 0;

$date = new DateTime();
if ($snooze > 0) {
    $date->modify("+{$snooze} days");
}
$today = $date->format('Y-m-d');

$stmt = $conn->prepare("UPDATE plants SET last_fertilized = ? WHERE id = ?");
$stmt->bind_param("si", $today, $id);
$stmt->execute();
$stmt->close();

echo json_encode(['status' => 'success', 'updated' => $today]);
?>
