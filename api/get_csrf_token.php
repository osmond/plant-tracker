<?php
require_once __DIR__ . '/../csrf.php';
if (!headers_sent()) {
    header('Content-Type: application/json');
}
echo json_encode(['token' => csrf_get_token()]);

