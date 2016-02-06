var multiparty = require('multiparty');
var http = require('http');
var util = require('util');
var path = require("path");
require("date-format-lite");
var mv = require('mv');
var fs = require('fs');
var exec = require('child_process').exec;
var drivelist = require('drivelist');


var outdir1 = '/snapvolt';
var outdir2 = '/snapvolt/photos';
var defaultTitle = "image";
var currentDisks = [];
var configFile = '../../config.json';

function pushIfNew(arry, str) {
  for (var i = 0; i < arry.length; i++) {
    if (arry[i] === str) { // modify whatever property you need
      return;
    }
  }
  arry.push(str);
}

http.createServer(function(req, res) {
  if (req.url === '/api/photo' && req.method === 'POST') {
    // parse a file upload
    var form = new multiparty.Form();

    form.parse(req, function(err, fields, files) {
      //The standard outdir is the drive from the current server script
		var thisDrive = __dirname.substr(0,2);
		console.log("This drive:" + thisDrive);
		var outdir = thisDrive + outdir2;


      res.writeHead(200, {'content-type': 'text/plain'});
      res.write('Received upload successfully! Check ' + path.normalize(thisDrive + outdir2) + ' for your image.\n\n');
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
				outdir = thisDrive + outdir2 + '/' + outhashdir;
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

		//TODO: Put into client:
		//Replace spaces with hyphens
		/*var myoutFile = outFile.replace(/ /g,'-');

		//Append a timestamp to filename
		var now = new Date();          // Date {Wed Jul 10 2013 16:47:36 GMT+0300 (EEST)}
		var mydt = now.format("iso");
		mydt = mydt.replace(/:/g,'-');
		*/


		finalFileName = finalFileName + '.jpg';

		//Read store.json. Loop through each drive, and
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
				//TODO:This may need to be inside the successful move above to be consistent!
						//See: http://serverfault.com/questions/335625/icacls-granting-access-to-all-users-on-windows-7
						//Grant all users access, rather than just admin
				var run = 'icacls ' + fullPath + ' /t /grant Everyone:(OI)(CI)F';
				console.log("Running:" + run);
				exec(run, function(error, stdout, stderr){
					console.log(stdout);
				});


			  }
		});



		//Now copy to any other backup directory
		console.log("Backups:");
		fs.readFile(__dirname + configFile, function read(err, data) {
		    if (err) {
		        throw err;
		    }
		    var content = JSON.parse(data);

		    // Invoke the next step here however you like
		    console.log(content);   // Put all of the code here (not the best solution)

		});




    });

    form.on('file', function(name, file) {

        console.log(name);
        console.log(file.path);

		//Write to a json file with the current drive.  This can be removed later manually by user, or added to
		fs.readFile(__dirname + configFile, function read(err, data) {
			if (err) {
					console.log("Sorry, cannot read config file!");
			} else {
				var content = JSON.parse(data);


				//Get the current drives
				drivelist.list(function(error, disks) {
					if (error) throw error;

					for(var cnt=0; cnt< disks.length; cnt++) {
						//On each drive, create a backup standard directory for photos
						console.log("Drive detected:" + JSON.stringify(disks[cnt]));
						var drive = disks[cnt].mountpoint;
						if (!fs.existsSync(path.normalize(drive + outdir1))){
							fs.mkdirSync(path.normalize(drive + outdir1));
						}

						if (!fs.existsSync(path.normalize(drive + outdir2))){
							fs.mkdirSync(path.normalize(drive + outdir2));
						}

						//Append to the file's array
						pushIfNew(content.backupTo, drive + outdir2);
					}
			     });

				//Write the file nicely formatted again
				fs.writeFile(__dirname + configFile, JSON.stringify(content, null, 6), function(err) {
				    if(err) {
				        return console.log(err);
				    }

				    console.log("The file was saved!");
				});
			};
		});



    });

    return;

  } else {

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
	  if (ext === '.png') {
	     contentType = 'image/png';
      }

      res.writeHead(200, {'content-type': contentType});

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