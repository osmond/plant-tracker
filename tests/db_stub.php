<?php
if (!class_exists('MockStmt')) {
    class MockStmt {
        public function bind_param(...$args) {}
        public function execute() { return true; }
        public function close() {}
        public function get_result() {
            return new class {
                public function fetch_assoc() { return null; }
            };
        }
    }
}

if (!class_exists('MockMysqli')) {
    class MockMysqli {
        public $connect_error = '';
        public function prepare($query) {
            return new MockStmt();
        }
        public function query($query) {
            return new class {
                public function fetch_assoc() {
                    return null;
                }
            };
        }
    }
}

$conn = new MockMysqli();
?>
