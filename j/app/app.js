define([
	'jquery',
	'app/levels',
	'app/utils',
	'app/timer',
	'bootstrap',
	'bootstrap-slider',
	'underscore',
	'filesaver',
	'three',
	'three.GeometryExporter',
	'three.CSG',
	'three.TrackballControls'
], function ($, levels, Utils, Timer) {

var VIEW_ANGLE = 45,
	NEAR = 0.1,
	FAR = 10000,
	OFFSET = 0.1;

var NO_STAR = "&#9734;&#9734;&#9734;",
	ONE_STAR = "&#9733;&#9734;&#9734;",
	TWO_STAR = "&#9733;&#9733;&#9734;",
	THREE_STAR = "&#9733;&#9733;&#9733;";

var App = function(options) {

	var that = {
	// Instance variables
	$container: null,
	renderer: null,
	camera: null,
	scene: null,
	mode: '',

	radius: 5,
	depth: 10,
	cutInverse: false,

	resetCount: 0,

	curSample: 0,
	curLevel: 0,

	initialize: function(options) {
		options = options || {};

		this.HEIGHT = options.height;
		this.WIDTH = options.width;
		this.locked = options.locked || false;

		this.$container = $(options.htmlContainer);

		this.renderer = new THREE.WebGLRenderer({ antialias: true });
		this.renderer.setSize(this.WIDTH, this.HEIGHT);
		this.$canvas = $(this.renderer.domElement);
		this.$container.children('h4').after(this.renderer.domElement);

		this.scene = new THREE.Scene();

		this.camera = new THREE.PerspectiveCamera(VIEW_ANGLE, this.WIDTH/this.HEIGHT, NEAR, FAR);

		// The camera starts at 0,0,0 so pull it back
		this.camera.position.z = 200;

		// create a point light
		this.pointLight = new THREE.PointLight(0xffffff);
		this.scene.add(this.pointLight);

		this.controls = new THREE.TrackballControls(this.camera, $('.belly')[0]);
		var controls = this.controls;
		// controls.enabled = false;
		controls.rotateSpeed = 2.0;
		controls.zoomSpeed = 1.2;
		controls.panSpeed = 0.8;
		// controls.noZoom = true;
		// controls.noPan = true;
		controls.staticMoving = true;
		controls.dynamicDampingFactor = 0.3;
		controls.keys = [ 65, 83, 68 ];
		this.controls.addEventListener('change', _.bind(this.render, this));

		this.material = new THREE.MeshPhongMaterial({
			color: 'silver'
		});

		this.size = size = 100;
		var cube = this.reset(false);

		this.fake = cube.clone();
		this.fake.visible = false;
		this.scene.add(this.fake);

		this.grid = this.generateGrid(size);
		this.scene.add(this.grid);

		this.setView('isometric');

		this.animate(); // Begin animation loop

		var highlighted = null;
		var line = this.line();
		line.visible = false;
		this.scene.add(line);
		var circle = this.circle();

		var plane = null;

		this.$canvas.on('click', function(event) {
			event.preventDefault();

			if (that.locked) {
				return;
			}

			var target = event.target;

			var ray = Utils.clickToRay(event.clientX-target.offsetLeft, event.clientY-target.offsetTop, that.WIDTH, that.HEIGHT, that.camera);

			var intersects = ray.intersectObjects(that.intersectsMode());

			if (intersects.length == 0) {
				if (highlighted) {
					that.scene.remove(highlighted);
					highlighted = null;
				}

				return;
			}

			var i = intersects[0];
			var pt = i.point;
			var normal = i.face.normal;

			if (!Utils.isXYZ(normal)) {
				return;
			}

			switch (that.mode) {
			case 'drill':

				var output = that.subtract(that.piece, that.drill({
					radius: that.radius,
					position: pt,
					depth: that.size * 2,
					normal: normal
				}));
				that.redrawPiece(output);

				window.timer.subtractTime(0.013 * Math.PI * that.radius * that.radius * 100);

				break;

			case 'mill':

				if (highlighted) {
					var startPt = highlighted.position.sub(normal.clone().multiplyScalar(OFFSET)); // reverse the offset

					that.scene.remove(highlighted);
					highlighted = null;

					if (!highlightedNormal.equals(normal)) {
						break;
					}

					var mill = that.mill({
						start: startPt,
						end: pt,
						length: that.radius*2,
						depth: that.depth*2,
						normal: normal
					});

					if (mill) {
						var output = that.subtract(that.piece, mill);
						that.redrawPiece(output);

						window.timer.subtractTime(0.020 * (Math.PI*that.radius*that.radius + 2*that.radius*startPt.distanceTo(pt)) * that.depth);
					}

				} else {
					// var x = that.cross({color: 0xff0000});
					var x = that.circle({
						radius: that.radius
					});
					x.position = pt.clone().add(normal.clone().multiplyScalar(OFFSET)); // offset so the cross shows up
					x.rotation = normal.clone().applyMatrix3(Utils.YXZMatrix()).multiplyScalar(Math.PI/2);
					that.scene.add(x);
					that.render();
					highlighted = x;
					highlightedNormal = normal;
				}

				break;
			case 'saw':

				if (plane) {
					var dir = normal.clone().applyMatrix3(Utils.ZXYMatrix());
					var length = that.size
					var position = plane.position.clone();
					var shift = dir.multiplyScalar(length/2);

					if (that.cutInverse) {
						shift = Utils.map(shift, function(a) {return -1*a;});
					}

					var saw = that.saw({
						normal: normal,
						position: position.sub(shift),
						length: length
					});
					saw.rotation = plane.rotation.clone().applyMatrix3(Utils.YZXMatrix());
					var output = that.subtract(that.piece, saw);
					that.redrawPiece(output);

					window.timer.subtractTime(240);
				}

				break;
			}

			if (window.timer.timeLeft == 0) {
				$('#outoftime').modal();
				that.resetLevel();
			}

		});

		this.$canvas.on('mousemove', function(event) {
			event.preventDefault();

			if (that.locked) {
				return;
			}

			var target = event.target;

			var ray = Utils.clickToRay(event.clientX-target.offsetLeft, event.clientY-target.offsetTop, that.WIDTH, that.HEIGHT, that.camera);

			var intersects = ray.intersectObjects(that.intersectsMode());

			that.scene.remove(circle);
			circle = null;

			that.scene.remove(plane);
			plane = null;

			if (intersects.length == 0) {
				line.visible = false;
				that.render();
				// that.$canvas.css('cursor', '');
				return;
			}

			// that.$canvas.css('cursor', 'crosshair');

			var i = intersects[0];
			var pt = i.point;
			var normal = i.face.normal;

			if (!Utils.isXYZ(normal)) {
				line.visible = false;
				return;
			}

			switch (that.mode) {
			case 'drill':
				line.visible = true;
				line.geometry.verticesNeedUpdate = true;
				line.geometry.vertices = [
					pt.clone().add(normal.clone().multiplyScalar(-500)),
					pt.clone().add(normal.clone().multiplyScalar(500))
				];

				circle = that.circle({
					radius: that.radius
				});
				circle.position = pt.clone().add(normal.clone().multiplyScalar(OFFSET));
				circle.rotation = normal.clone().applyMatrix3(Utils.YXZMatrix()).multiplyScalar(Math.PI/2);
				that.scene.add(circle);
				break;

			case 'mill':
				if (highlighted) {
					var startPt = highlighted.position;
					line.visible = true;
					line.geometry.verticesNeedUpdate = true;
					line.geometry.vertices = [
						startPt.clone().add(normal.clone().multiplyScalar(OFFSET)),
						pt.clone().add(normal.clone().multiplyScalar(OFFSET))
					];
				} else {
					circle = that.circle({
						radius: that.radius
					});
					circle.position = pt.clone().add(normal.clone().multiplyScalar(OFFSET));
					circle.rotation = normal.clone().applyMatrix3(Utils.YXZMatrix()).multiplyScalar(Math.PI/2);
					that.scene.add(circle);
				}

				break;

			case 'saw':
				plane = that.plane({
					segments: 5,
					size: 200,
					normal: normal,
					material: new THREE.MeshBasicMaterial({
						color:'red',
						wireframe: true,
						wireframeLinewidth: 2
					})
				});
				plane.position = pt.clone().sub(normal.clone().multiplyScalar(that.size/2));
				plane.rotation = normal.clone().applyMatrix3(Utils.ZYXMatrix()).multiplyScalar(Math.PI/2);
				that.scene.add(plane);

				var sign = that.cutInverse ? 1 : -1;
				var dir = normal.clone().applyMatrix3(Utils.ZXYMatrix());
				line.visible = true;
				line.geometry.verticesNeedUpdate = true;
				line.geometry.vertices = [
					pt.clone().add(dir.clone().multiplyScalar(OFFSET)),
					pt.clone().add(dir.clone().multiplyScalar(sign*that.size*2))
				];
				break;
			}

			that.render();

		});
	},

	op: function(raw, cut, op) {
		var rawBSP = new ThreeBSP(raw),
			cutBSP = new ThreeBSP(cut);

		var bsp = rawBSP[op](cutBSP);
		var result = bsp.toMesh(raw.material);
		result.geometry.computeVertexNormals();
		return result;
	},

	subtract: function(raw, cut) {
		return this.op(raw, cut, 'subtract');
	},

	union: function() {
		var result = arguments[0];
		for (var i=1; i < arguments.length; i++) {
			result = this.op(result, arguments[i], 'union');
		}
		return result;
	},

	intersect: function(raw, cut) {
		return this.op(raw, cut, 'intersect');
	},

	render: function() {
		this.renderer.render(this.scene, this.camera);
	},

	animate: function() {
		requestAnimationFrame(_.bind(this.animate, this));
		if (this.controls)
			this.controls.update();
		this.pointLight.position = this.camera.position;
	},

	redrawPiece: function(newPiece) {
		if (this.piece)
			this.scene.remove(this.piece);
		this.oldPiece = this.piece;
		this.piece = newPiece;
		this.scene.add(this.piece);
		this.render();
	},

	undo: function() {
		if (this.oldPiece) {
			this.redrawPiece(this.oldPiece);
		}
	},

	line: function(options) {
		options = options || {};
		var vertices = options.vertices || [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1)];

		var geometry = new THREE.Geometry();
		geometry.vertices = vertices;

		var redLineMaterial = new THREE.LineBasicMaterial({
			color: options.color || 0xff0000,
			linewidth: options.width || 2
		});
		return new THREE.Line(geometry, redLineMaterial);
	},

	cross: function(options) {
		var lineMaterial = new THREE.LineBasicMaterial({
			color: 0xff0000
		});
		var cross = new THREE.Object3D();
		var crossGeometry, crossLine;

		crossGeometry = new THREE.Geometry();
		crossGeometry.vertices = [new THREE.Vector3(1, 1, 0), new THREE.Vector3(-1, -1, 0)];
		crossLine = new THREE.Line(crossGeometry, lineMaterial);
		cross.add(crossLine);

		crossGeometry = new THREE.Geometry();
		crossGeometry.vertices = [new THREE.Vector3(1, -1, 0), new THREE.Vector3(-1, 1, 0)];
		crossLine = new THREE.Line(crossGeometry, lineMaterial);
		cross.add(crossLine);

		return cross;
	},

	circle: function(options) {
		options = options || {};

		var resolution = options.segments || 32;
		var radius = options.radius || 4;
		var size = 360 / resolution;

		var geometry = new THREE.Geometry();
		var material = new THREE.LineBasicMaterial({
			color: options.color || 0xff0000,
			opacity: 1.0,
			linewidth: 2.0
		});

		for (var i = 0; i <= resolution; i++) {
		    var segment = (i * size) * Math.PI / 180;
		    geometry.vertices.push(new THREE.Vector3(Math.cos(segment)*radius, Math.sin(segment)*radius, 0));
		}

		return new THREE.Line( geometry, material);
	},

	plane: function(options) {
		options = options || {};

		var size = options.size;
		var material = options.material || new THREE.MeshBasicMaterial({
			color: options.color
		});
		var segments = options.segments || 10;
		var plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size, segments, segments), material);

		return plane;
	},

	drill: function(options) {
		var size = options.radius,
			depth = options.depth,
			normal = options.normal.clone();
		var cylinderGeometry = new THREE.CylinderGeometry(size, size, depth, 16, 16, false);
		var cylinder = new THREE.Mesh(cylinderGeometry, this.material);
		cylinder.rotation = normal.applyMatrix3(Utils.ZYXMatrix()).multiplyScalar(Math.PI/2);
		cylinder.position = options.position;
		return cylinder;
	},

	mill: function(options) {
		var start = options.start,
			end = options.end,
			normal = options.normal;

		if (Utils.roughlyEquals(start, end)) {
			end = start.clone().add(Utils.iNormal(normal).multiplyScalar(0.05));
		}

		var l1 = Utils.getProjection(start, normal);
		var l2 = Utils.getProjection(end, normal);
		var l = l1.clone().sub(l2);
		var dist = l1.distanceTo(l2);

		var mRot, angle;
		if (l.z == 0) {
			angle = Math.PI/2+Math.atan2(l.y, l.x);
			mRot = Utils.XYZMatrix();
		} else if (l.y == 0) {
			angle = Math.atan2(l.z, l.x);
			mRot = Utils.XZYMatrix();
		} else if (l.x == 0) {
			angle = Math.PI-Math.atan2(l.y, l.z);
			mRot = Utils.ZYXMatrix();
		} else {
			return null; // not valid
		}

		var rotation = Utils.map(normal, Math.abs).applyMatrix3(Utils.YXZMatrix()).multiplyScalar(Math.PI/2);
		rotation.add(Utils.map(normal, Math.abs).applyMatrix3(mRot).multiplyScalar(angle));

		var cubeGeometry = new THREE.CubeGeometry(dist, options.length, options.depth);
		var cube = new THREE.Mesh(cubeGeometry, this.material);
		cube.rotation = rotation;
		cube.position = Utils.getMidpoint(start, end);

		var round1 = this.drill({
			radius: options.length/2,
			depth: options.depth,
			normal: normal,
			position: start.clone()
		});

		var round2 = this.drill({
			radius: options.length/2,
			depth: options.depth,
			normal: normal,
			position: end.clone()
		});

		return this.union(round1, round2, cube);
	},

	saw: function(options) {
		options = options || {};

		var normal = options.normal;
		var position = options.position;
		var length = options.length;

		var cubeGeometry = new THREE.CubeGeometry(this.size*2, length, this.size*2);
		var cube = new THREE.Mesh(cubeGeometry, this.material);
		cube.rotation = Utils.map(normal, Math.abs).applyMatrix3(Utils.YXZMatrix()).multiplyScalar(Math.PI/2);
		cube.position = position;

		return cube;
	},

	sander: function(options) {

	},

	generateGrid: function(size) {
		var plane = this.plane({
			size: size,
			segments: 10,
			material: new THREE.MeshBasicMaterial({
				color:'greenyellow',
				wireframe: true,
				wireframeLinewidth: 2
			})
		});

		var group = new THREE.Object3D();

		_.each(Utils.XYZNormals(), function(normal) {
			var face,
				rot = normal.clone().multiplyScalar(Math.PI/2),
				pos = normal.clone().applyMatrix3(Utils.YXZMatrix()).multiplyScalar(size/2);

			face = plane.clone();
			face.rotation = rot;
			face.position = pos;
			group.add(face);

			face = face.clone();
			face.position.multiplyScalar(-1);
			group.add(face);
		});

		return group;
	},

	showGrid: function(show) {
		_.each(this.grid.children, function(mesh) {
			mesh.visible = show;
		});
		this.render();
	},

	export: function(download) {
		var obj = (new THREE.GeometryExporter()).parse(this.piece.geometry);
		var json = JSON.stringify(obj);
		if (download === true) {
			var blob = new Blob([json], {type: "text/plain;charset=utf-8"});
			var name = prompt('What would you like to name this file?');
			if (name) {
				saveAs(blob, name+'.json');
			}
		}
		return json;
	},

	import: function(json) {
		var parsed;
		if (typeof json === 'string') {
			parsed = (new THREE.JSONLoader()).parse(JSON.parse(json));
		} else {
			parsed = json;
		}
		var mesh = new THREE.Mesh(parsed.geometry, this.material);
		return mesh;
	},

	reset: function(count) {
		var size = this.size;
		var cube = new THREE.Mesh(new THREE.CubeGeometry(size,size,size), this.material);
		this.redrawPiece(cube);
		if (count !== false)
			this.resetCount++;
		return cube;
	},

	setMode: function(mode) {
		this.mode = mode;
	},

	setView: function(view) {
		this.controls.reset();
		switch (view) {
			case 'isometric' :
				this.camera.position.set(150, 150, 150);
				break;
			case 'front' :
				this.camera.position.set(0, 0, 200);
				break;
			case 'right' :
				this.camera.position.set(200, 0, 0);
				break;
			case 'top' :
				this.camera.position.set(0, 200, 0.01); // HACK
				break;
		}
	},

	intersectsMode: function() {
		switch (this.mode) {
		case 'drill' :
		case 'saw' :
			return [this.piece];
		case 'mill' :
			return [this.fake];
		default :
			return [];
		}
	},

	resetLevel: function() {
		console.log('Reset level');
		this.curSample = 0;
		this.loadSample();
		window.timer.reset(levels[this.curLevel].time);

		this.reset(false);
		this.resetCount = 0;

		this.setView('isometric');
	},

	next: function() {
		if (this.curSample == levels[this.curLevel].series.length-1) {
			if (this.curLevel == Object.keys(levels).length-1) {
				console.log('No more levels');
				return;
			}
			this.advanceLevel();
		} else {
			this.advanceSample();
		}
	},

	advanceLevel: function() {
		window.timer.tick();

		var correct = 0, incorrect = 0;
		$('#breakdown td.yours').each(_.bind(function(i, el) {
			var $el = $(el);
			var yours = Math.round(window.timer.ticks[i] / 1000);
			var target = levels[this.curLevel].series[i].time;
			$el.text(yours);
			$el.next().text(target);
			if (Math.abs(yours-target)/target >= 0.25) {
				incorrect += 1;
			} else {
				correct += 1;
			}
		}, this));

		var stars = correct - 0.5 * incorrect - 0.5 * this.resetCount;

		if (stars < 0) {
			$('.rating').html(NO_STAR);
		} else if (stars < 1) {
			$('.rating').html(ONE_STAR);
		} else if (stars < 3) {
			$('.rating').html(TWO_STAR);
		} else if (stars <= 5) {
			$('.rating').html(THREE_STAR);
		}

		$('#levelComplete').modal();
		console.log('Advance level');

		this.curLevel++;
		this.curSample = 0;
		this.loadSample();
		window.timer.reset(levels[this.curLevel].time);

		this.reset(false);
		this.resetCount = 0;
		setViewAll('isometric');
	},

	advanceSample: function() {
		console.log('Advance sample');
		this.curSample++;
		this.loadSample();
		window.timer.tick();
		this.reset(false);

		setViewAll('isometric');
	},

	loadSample: function() {
		var sample = levels[this.curLevel].series[this.curSample];
		$.ajax({
			url: sample.url,
			success: function(data) {
				window.demo.redrawPiece(window.demo.import(data));
			},
			dataType: 'html'
		});
		$('#curLevel').text(this.curLevel+1);
		$('#curSample').text(this.curSample+1);
	}

	};

	that.initialize(options);
	return that;
};

