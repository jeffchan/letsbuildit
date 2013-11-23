/* globals requirejs */

requirejs.config({
  baseUrl: 'j',
  paths: {
    'jquery': [
      '//ajax.googleapis.com/ajax/libs/jquery/2.0.3/jquery.min',
      'lib/jquery-2.0.3'
    ],
    'underscore': 'lib/underscore',
    'filesaver': 'lib/FileSaver',
    'bootstrap': 'lib/bootstrap.min',
    'bootstrap-slider': 'lib/bootstrap-slider',
    'three': 'three/three.min',
    'three.CSG': 'three/ThreeCSG',
    'three.TrackballControls': 'three/TrackballControls',
  },
  shim: {
    'underscore': { exports: '_' },
    'three': { exports: 'THREE' },
    'three.CSG': { deps: ['three'], exports: 'ThreeBSP' },
    'three.TrackballControls': { deps: ['three'] },
    'bootstrap': { deps: ['jquery'] },
    'bootstrap-slider': { deps: ['jquery', 'bootstrap'] }
  }
});

requirejs(['app']);
