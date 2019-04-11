var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var schema = new Schema({
    user_list_json: String,
    create_time: Number
});

module.exports = mongoose.model('chatRoom', schema, 'ChatRooms');