var path = require('path');
var transformTools = require('browserify-transform-tools');
var Glob = require('glob').Glob;

/*global console */
var logger = function () {
	console.info.apply(console, ['derailify - ']
		.concat(Array.prototype.slice.call(arguments, 0)));
};

var normalizePath = function (p) {
	return p.split(path.sep).join('/');
};

var getReplacement = function (file, aliases) {
	if (aliases[file])
		return aliases[file];

	var fileParts = /^([^\/]*)(\/.*)$/.exec(file);
	var pkg = aliases[fileParts ? fileParts[1] : 0];

	if (pkg)
		return pkg + fileParts[2];
};

/* global process */
var createTransform = function (log) {
	return transformTools.makeRequireTransform('derailify', {
		jsFilesOnly: false,
		fromSourceFileDir: true
	}, function (args, opts, done) {
		if (!opts.config)
			return done(new Error("Bad config."));

		var aliases = opts.config.aliases || {};
		var dir = process.cwd();

		var result;
		var file = args[0];
		var replacement;

		if (file && aliases) {
			replacement = getReplacement(file, aliases);
			if (replacement) {
				if (/^\./.test(replacement)) {
					replacement = normalizePath('./' + path.relative(path.dirname(opts.file), path.resolve(dir, replacement)));
				}
				log(opts.file, ': replacing ', file, ' with ', replacement);
				result = 'require(\'' + replacement.replace(/\\/gi, '/') + '\')';
			}
		}
		return done(null, result);
	});
};

module.exports = function (b, opts) {
	var maps = opts.maps ? opts.maps : [];
	var verbose = !!opts.verbose;
	var log = verbose ? logger : function () {};

	var aliases = {};
	var doneCount = 0;

	var done = function () {
		doneCount++;

		if (doneCount !== maps.length)
			return;

		var numAliases = Object.keys(aliases).length;

		if (numAliases > 0) {
			log('Exposing ', numAliases, ' aliases.');
			b.transform(createTransform(log).configure({
				aliases: aliases
			}));
			return;
		}

		log('No aliases to expose');
	};

	maps.forEach(function (map) {
		var g = new Glob(map.src, map)
			.on('error', function (err) {
				log(err);
				b.emit('error', err);
			})
			.on('match', function (file) {
				file = normalizePath(file);

				var processCwd = process.cwd();
				var cwd = normalizePath(g.cwd || processCwd);
				var transformFilePath = normalizePath('./' + path.relative(processCwd, path.resolve(path.join(cwd, file))));
				var relativePath = file.replace(cwd, '');
				var alias = normalizePath(path.join(map.expose || '', relativePath));
				var stripExtExpr = new RegExp('(.*?)(' + b._extensions.join('$|\\') + ')$');

				var noExtAlias = alias.match(stripExtExpr);

				aliases[alias] = transformFilePath;

				if (!noExtAlias)
					log('Error getting extension of file: ', relativePath, alias);

				if (noExtAlias && noExtAlias[1])
					aliases[noExtAlias[1]] = transformFilePath;

				log('Found: ', transformFilePath);
			})
			.on('end', function (files) {
				b.emit('derailify:files', files, aliases, map);
				done();
			});
	});
};
