<?php
$dbConfig = getenv('DB_CONFIG');
if ($dbConfig && file_exists($dbConfig)) {
    include $dbConfig;
} else {
    include '../db.php';
}

if (session_status() === PHP_SESSION_NONE) {
    @session_start();
}
if (!headers_sent()) {
    header('Content-Type: application/json');
}

$username = trim($_POST['username'] ?? '');
$password = $_POST['password'] ?? '';

if ($username === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing credentials']);
    return;
}

$stmt = $conn->prepare('SELECT id, password_hash FROM users WHERE username = ?');
if (!$stmt) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error', 'details' => $conn->error]);
    return;
}
$stmt->bind_param('s', $username);
if (!$stmt->execute()) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error', 'details' => $stmt->error]);
    return;
}
$result = $stmt->get_result();
$user = $result ? $result->fetch_assoc() : null;
$stmt->close();

if (!$user || !password_verify($password, $user['password_hash'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid credentials']);
    return;
}

$_SESSION['user_id'] = $user['id'];
http_response_code(200);

echo json_encode(['status' => 'success', 'user_id' => $user['id']]);
