<?php
$dbConfig = getenv('DB_CONFIG');
if ($dbConfig && file_exists($dbConfig)) {
    include $dbConfig;
} else {
    include('../db.php');
}

if (!headers_sent()) {
    header('Content-Type: application/json');
}

$id = $_POST['id'] ?? null;

if (!$id) {
    @http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'No ID provided']);
    return;
}

$stmt = $conn->prepare("DELETE FROM plants WHERE id = ?");
if (!$stmt) {
    @http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database error', 'details' => $conn->error]);
    return;
}
$stmt->bind_param("i", $id);
if (!$stmt->execute()) {
    @http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database error', 'details' => $stmt->error]);
    return;
}

if ($stmt->affected_rows > 0) {
    @http_response_code(200);
    echo json_encode(['success' => true]);
} else {
    @http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Plant not found']);
}
?>
