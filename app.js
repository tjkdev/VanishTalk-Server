var express = require('express');
var logger = require('morgan');
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
mongoose.Promise = require('bluebird');
var moment = require('moment');
var fs = require('fs');
var socketio = require('socket.io');
var app = express();

var db = mongoose.connection;
db.on('error', console.error);
db.once('open', function() {
    console.log("connected");
});

mongoose.connect('mongodb://localhost/vanishTalk', { useNewUrlParser: true });

var port = process.env.PORT || 80;
var chatPort = process.env.PORT || 3000;

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'content-type');
  next();
});

//routers
app.use('/users', require('./routes/users'));

//firebaseAuth Admin
var admin = require('firebase-admin');
var serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://vanishtalk.firebaseio.com'
});

//http listen
app.listen(port, () => {
  console.log('server listening port: ' + port);
});

//socket.io listen
var server = app.listen(chatPort, () => {
  console.log('server listening port: ' + chatPort);
});

var User = require('./routes/model/user');
var ChatRoom = require('./routes/model/chatroom');
var Chat = require('./routes/model/chat');

var io = socketio.listen(server);
io.on('connection', (socket) => {
  console.log(socket.id);
  //socket.emit('connect', 'hello');

  //email-socket id pair to distinguish user by socket
  socket.on('enroll socket', (data) => {
    let parsedData = JSON.parse(data);

    User.findOne({ 'email': parsedData.email }, (err, user) => {
      if(err) console.log("DB error");
      if(!user) {
        console.log("user not found");
      } else {
        user.last_socket_id = socket.id;
        user.save((err) => {
          if(err) console.log("socket save err");
        });
      }

      socket.emit('enroll socket', 'enroll');
    });
  });

  socket.on('connect rooms', (data) => {
    var roomList = JSON.parse(data);
    var roomIdList = [];
    roomList.forEach(element => {
      roomIdList.push(element.id);
    });
    
    socket.join(roomIdList);
    socket.emit('connect rooms', 'connect');
  });

  socket.on('make room', (data) => {
    let parsedData = JSON.parse(data);

    let chatRoom = new ChatRoom();
    let now = moment().unix();
    let roomId = '';
    
    chatRoom.user_list_json = parsedData.userListJson;
    chatRoom.create_time = now;
    //make & save room _id to send client(user)
    chatRoom.save((err, room) => {
      roomId = room._id;

      //load room info which made just before
      ChatRoom.findOne({ '_id': roomId }).lean().exec((err, room) => {
        if(!room) console.log("can't find room");
        socket.emit('make room', JSON.stringify(room));
        socket.join(roomId);
      });
    });
  });

  socket.on('sync chat', (data) => {
    //client send 'LocalChatRoom' objects array
    let roomList = JSON.parse(data);
    
    console.log("start sync");
    //user already signed & logged in with used device
    if(roomList.length > 0) {
      roomList.forEach(room => {
        //status of chat room which client participates, and received some chats before is in room object 
        Chat.find({ 'room_id': room.id, '_id': { $gt: room.lastMsgId } }).then(chatList => {
          console.log(chatList);
          socket.emit('sync chat', JSON.stringify(chatList));
        });
      });      
      
      //find chat room which client participates, but doesn't receive any chat
      User.findOne({ 'last_socket_id': socket.id}).then(user => {
        ChatRoom.find({ 'user_list_json': { $regex: '.*' + user.email + '.*' } }).then(rooms => {
          //remove room which already received chats from all participating room list
          roomList.forEach(participatedRoom => {
            rooms.forEach((room, index) => {
              if(room._id == participatedRoom.id) {
                rooms.splice(index, 1);
              }
            });
          });
          console.log(rooms);
          socket.emit('sync room', JSON.stringify(rooms));
          rooms.forEach(room => {
            Chat.find({ 'room_id': room._id }).then(chatList => {
              console.log(chatList);
              socket.emit('sync chat', JSON.stringify(chatList));
            })
          });
        });
      });
    } else { //user sign in first time or logged in with new device(user changed his/her device)
      User.findOne({ 'last_socket_id': socket.id}).then(user => {
        ChatRoom.find({ 'user_list_json': { $regex: '.*' + user.email + '.*' } }).then(roomList => {
          socket.emit('sync room', JSON.stringify(roomList));
          roomList.forEach(room => {
            //status of chat room which client participates, but doesn't receive any chat is in room object
            Chat.find({ 'room_id': room._id }).then(chatList => {
              console.log("chats => " + chatList);
              socket.emit('sync chat', JSON.stringify(chatList));
            });
          });
        });
      });
    }
  });

  socket.on('send chat', (data) => {
    console.log(data);
    let parsedData = JSON.parse(data);

    //find room members' emails
    ChatRoom.findOne({ '_id': parsedData.roomId }).then(room => {
      let userEmails = JSON.parse(room.user_list_json);
      let roomMembers = [];

      //collect room members' socket ids
      userEmails.forEach(email => {
        roomMembers.push(User.findOne({ 'email': email }));
      });
      
      return Promise.all(roomMembers);
    }).then((memberList) => {
      let chat = Chat();
      chat.room_id = parsedData.roomId;
      chat.email = parsedData.email;
      chat.type = parsedData.type;
      chat.content = parsedData.content;
      chat.read_count = memberList.length;
      chat.send_time = moment().unix();

      chat.save((err, answer) => {
        //check room members' sockets connected
        if(memberList.length > 0) {
          memberList.forEach(member => {
            //not connected
            if(io.sockets.in(parsedData.roomId).connected[member.last_socket_id] == undefined) {
              console.log('no socket'); // -> push fcm
            }
          });
        }
        
        //send to all clients include sender
        //to simplize client's business logic; integrate sending/receiving msg logic
        io.in(parsedData.roomId).emit('receive chat', JSON.stringify(answer));
        console.log(JSON.stringify(answer));
      });
    });
  });
});

module.exports = app;
