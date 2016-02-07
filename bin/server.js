var multiparty = require('multiparty');
var http = require('http');
var util = require('util');
var path = require("path");
require("date-format-lite");
var mv = require('mv');
var fs = require('fs');
var exec = require('child_process').exec;
var drivelist = require('drivelist');
var uuid = require('node-uuid');
var fsExtra = require('fs-extra');

var outdirDefaultParent = '/snapvolt';
var outdirPhotos = '/photos';
var defaultTitle = "image";
var currentDisks = [];
var configFile = '../../config.json';



function pushIfNew(arry, str) {
  //Push a string to an array if it is new
  console.log("Attempting to add to array:" + str);
  for (var i = 0; i < arry.length; i++) {
    if (arry[i] === str) { // modify whatever property you need
      return;
    }
  }
  console.log("Pushing string");
  arry.push(str);
  return arry;
}


function serverParentDir() {
	//Get the current parent directory. E.g from C:\snapvolt\bin it will be relative ..\..\ = 'C:'
	var curdir = path.normalize(__dirname + "/..");
	return curdir;
}

function ensurePhotoReadableWindows(fullPath, cb) {
	//Optional cb(err) passed back
	//Check platform is windows
	var isWin = /^win/.test(process.platform);
	if(isWin) {
		//See: http://serverfault.com/questions/335625/icacls-granting-access-to-all-users-on-windows-7
		//Grant all users access, rather than just admin
		var run = 'icacls ' + fullPath + ' /t /grant Everyone:(OI)(CI)F';
		console.log("Running:" + run);
		exec(run, function(error, stdout, stderr){
			console.log(stdout);
			if(cb) {
				cb(error);
			}
		});
	}
}


function checkConfigCurrent(cb) {
	//Reads and updates config to get any new hard-drives added to the system, or a GUID added
	//Returns cb(err) where err = null, or a string with the error

	//Write to a json file with the current drive.  This can be removed later manually by user, or added to
	fs.readFile(__dirname + configFile, function read(err, data) {
		if (err) {
				cb("Sorry, cannot read config file!");
		} else {
			var content = JSON.parse(data);

			if(!content.globalId) {
				//Only need to create the server's ID once. And make sure it is not the same as the developer's ID
				content.globalId = uuid.v4();
		    }

			//Get the current drives
			drivelist.list(function(error, disks) {
				if (error) throw error;

				for(var cnt=0; cnt< disks.length; cnt++) {
					//On each drive, create a backup standard directory for photos
					console.log("Drive detected:" + JSON.stringify(disks[cnt]));
					var drive = disks[cnt].mountpoint;

					if(serverParentDir().indexOf(drive) < 0) {
						//Drive is not included in this server parent dir, therefore talking about a different drive

						//Create the dir
						if (!fs.existsSync(path.normalize(drive + outdirDefaultParent))){
							fs.mkdirSync(path.normalize(drive + outdirDefaultParent));
						}

						if (!fs.existsSync(path.normalize(drive + outdirDefaultParent + outdirPhotos))){
							fs.mkdirSync(path.normalize(drive + outdirDefaultParent + outdirPhotos));
						}

						//Append to the file's array
						content.backupTo = pushIfNew(content.backupTo, drive + outdirDefaultParent + outdirPhotos);
					}
				}

				//Write the file nicely formatted again
				fs.writeFile(__dirname + configFile, JSON.stringify(content, null, 6), function(err) {
					if(err) {
						cb(err);
					}

					console.log("The config file was saved!");
					cb(null);
				});

			 });


		};
	});

}



