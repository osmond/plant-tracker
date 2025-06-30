<?php
class FailMysqli {
    public $error = 'Simulated DB error';
    public function prepare($query) {
        return false; // simulate failure
    }
    public function query($query) {
        return false; // simulate failure
    }
}

$conn = new FailMysqli();
?>
