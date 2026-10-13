<?php
require_once __DIR__ . '/../db.php';
require_method('POST');

start_session();
$_SESSION = [];
session_destroy();

json_response(['success' => true, 'message' => 'Logged out successfully.']);
