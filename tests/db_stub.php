<?php
if (!class_exists('MockStmt')) {
    class MockStmt {
        public function bind_param(...$args) {}
        public function bind_result(&...$args) {}
        public function execute() { return true; }
        public function fetch() { return false; }
        public function close() {}
    }
    class MockResult {
        private $data;
        public function __construct($data) { $this->data = $data; }
        public function fetch_assoc() { return array_shift($this->data); }
    }
}

if (!class_exists('MockMysqli')) {
    class MockMysqli {
        public $connect_error = '';
        public function prepare($query) {
            return new MockStmt();
        }
        public function query($query) {
            global $mockQueryData;
            return new MockResult($mockQueryData ?? []);
        }
    }
}

$conn = new MockMysqli();
?>
