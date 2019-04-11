var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var schema = new Schema({
    uid: String, //sent by client
    email: String,
    name: String,
    img_uri: String,
    friends_list_json: String,
    phone_num: String, //sent by client
    last_socket_id: String,
    published_date: Number
});

module.exports = mongoose.model('user', schema, 'Users');