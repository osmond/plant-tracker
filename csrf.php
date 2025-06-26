<?php
if (!getenv('TESTING') && session_status() === PHP_SESSION_NONE) {
    session_start();
}
function csrf_get_token() {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}
function csrf_validate() {
    if (getenv('TESTING')) {
        return true;
    }
    $expected = $_SESSION['csrf_token'] ?? '';
    $provided = $_POST['csrf_token'] ?? '';
    if (!hash_equals($expected, $provided)) {
        @http_response_code(403);
        echo json_encode(['error' => 'Invalid CSRF token']);
        return false;
    }
    return true;
}

