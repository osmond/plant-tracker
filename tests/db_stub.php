<?php
if (!class_exists('MockStmt')) {
    class MockStmt {
        public function bind_param(...$args) {}
        public function bind_result(&...$args) {}
        public function execute() { return true; }
        public function fetch() { return false; }
        public function get_result() { return new MockResult(); }
        public function close() {}
    }
}

if (!class_exists('MockResult')) {
    class MockResult {
        public function fetch_assoc() {
            global $mock_query_result;
            if (isset($mock_query_result) && count($mock_query_result) > 0) {
                return array_shift($mock_query_result);
            }
            return null;
        }
    }
}

if (!class_exists('MockMysqli')) {
    class MockMysqli {
        public $connect_error = '';
        public function prepare($query) {
            return new MockStmt();
        }
    }
}

$conn = new MockMysqli();
?>
