var mongoose = require('mongoose');
var autoIncrement = require('mongoose-sequence')(mongoose);
var Schema = mongoose.Schema;

var schema = new Schema({
    _id: Number, //auto_increment
    room_id: String, //sent by client
    email: String, //sent by client
    type: Number, //sent by client
    content: String, //text == 0, img == 1
    read_count: Number, //the number of people still not read msg
    send_time: Number
}, { _id: false });
schema.plugin(autoIncrement);

module.exports = mongoose.model('chat', schema, 'Chats');