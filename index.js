const functions = require('firebase-functions');
const admin = require('firebase-admin');

const gcs  = require('@google-cloud/storage')({keyFilename: 'apptest-8f5d2-firebase-adminsdk-nv2uo-39c4b1b0c7.json'});
const spawn  = require('child-process-promise').spawn;
const UUID = require("uuid-v4");


//initialize it only for admin privileges. i.e - sending notification , accessing database with admin privileges
admin.initializeApp(functions.config().firebase);

const ref = admin.database().ref();

const path = require('path');
const os = require('os');
const fs = require('fs');
const mkdirp = require('mkdirp-promise');

// Max height and width of the thumbnail in pixels.
const THUMB_MAX_HEIGHT = 200;
const THUMB_MAX_WIDTH = 200;
// Thumbnail prefix added to file names.
const THUMB_PREFIX = 'thumb_';

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });

var email, firstName, lastName, photoURL, name, password,  uid, providerId, location, userCategoryImage, userCategoryText;


exports.createUserAccount = functions.auth.user().onCreate(event =>{
  let model = [];
  let imei = [];
  let request = admin.auth().getUser(event.data.uid)
  .then(function(user){
     console.log("Successfully fetched user data: ", user.toJSON());

    // var name;
     uid = event.data.uid;
     email = event.data.email||'';
     name = event.data.displayName||'';
     photoURL = event.data.photoURL || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_640.png';
     password = event.data.password||'';
     phoneNumber = event.data.phoneNumber || '';


     for (var provider of user.providerData) {
       providerId = provider.providerId||'';
     }

       lastSignedInAt = user.metadata.lastSignedInAt;
       createdAt = user.metadata.createdAt;
       location = '';
       model.push('');
       imei.push('');
       userCategoryImage = 'https://s19.postimg.org/z3ms67e5f/iconbronze.png';
       userCategoryText = 'Bronze User'

     var values = {
       uid: uid,
       name: name,
       email: email,
       phoneNumber: phoneNumber,
       photoURL: photoURL,
       providerId: providerId,
       location: location,
       model: model,
       imei: imei,
       userCategoryText: userCategoryText,
       userCategoryImage: userCategoryImage

     //  providerId: providerId
     };
     ref.child(`/users/${uid}`).set(values);
  })
  .catch(function(error){
    console.error("Error Fetching User: ", error);
  })
  return request;
});





exports.sendNotification = functions.database.ref('/articles/{articleId}')
                            .onWrite(event =>{
                                // Grab the current value of what was written to the Realtime Database.
                                var eventSnapshot = event.data;
                                var str1 = "Author is ";
                                var str = str1.concat(eventSnapshot.child("author").val());
                               // var bigimagess = eventSnapshot.child("bigimage").val()
                                console.log(str);
                                console.log(eventSnapshot.child("bigimage").val());

                                var topic = "android";
                                var payload = {
                                    data:{
                                        title : eventSnapshot.child("title").val(),
                                        author : eventSnapshot.child("author").val(),
                                        bigimage : eventSnapshot.child("bigimagess").val()
                                    }
                                };
                                return admin.messaging().sendToTopic(topic,payload)
                                    .then(function(response){
                                        // See the MessagingTopicResponse reference documentation for the
                                        // contents of response.

                                        console.log("Successfully sent message:", response);

                                    })
                                    .catch(function(error){

                                        console.log("Error sending message:", error);
                                    });


                            });


/**
 * When an image is uploaded in the Storage bucket We generate a thumbnail automatically using
 * ImageMagick.
 * After the thumbnail has been generated and uploaded to Cloud Storage,
 * we write the public URL to the Firebase Realtime Database.
 */
exports.generateThumbnail = functions.storage.object().onChange(event => {
  // File and directory paths.
  const filePath = event.data.name;
  const fileDir = path.dirname(filePath);
  const fileName = path.basename(filePath);
  const thumbFilePath = path.normalize(path.join(fileDir, `${THUMB_PREFIX}${fileName}`));
  const tempLocalFile = path.join(os.tmpdir(), filePath);
  const tempLocalDir = path.dirname(tempLocalFile);
  const tempLocalThumbFile = path.join(os.tmpdir(), thumbFilePath);



//  const firebaseObject = event.data.val();
  //const objectID = event.data.key;

  // Exit if this is triggered on a file that is not an image.
  if (!event.data.contentType.startsWith('image/')) {
    console.log('This is not an image.');
    return;
  }

  // Exit if the image is already a thumbnail.
  if (fileName.startsWith(THUMB_PREFIX)) {
    console.log('Already a Thumbnail.');
    return;
  }

  // Exit if this is a move or deletion event.
  if (event.data.resourceState === 'not_exists') {
    console.log('This is a deletion event.');
    return;
  }

  // Cloud Storage files.
  const bucket = gcs.bucket(event.data.bucket);
  const file = bucket.file(filePath);
  const thumbFile = bucket.file(thumbFilePath);

  // Create the temp directory where the storage file will be downloaded.
  return mkdirp(tempLocalDir).then(() => {
    // Download file from bucket.
    return file.download({destination: tempLocalFile});
  }).then(() => {
    console.log('The file has been downloaded to', tempLocalFile);
    // Generate a thumbnail using ImageMagick.
    return spawn('convert', [tempLocalFile, '-thumbnail', `${THUMB_MAX_WIDTH}x${THUMB_MAX_HEIGHT}>`, tempLocalThumbFile]);
  }).then(() => {
    console.log('Thumbnail created at', tempLocalThumbFile);
    // Uploading the Thumbnail.
    return bucket.upload(tempLocalThumbFile, {destination: thumbFilePath});
  }).then(() => {
    console.log('Thumbnail uploaded to Storage at', thumbFilePath);
    // Once the image has been uploaded delete the local files to free up disk space.
    fs.unlinkSync(tempLocalFile);
    fs.unlinkSync(tempLocalThumbFile);
    // Get the Signed URLs for the thumbnail and original image.
    const config = {
      action: 'read',
      expires: '03-01-2500'
    };
    return Promise.all([
      thumbFile.getSignedUrl(config),
      file.getSignedUrl(config)
    ]);
  })
  .then(results => {
    console.log('Got Signed URLs.');
    const thumbResult = results[0];
    const originalResult = results[1];
    const thumbFileUrl = thumbResult[0];
    const fileUrl = originalResult[0];

  // var uid = event.auth.variable ? event.auth.variable.uid : null;
   //console.log("Uid :  "+ uid); fileName

    return ref.child('users').child(fileName.split(".")[0]).update({photoURL: thumbFileUrl});
  }).then(() => console.log('Thumbnail URLs saved to database.'));
});
