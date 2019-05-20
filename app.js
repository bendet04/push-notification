var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var mongoose = require('mongoose');
var bodyParser = require('body-parser');

var port = process.env.PORT || 3000;

//connect server mongoose
mongoose.connect('mongodb://localhost/push_notification', function(err){
	if(err){
		console.log(err);
	}else{
		console.log('DB connected');
	}
});

//save for device id, socket and status
var notifSchema = mongoose.Schema({
	device: String,
	socket_id: String,
	status:String
});

//save notification which offline devices
var saveNotifSchema = mongoose.Schema({
	device_id: String,
	notif: String
});

//create model
var Notif = mongoose.model('Notif', notifSchema);
var SaveNotif = mongoose.model('SaveNotif', saveNotifSchema);

server.listen(port, function () {
	console.log('Server listening at port %d', port);
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


//incoming notification
app.post('/notification', (req, res) => {

	Notif.findOne({device:req.body.device}, function(err, data){
		if (err){
			return res.send({'status':4,'text':'unknown error'});
		};
		
		if(data){
			//check if device online
			if(data.status == 'connected'){
				io.to(data.socket_id).emit('notification', req.body.text);
				return res.send({'status':1,'text':'push notification success'});
			}else{
				//save for resend notification when device reconnected
				var saveNotify = new SaveNotif({device_id:req.body.device, notif:req.body.text});

				saveNotify.save(function(err) {
					if (err) throw err;
						console.log('notification saved.');
				});

				return res.send({'status':2,'text':'device not connected'});
			}
		}else{
			return res.send({'status':3,'text':'device not found'});
		}
	});
});	

//new connected devices
io.on('connection', function (socket) {
	console.log('new device connected '+socket.id);
	var handshakeData = socket.request;
	var dev = handshakeData._query['device'];
	
	//find device 
	Notif.find({device:dev}, function(err, data){
		if (err) throw err;

		//if device exist
		if (data.length == 0) {
			// save new user
			var notify = new Notif({device:dev, socket_id:socket.id, status:'connected'});

			notify.save(function(err) {
				if (err) throw err;
					console.log('User created successfully.');
			});
		}else{
			//update socket id
			console.log('User updating');
			Notif.findOneAndUpdate({device:dev},{socket_id:socket.id}, function(err, devis){
				if (err) throw err;
				console.log(devis.device + ' connected');
			});

			//update status
			Notif.findOneAndUpdate({device:dev}, {status:'connected'}, function(err, devis){
				if (err) throw err;
				console.log(devis.device + ' status updated');
			});

			//check if any pending notification
			SaveNotif.find({device_id:dev}, function(err, data){
				if (err) throw err;
				if(data.length>0){
					for(var i = 0; i < data.length; i++){
						//send each pending notification to new device socket_id
						io.to(socket.id).emit('notification', data[i].notif);
						console.log('notificatin has been sent');

						//delete after the notificatin sent
						SaveNotif.deleteOne({_id:data[i]._id}, function(err){
							if (err) throw err;
							console.log('notificaiton has been deleted');
						});
					}
				}	
			});
		}
	});
	
	socket.on('disconnect', function () {
		//find and update status when the device disconnected
		Notif.findOneAndUpdate({socket_id:socket.id},{status:'disconnected'}, function(err, devis){
			if (err) throw err;
			if (devis)
				console.log('user '+devis.device+' disconnected');
		});
	});

}); 