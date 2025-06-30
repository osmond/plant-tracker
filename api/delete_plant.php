<?php
$dbConfig = getenv('DB_CONFIG');
if ($dbConfig && file_exists($dbConfig)) {
    include $dbConfig;
} else {
    include('../db.php');
}

$debug = getenv('DEBUG');
if ($debug) {
    ini_set('display_errors', 1);
    error_reporting(E_ALL);
}

if (!headers_sent()) {
    header('Content-Type: application/json');
}

$id = $_POST['id'] ?? null;
$id = filter_var($id, FILTER_VALIDATE_INT);
$photo_url = trim($_POST['photo_url'] ?? '');

if ($id === false || $id <= 0) {
    @http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid plant ID']);
    return;
}

$stmt = $conn->prepare("DELETE FROM plants WHERE id = ?");
if (!$stmt) {
    @http_response_code(500);
    $response = ['success' => false, 'error' => 'Database error'];
    if ($debug) {
        $response['details'] = $conn->error;
    }
    echo json_encode($response);
    return;
}
$stmt->bind_param("i", $id);
if (!$stmt->execute()) {
    @http_response_code(500);
    $response = ['success' => false, 'error' => 'Database error'];
    if ($debug) {
        $response['details'] = $stmt->error;
    }
    echo json_encode($response);
    return;
}

if ($stmt->affected_rows > 0) {
    if ($photo_url !== '') {
        $oldPath = __DIR__ . '/../' . ltrim($photo_url, '/\\');
        $oldReal = realpath($oldPath);
        $uploadsRoot = realpath(__DIR__ . '/../uploads');
        if (
            $oldReal &&
            $uploadsRoot &&
            strpos($oldReal, $uploadsRoot) === 0 &&
            is_file($oldReal)
        ) {
            unlink($oldReal);
        }
    }
    @http_response_code(200);
    echo json_encode(['success' => true]);
} else {
    @http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Plant not found']);
}
?>
