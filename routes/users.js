var express = require('express');
var router = express.Router();
var User = require('./model/user');
var moment = require('moment');
var admin = require('firebase-admin');
var path = require('path');
var multer = require('multer');
var storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './img');
    },
    filename: (req, file, cb) => {
        //change img file name to 'uid + file extension'
        cb(null, req.params.uid + path.extname(file.originalname));
    }
});
var upload = multer({ storage: storage });

//REST api routing path; not real img path
var imgPath = '/users/img/';

router.get('/:uid', (req, res) => {
    User.findOne({ 'uid': req.params.uid }, (err, user) => {
        if(err) return res.status(500).json('db error');
        if(!user) return res.status(404).json('user not found');
        
        res.status(200).json(user);
    });
});

router.get('/:uid/allfriends', (req, res) => {
    User.findOne({ 'uid': req.params.uid }, (err, user) => {
        if(err) return res.status(500).json('db error');
        if(!user) return res.status(404).json('user not found');
    }).then(user => {
        let friendsList = [];
        let friendsEmail = JSON.parse(user.friends_list_json);
        
        function asyncLoop(i) {
            if(i < friendsEmail.length) {
                User.findOne({ 'email': friendsEmail[i] }, (err, user) => {
                    if(err) return res.status(500).json('db error');
                    if(!user) return res.status(404).json('friend not found');

                    friendsList.push(user);
                    asyncLoop(i + 1);
                });
            } else {
                res.status(200).json(friendsList);
            }
        }
        
        asyncLoop(0);
    })
});

router.get('/img/:filename', (req, res) => {
    res.status(200).download('./img/' + req.params.filename);
});

router.post('/:uid', (req, res) => {
    admin.auth().getUser(req.params.uid)
  .then(userRecord => {
    let user = new User();
    user.uid = req.params.uid;
    user.email = userRecord.email;
    user.name = userRecord.displayName;
    user.img_uri = '';
    user.friends_list_json = '[]';
    user.phone_num = '';
    user.last_socket_id = '';
    user.published_date = moment().unix();

    User.findOne({ 'uid': req.params.uid }, (err, user0) => {
        if(err) return res.status(500).json('db error');
        if(user0) return res.status(200).json('user already signed');
        if(!user0) {
            user.save(err0 => {
                if(err0) return res.status(500).json('db error');
                res.status(200).json('new user created');
            })
        }
    })
  })
  .catch(error => {
    console.log('Error fetching user data:', error);
    res.status(500).json('firebase error')
  });
});

router.post('/:uid/img', upload.single('image'), (req, res) => {
    User.findOne({ 'uid': req.params.uid }, (err, user) => {
        if(err) return res.status(500).json('db error');
        if(!user) return res.status(500).json('user not found');
        if(user) {
            user.img_uri = req.file.path;
            user.save(err0 => {
                if(err0) return res.status(500).json('db error');
                res.status(200).json('img uploaded');
            })
        }
    })
});

router.put('/:uid', (req, res) => {
    if(req.body.name) {
        admin.auth().updateUser(req.params.uid, {
            displayName: req.body.name
        })
        .then(() => {
            User.findOne({ 'uid': req.params.uid }, (err, user) => {
                if(err) return res.status(500).json('db error');
                if(!user) return res.status(404).json('user not found');
                user.name = req.body.name;
                
                user.save((err) => {
                    if(err) return res.status(500).json('update failed');
                    return res.status(200).json('user updated');
                });
            });
        })
        .catch(error => {
            console.log('Error fetching user data:', error);
            res.status(500).json('firebase error');
        })
    }
});

router.put('/:uid/friend', (req, res) => {
    User.findOne({ 'uid': req.params.uid }, (err, user) => {
        if(err) return res.status(500).json('db error');
        if(!user) return res.status(404).json('user not found');
        var friends = JSON.parse(user.friends_list_json);
            friends.push(req.body.email);
            user.friends_list_json = JSON.stringify(friends);
        
        user.save((err) => {
            if(err) return res.status(500).json('update failed');
        });
    });

    User.findOne({ 'email': req.body.email }, (err, user) => {
        if(err) return res.status(500).json('friend db error');
        if(!user) return res.status(404).json('friend not found');

        res.status(200).json(user);
    });
});

router.delete('/:uid', (req, res) => {
    admin.auth().deleteUser(req.params.uid)
    .then(() => {
        console.log('firebase auth successfully deleted user');
        User.remove({ 'uid': req.params.uid }, (err, output) => {
            if(err) return res.status(500).json('delete failed');
            res.status(200).json('user deleted');
        });
    })
    .catch(err => {
        console.log(err);
        res.status(500).json('firebase error');
    })
});
module.exports = router;