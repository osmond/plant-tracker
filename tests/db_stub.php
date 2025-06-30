<?php
if (!class_exists('MockStmt')) {
    class MockStmt {
        public function bind_param(...$args) {}
        public function bind_result(&...$args) {}
        public function execute() { return true; }
        public function fetch() { return false; }
        public function close() {}
    }
}

if (!class_exists('MockResult')) {
    class MockResult {
        public $error = '';
        public function fetch_assoc() { return false; }
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
