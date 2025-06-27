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

$stmt = $conn->prepare("UPDATE plants SET last_watered = ? WHERE id = ?");
if (!$stmt) {
    @http_response_code(500);
    $response = ['status' => 'error', 'error' => 'Database error'];
    if ($debug) {
        $response['details'] = $conn->error;
    }
    echo json_encode($response);
    return;
}
$stmt->bind_param("si", $today, $id);
if (!$stmt->execute()) {
    @http_response_code(500);
    $response = ['status' => 'error', 'error' => 'Database error'];
    if ($debug) {
        $response['details'] = $stmt->error;
    }
    echo json_encode($response);
    return;
}

$affected = $stmt->affected_rows;
$stmt->close();

if ($affected === 0) {
    $check = $conn->prepare("SELECT id FROM plants WHERE id = ?");
    if ($check) {
        $check->bind_param("i", $id);
        if ($check->execute()) {
            $check->store_result();
            if ($check->num_rows === 0) {
                $check->close();
                @http_response_code(404);
                echo json_encode(['status' => 'error', 'error' => 'Plant not found']);
                return;
            }
        }
        $check->close();
    }
}

@http_response_code(200);

echo json_encode(['status' => 'success', 'updated' => $today]);
?>
