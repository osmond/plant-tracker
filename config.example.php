<?php
return [
    'openweather_key' => 'YOUR_API_KEY',
    'location'        => 'City,Country',
    'ra'              => 20.0,
    'kc'              => 0.8,
    'kc_map' => [
        'succulent'  => 0.3,
        'houseplant' => 0.8,
        'vegetable'  => 1.0,
        'cacti'      => 0.28,
    ],
    'bed_map' => [
        'vegetable' => [
            'kcb' => [
                'ini' => 0.3,
                'mid' => 1.05,
                'end' => 0.95,
            ],
            'kc_soil' => 1.1,
        ],
        'flower' => [
            'kcb' => [
                'ini' => 0.35,
                'mid' => 1.1,
                'end' => 1.0,
            ],
            'kc_soil' => 1.05,
        ],
    ],
];
