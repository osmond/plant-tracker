<?php
if (!class_exists('MockStmt')) {
    class MockStmt {
        public function bind_param(...$args) {}
        public function execute() { return true; }
        public function close() {}
    }
}

if (!class_exists('MockResult')) {
    class MockResult {
        public function fetch_assoc() {
            return null;
        }
        public function free() {}
    }
}

if (!class_exists('MockMysqli')) {
    class MockMysqli {
        public $connect_error = '';
        public function prepare($query) {
            return new MockStmt();
        }
        public function query($query) {
            return new MockResult();
        }
    }
}

$conn = new MockMysqli();
?>