checkConfigCurrent(function(err) {

	if(err) {
		console.log("Error updating config.json: " + err);
		exit(0);
	}

	http.createServer(function(req, res) {
	  if (req.url === '/api/photo' && req.method === 'POST') {
		// parse a file upload

		var form = new multiparty.Form();


		form.parse(req, function(err, fields, files) {
		   //Process filename of uploaded file, then move into the server's directory, and finally
		   //copy the files into any backup directories


			//The standard outdir is the drive from the current server script
			var parentDir = serverParentDir();
			console.log("This drive:" + parentDir);
			var outdir = parentDir + outdirPhotos;


			  res.writeHead(200, {'content-type': 'text/plain'});
			  res.write('Received upload successfully! Check ' + path.normalize(parentDir + outdirPhotos) + ' for your image.\n\n');
			  res.end();


			//Use original filename for name
			var title = files.file1[0].originalFilename;


			//Copy file to eg. c:/snapvolt/photos
			var outFile = title;
			outFile = outFile.replace('.jpg','');			//Remove jpg from filename
			outFile = outFile.replace('.jpeg','');			//Remove jpg from filename

			var words = outFile.split('-');

			var finalFileName = "";
			//Array of distinct words
			for(var cnt = 0; cnt< words.length; cnt++) {
				if(words[cnt].charAt(0) == '#') {
					var outhashdir = words[cnt].replace('#','');

					//Check the directory exists, and create
					if (!fs.existsSync(path.normalize(parentDir + outdirPhotos))){
							fs.mkdirSync(path.normalize(parentDir + outdirPhotos));
					}

					//Create the final hash outdir
					outdir = parentDir + outdirPhotos + '/' + outhashdir;
					if (!fs.existsSync(path.normalize(outdir))){
						fs.mkdirSync(path.normalize(outdir));
					}
				} else {
					//Start building back filename with hyphens between words
					if(finalFileName.length > 0) {
						finalFileName = finalFileName + '-';
					}
					finalFileName = finalFileName + words[cnt];
				}
			}




			finalFileName = finalFileName + '.jpg';

			//Move the file into the standard location of this server
			var fullPath = outdir + '/' + finalFileName;
			console.log("Moving " + files.file1[0].path + " to " + fullPath);
			mv(files.file1[0].path, fullPath, {mkdirp: true},  function(err) { //path.normalize(
				  // done. it tried fs.rename first, and then falls back to
				  // piping the source file to the dest file and then unlinking
				  // the source file.
				  if(err) {
					console.log(err);

				  } else {
					console.log(finalFileName + ' file uploaded');

					//Ensure no admin restictions on Windows
					ensurePhotoReadableWindows(fullPath);

					//Now copy to any other backup directories
					console.log("Backups:");
					var thisPath = fullPath;

					//Read in the config file
					fs.readFile(__dirname + configFile, function read(err, data) {
						if (err) {
							console.log("Warning: Error reading config file for backup options: " + err);
						} else {
							var content = JSON.parse(data);

							//Loop through all the backup directories
							for(var cnt=0; cnt< content.backupTo.length; cnt++) {
								var target = content.backupTo[cnt] + '/' + finalFileName;
								console.log("Backing up " + thisPath + " to:" + target);
								fsExtra.ensureDirSync(content.backupTo[cnt], function(err) {
									if(err) {
										console.log("Warning: Could not create directory for backup: " + content.backupTo[cnt]);
									} else {
										try {
											console.log("Copying " + thisPath + " to " + target);
											fsExtra.copySync(thisPath, target);
											ensurePhotoReadableWindows(target);
										} catch (err) {
										    console.error('Warning: there was a problem backing up: ' + err.message);
										}
									}
								});

							}
						}

					});



				  }
			});








		});

		return;

	  } else {
		  //A get request to pull from the server
		  // show a file upload form
		  var url = req.url;
		  if((url == '/') || (url == "")) {
			  url = "/index.html";
		  }
		  var mydir = __dirname + "/../public" + url;
		  var normpath = path.normalize(mydir);
		  console.log(normpath);

		  // set the content type
		  var ext = path.extname(normpath);
		  var contentType = 'text/html';

		  //Handle images
		  if (ext === '.png') {
			 contentType = 'image/png';
		  }
		  if (ext === '.jpg') {
			 contentType = 'image/jpg';
		  }

		  //Being preparation to send
		  res.writeHead(200, {'content-type': contentType});

		  //Read the file from disk, then send to client
		  fs.readFile(normpath, function (err,data) {
			  if (err) {
				res.writeHead(404);
				res.end(JSON.stringify(err));
				return;
			  }
			  res.writeHead(200);
			  res.end(data);
		  });


	   }
	}).listen(5566);
});