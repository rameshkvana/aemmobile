/**
	Copyright (c) 2016 Adobe Systems Incorporated. All rights reserved.

	Licensed under the Apache License, Version 2.0 (the "License");
	you may not use this file except in compliance with the License.
	You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

	Unless required by applicable law or agreed to in writing, software
	distributed under the License is distributed on an "AS IS" BASIS,
	WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	See the License for the specific language governing permissions and
	limitations under the License.
 */
"use strict";

/**
 * Module dependencies.
 */
var Q = require('q');
var path = require("path");
var FS = require('q-io/fs');
var fs = require("fs");
var shell = require('shelljs');
var spawn = require('cross-spawn-async');
var downloadFile = require('../utils/downloadFile');
var os = require('os');
var app = require('./app');
var config = require('../config.json');
var plist = require('plist');
var project = require('./project');
var cordova_lib = require('cordova-lib');
var events = cordova_lib.events;

const aemmAppName = "AEMM.apk";
const aemmVerName = "version.txt";

function getCustomAppBinaryPath()
{
	var customAppPath = path.join(project.projectRootPath(), 'platforms/android/build/outputs/apk/android-debug.apk');
	if ( !fs.existsSync(customAppPath) )
	{
		return null;
	}

	return customAppPath;
}

module.exports.getInstalledAppBinaryPath = getInstalledAppBinaryPath;
function getInstalledAppBinaryPath(deviceType)
{
	return Q.fcall( () => {
		var customAppPath = getCustomAppBinaryPath();
		if (customAppPath != null) {
			return customAppPath;
		}

		return app.getParentPathForAppBinary("android", deviceType)
			.then((parentPath) => {
				let viewerPath = path.join(parentPath, aemmAppName);
				if (!fs.existsSync(viewerPath)) {
					throw new Error(`No application found at ${parentPath}`);
				}

				return viewerPath;
			});
	});
}

module.exports.getAppVersion = getAppVersion;
function getAppVersion(deviceType)
{
	return app.getParentPathForAppBinary("android", deviceType)
		.then(function (appBinaryParentPath) {
			let versionPath = path.join(appBinaryParentPath, aemmVerName);

			if ( !fs.existsSync(versionPath) )
			{
				throw new Error(`No application found at ${appBinaryParentPath}`);
			}

			return fs.readFileSync(versionPath,'utf8')
		});
}


module.exports.installFromFilePath = installFromFilePath;
function installFromFilePath(version, filepath, deviceType)
{
	let apkAppPath = filepath;
	let binaryParentPath = null;
	return app.getParentPathForAppBinary("android", deviceType)
		.then(function (appBinaryParentPath) {
			binaryParentPath = appBinaryParentPath;
			return FS.makeTree(binaryParentPath)
				.then(function() {
					let targetPath = path.join(binaryParentPath, aemmAppName);
					return FS.copy(apkAppPath, targetPath)
						.then(function() {
							let versionPath = path.join(binaryParentPath, aemmVerName);

							var deferred = Q.defer();
							fs.writeFile(versionPath, version, function(err) {
								if(err) {
									throw new Error(`Could not write file: ${err}`);
								}
								deferred.resolve();
							});

							return deferred.promise;
						});
				});
		});
}

module.exports.installFromProjectBuild = installFromProjectBuild;
function installFromProjectBuild()
{
	var deferred = Q.defer();
	var command = null;
	var script = null;

	if (process.platform == 'win32') {
		command = "powershell";
		script = path.join(getUserHome(), 'platforms/android/sdk/tools/android.bat');
	} else if (process.platform == 'darwin') {
		command = "sh";
		script = path.join(__dirname, '..', 'platforms/android/scripts/appInstall.sh');
	} else {
		events.emit("log", "Platform not supported: " + process.platform);
		return;
	}

	var proc = spawn(command, [script, process.cwd()], { stdio: 'inherit' });

	proc.on("error", function (error) {
		deferred.reject(new Error("nstall app from project build failed: " + error.message));
	});
	proc.on("exit", function(code) {
		if (code !== 0) {
			deferred.reject(new Error("nstall app from project build exited with code: " + code));
		} else {
			events.emit("log", "Install app from project build succeeded.");
			deferred.resolve();
		}
	});

	return deferred.promise;
}
