<?php
// Simple migration runner

include __DIR__ . '/../db.php';

// Ensure migrations table exists
$createTable = "CREATE TABLE IF NOT EXISTS migrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) UNIQUE,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)";
if (!$conn->query($createTable)) {
    fwrite(STDERR, "Failed to create migrations table: {$conn->error}\n");
    exit(1);
}

// Get applied migrations
$applied = [];
$result = $conn->query("SELECT filename FROM migrations");
if ($result) {
    while ($row = $result->fetch_assoc()) {
        $applied[$row['filename']] = true;
    }
    $result->free();
}

// Find migration files
$files = glob(__DIR__ . '/../migrations/*.sql');
sort($files);

foreach ($files as $file) {
    $name = basename($file);
    if (isset($applied[$name])) {
        echo "Skipping $name\n";
        continue;
    }
    $sql = file_get_contents($file);
    if ($conn->multi_query($sql)) {
        // flush remaining results for multi_query
        while ($conn->more_results() && $conn->next_result()) { /* flush */ }
        $stmt = $conn->prepare("INSERT INTO migrations (filename) VALUES (?)");
        if ($stmt) {
            $stmt->bind_param('s', $name);
            $stmt->execute();
            $stmt->close();
        }
        echo "Applied $name\n";
    } else {
        fwrite(STDERR, "Error applying $name: {$conn->error}\n");
        exit(1);
    }
}

echo "Migrations complete.\n";
$conn->close();
?>
