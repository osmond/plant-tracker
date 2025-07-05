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
    echo json_encode(['status' => 'error', 'error' => 'Unauthorized']);
    if (!getenv('TESTING')) {
        exit;
    }
    return;
}
if (!headers_sent()) {
    header('Content-Type: application/json');
}
$id = isset($_POST['id']) ? intval($_POST['id']) : 0;
$archive = isset($_POST['archive']) && intval($_POST['archive']) ? 1 : 0;
if ($id <= 0) {
    @http_response_code(400);
    echo json_encode(['status' => 'error', 'error' => 'Invalid plant ID']);
    return;
}
$stmt = $conn->prepare("UPDATE plants SET archived = ? WHERE id = ?");
if (!$stmt) {
    @http_response_code(500);
    $response = ['status' => 'error', 'error' => 'Database error'];
    if ($debug) {
        $response['details'] = $conn->error;
    }
    echo json_encode($response);
    return;
}
$stmt->bind_param('ii', $archive, $id);
if (!$stmt->execute()) {
    @http_response_code(500);
    $response = ['status' => 'error', 'error' => 'Database error'];
    if ($debug) {
        $response['details'] = $stmt->error;
    }
    echo json_encode($response);
    return;
}
@http_response_code(200);
echo json_encode(['status' => 'success']);
?>
