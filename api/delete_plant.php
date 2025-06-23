<?php
$dbConfig = getenv('DB_CONFIG');
if ($dbConfig && file_exists($dbConfig)) {
    include $dbConfig;
} else {
    include('../db.php');
}

$id = $_POST['id'] ?? null;

if ($id) {
    $stmt = $conn->prepare("DELETE FROM plants WHERE id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'error' => 'No ID provided']);
}
?>
