var VIEW_ANGLE = 45,
	NEAR = 0.1,
	FAR = 10000,
	OFFSET = 0.05;

var Utils = {

	clickToRay: function(x, y, width, height, camera) {
		var projector = new THREE.Projector();
		var mouseX = (x / width) * 2 - 1,
			mouseY = - (y / height) * 2 + 1;
		var vector = new THREE.Vector3(mouseX, mouseY, 0.5);
		projector.unprojectVector(vector, camera);
		return new THREE.Raycaster(camera.position, vector.sub(camera.position).normalize());
	},

	deg2rad: function(degree) { return degree*(Math.PI/180); },

	getPMatrix: function(v) {
		var a = v.x, b = v.y, c = v.z;
		return new THREE.Matrix3(b*b+c*c, -a*b, -a*c, -b*a, a*a+c*c, -b*c, -c*a, -c*b, a*a+b*b);
	},

	getProjection: function(v, normal) {
		return v.clone().applyMatrix3(Utils.getPMatrix(normal));
	},

	getAngle: function(v1, v2) {
		return Math.acos(v1.dot(v2)/(v1.length()*v2.length()));
	},

	getMidpoint: function(v1, v2) {
		return v1.clone().add(v2).divideScalar(2);
	},

	map: function(v, f) {
		return new THREE.Vector3(f(v.x), f(v.y), f(v.z));
	},

	isXYZ: function(v) {
		v = Utils.map(v, Math.abs);
		return (v.x == 0 && v.y == 0 && v.z == 1) ||
				(v.x == 0 && v.y == 1 && v.z == 0) ||
				(v.x == 1 && v.y == 0 && v.z == 0);
	},

	iNormal: function(v) {
		v = Utils.map(v, Math.abs);
		return (new THREE.Vector3(1,1,1)).sub(v);
	},

	XYZMatrix: new THREE.Matrix3(1, 0, 0, 0, 1, 0, 0, 0, 1),
	XZYMatrix: new THREE.Matrix3(1, 0, 0, 0, 0, 1, 0, 1, 0),
	YXZMatrix: new THREE.Matrix3(0, 1, 0, 1, 0, 0, 0, 0, 1),
	ZYXMatrix: new THREE.Matrix3(0, 0, 1, 0, 1, 0, 1, 0, 0),


};