function setViewAll(view) {
	window.app.setView(view);
	window.demo.setView(view);
}

$(function() {

	$('#help').modal();

	window.timer = new Timer({
		barContainer: '#timerBar',
		textContainer: '#timerText',
		startTime: levels[0].time // in seconds
	});

	window.app = new App({
		htmlContainer: '#sandbox',
		width: 460,
		height: 345
	});

	window.demo = new App({
		htmlContainer: '#exhibit',
		width: 300,
		height: 225,
		locked: true
	});

	app.loadSample();

	$('#done').on('click', function(e) {
		e.preventDefault();
		app.next();
	});
	$('#reset').on('click', function(e) {
		e.preventDefault();
		app.reset();
	});
	$('#undo').on('click', function(e) {
		e.preventDefault();
		app.undo();
	});
	$('#export').on('click', function(e) {
		e.preventDefault();
		app.export(true);
	});
	$('#file').on('change', function(e) {
		var file = e.target.files[0];
		var reader = new FileReader();
		reader.onload = (function(theFile) {
			return function(e) {
				demo.redrawPiece(demo.import(e.target.result));
			}
		})(file);
		reader.readAsText(file);
	});

	$('a.tool').on('click', function(e) {
		e.preventDefault();
		var $tool = $(e.target);
		var id = $tool.attr('id');
		$('#currentTool').text($tool.text());
		app.setMode(id);

		$('body').removeClass('selected-mill selected-drill selected-saw').addClass('selected-'+id);

		$('a.tool').each(function(i, el) {
			$(el).removeClass('btn-info');
		});
		$tool.addClass('btn-info');
	});

	var descriptions = {
		mill: 'A rotary tool used for shaping and cutting grooves <a href="http://www.youtube.com/watch?v=j0vRYe9uvnI">YouTube Video</a>',
		saw: 'A power saw used for cutting materials <a href="http://www.youtube.com/watch?v=ZYlLIp5urJQ">YouTube Video</a>',
		drill: 'An upright drilling machine for producing holes <a href="http://www.youtube.com/watch?v=ul20R32HJ3E">YouTube Video</a>'
	};
	$('a.tool').each(function(i, el) {
		var $tool = $(el);
		var i = $tool.attr('id');
		$tool.popover({
			trigger: 'hover',
			container: $tool[0],
			html: true,
			title: $tool.text(),
			content: descriptions[i]
		});
	});

	$('.disabled-tool').popover({
		trigger: 'hover',
		title: 'Not Available',
		content: 'This tool is not available for noobs!'
	});

	$('#gridToggle').on('click', function(e) {
		e.preventDefault();
		var el = $(this);
		var state = el.data('state');
		switch (state) {
			case 'show' :
				app.showGrid(true);
				demo.showGrid(true);
				el.data('state', 'hide');
				el.find('span').text('Hide Grid');
				break;
			case 'hide' :
				app.showGrid(false);
				demo.showGrid(false);
				el.data('state', 'show');
				el.find('span').text('Show Grid');
				break;
		}
	});

	$("#radius").slider({
		value: 6,
		min: 2,
		max: 12,
		step: 2
	}).on('slideStop', function(e) {
		app.radius = e.value;
	});

	$("#depth").slider({
		value: 10,
		min: 2,
		max: 100,
		step: 4
	}).on('slideStop', function(e) {
		app.depth = e.value;
	});

	$('#cutInverse').on('change', function(e) {
		if (this.checked) {
			app.cutInverse = true;
		} else {
			app.cutInverse = false;
		}
	});

	$('.change-view').on('click', function(e) {
		var $el = $(this);
		var view = $el.attr('id');
		setViewAll(view);
	});
});

});