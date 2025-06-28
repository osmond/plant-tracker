<?php
return [
    'openweather_key' => '2aa3ade8428368a141f7951420570c16',
    'location'        => 'New Brighton,MN,US',
    'ra'              => 20.0,
    'kc'              => 0.8,
    'kc_map' => [
        'succulent'  => 0.3,
        'houseplant' => 0.8,
        'vegetable'  => 1.0,
        'cacti'      => 0.28,
        'flower'     => 0.9,
        'citrus'     => 0.7,
        'cannabis sativa' => 0.9,
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
        'cannabis sativa' => [
            'kcb' => [
                'ini' => 0.5,
                'mid' => 0.9,
                'end' => 1.1,
            ],
            'kc_soil' => 1.05,
        ],
    ],
];