var App = function(options) {

	var that = {
	// Instance variables
	$container: null,
	renderer: null,
	camera: null,
	scene: null,
	mode: 'mill',

	radius: 5,

	initialize: function(options) {
		options = options || {};

		this.HEIGHT = options.height;
		this.WIDTH = options.width;

		this.$container = $(options.htmlContainer);

		this.renderer = new THREE.WebGLRenderer({ antialias: true });
		this.renderer.setSize(this.WIDTH, this.HEIGHT);
		this.$container.append(this.renderer.domElement);

		this.scene = new THREE.Scene();

		this.camera = new THREE.PerspectiveCamera(VIEW_ANGLE, this.WIDTH/this.HEIGHT, NEAR, FAR);

		// The camera starts at 0,0,0 so pull it back
		this.camera.position.z = 250;

		// create a point light
		this.pointLight = new THREE.PointLight(0xFFFFFF);
		this.pointLight.position.set(0, 50, 130);
		this.scene.add(this.pointLight);

		this.controls = new THREE.TrackballControls(this.camera);
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

		this.material = new THREE.MeshNormalMaterial({
			color: 'silver'
		});
		var size = 100;
		var cubeGeometry = new THREE.CubeGeometry(size,size,size);
		var cube = new THREE.Mesh(cubeGeometry, this.material);
		// cube.position.set(size/2, size/2, 0);
		this.redrawPiece(cube);

		this.fake = cube.clone();
		this.fake.visible = false;
		this.scene.add(this.fake);

		this.animate(); // Begin animation loop
		var highlighted = null;

		this.$container.on('click', function(event) {
			event.preventDefault();

			var ray = Utils.clickToRay(event.clientX, event.clientY, that.WIDTH, that.HEIGHT, that.camera);
			var intersects = ray.intersectObjects([that.fake]);

			if (intersects.length == 0) {
				if (highlighted) {
					that.scene.remove(highlighted);
					highlighted = null;
				}

				return;
			}

			var i = intersects[0];
			console.log(i);
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
						depth: 1000,
						normal: normal
					}));
					that.redrawPiece(output);
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
							depth: 30,
							normal: normal
						});

						if (mill) {
							var output = that.subtract(that.piece, mill);
							that.redrawPiece(output);
						}

					} else {
						// var x = that.cross({color: 0xff0000});
						var x = that.circle({
							radius: that.radius
						});
						x.position = pt.clone().add(normal.clone().multiplyScalar(OFFSET)); // offset so the cross shows up
						x.rotation = normal.clone().applyMatrix3(Utils.YXZMatrix).multiplyScalar(Math.PI/2);
						that.scene.add(x);
						that.render();
						highlighted = x;
						highlightedNormal = normal;
					}

					break;
			}

		});


		var line = this.line();
		line.visible = false;
		this.scene.add(line);

		var circle = this.circle();

		this.$container.on('mousemove', function(event) {
			event.preventDefault();

			var ray = Utils.clickToRay(event.clientX, event.clientY, that.WIDTH, that.HEIGHT, that.camera);
			var intersects = ray.intersectObjects([that.fake]);

			that.scene.remove(circle);

			if (intersects.length == 0) {
				line.visible = false;
				that.render();
				return;
			}

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
					circle.rotation = normal.clone().applyMatrix3(Utils.YXZMatrix).multiplyScalar(Math.PI/2);
					that.scene.add(circle);
					break;

				case 'mill':
					if (highlighted) {
						var startPt = highlighted.position;
						line.visible = true;
						line.geometry.verticesNeedUpdate = true;
						line.geometry.vertices = [
							startPt.clone().add(normal.clone().multiplyScalar(0.05)),
							pt.clone().add(normal.clone().multiplyScalar(0.05))
						];
					}

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
		this.piece = newPiece;
		this.scene.add(this.piece);
		this.render();
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
			opacity: 1.0
		});

		for (var i = 0; i <= resolution; i++) {
		    var segment = (i * size) * Math.PI / 180;
		    geometry.vertices.push(new THREE.Vector3(Math.cos(segment)*radius, Math.sin(segment)*radius, 0));
		}

		return new THREE.Line( geometry, material);
	},

	drill: function(options) {
		var size = options.radius,
			depth = options.depth,
			normal = options.normal.clone();
		var cylinderGeometry = new THREE.CylinderGeometry(size, size, depth, 16, 16, false);
		var cylinder = new THREE.Mesh(cylinderGeometry, this.material);
		cylinder.rotation = normal.applyMatrix3(Utils.ZYXMatrix).multiplyScalar(Math.PI/2);
		cylinder.position = options.position;
		return cylinder;
	},

	mill: function(options) {
		var start = options.start,
			end = options.end,
			normal = options.normal;

		if (start.equals(end)) {
			end = start.clone().add(Utils.iNormal(normal).multiplyScalar(0.05));
		}

		var l1 = Utils.getProjection(start, normal);
		var l2 = Utils.getProjection(end, normal);
		var l = l1.clone().sub(l2);
		var dist = l1.distanceTo(l2);

		var mRot, angle;
		if (l.z == 0) {
			angle = Math.PI/2+Math.atan2(l.y, l.x);
			mRot = Utils.XYZMatrix;
		} else if (l.y == 0) {
			angle = Math.atan2(l.z, l.x);
			mRot = Utils.XZYMatrix;
		} else if (l.x == 0) {
			angle = Math.PI-Math.atan2(l.y, l.z);
			mRot = Utils.ZYXMatrix;
		} else {
			return null; // not valid
		}

		var rotation = Utils.map(normal, Math.abs).applyMatrix3(Utils.YXZMatrix).multiplyScalar(Math.PI/2);
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

	sander: function(options) {

	},

	saw: function() {

	},

	export: function(download) {
		var obj = (new THREE.GeometryExporter()).parse(this.piece.geometry);
		var json = JSON.stringify(obj);
		if (download === true) {
			var blob = new Blob([json], {type: "text/plain;charset=utf-8"});
			var name = prompt('What would you like to name this file?');
			saveAs(blob, name+'.json');
		}
		return json;
	},

	import: function(json) {
		var parsed = (new THREE.JSONLoader()).parse(JSON.parse(json));
		var mesh = new THREE.Mesh(parsed.geometry, this.material);
		return mesh;
	},

	setMode: function(mode) {
		this.mode = mode;
	}

	};

	that.initialize(options);
	return that;
};