/*
FACE DETECTION: SIMPLE
code by Jeff Thompson | 2021 | jeffreythompson.org

Teaching computers to see faces has been around in 
various forms since the 1960s. In the 1990s and early 
2000s, techniques like Eigenfaces and Viola-Jones
allowed not just detecting faces but identifying
features. Today, facial recognition is embedded in
our smartphones and social media apps, allowing for
super fast, accurate, and even 3D face tracking!

There are lots of libraries for doing face detection,
but Google's TensorFlow library has several models
that work really well. This example uses BlazeFace,
which tracks six features and is really fast!

MORE INFO
+ https://github.com/tensorflow/tfjs-models/tree/
  master/blazeface
+ https://arxiv.org/abs/1907.05047

*/

let video; // webcam input
let model; // BlazeFace machine-learning model
let face; // detected face

// print details when a face is
// first found
let firstFace = true;

function setup() {
  createCanvas(640, 480);

  video = createCapture(VIDEO);
  video.hide();

  // load the BlazeFace model
  loadFaceModel();
}

// TensorFlow requires the loading of the
// model to be done in an asynchronous function
// this means it will load in the background
// and be available to us when it's done
async function loadFaceModel() {
  model = await blazeface.load();
}

function draw() {
  // if the video is active and the model has
  // been loaded, get the face from this frame
  if (video.loadedmetadata && model !== undefined) {
    getFace();
  }

  // if we have face data, display it
  if (face !== undefined) {
    image(video, 0, 0, width, height);

    // if this is the first face we've
    // found, print the info
    if (firstFace) {
      console.log(face);
      firstFace = false;
    }

    // the model returns us a variety of info
    // (see the output in the console) but the
    // most useful will probably be landmarks,
    // which correspond to facial features
    let rightEye = face.landmarks[0];
    let leftEye = face.landmarks[1];
    let nose = face.landmarks[2];
    let mouth = face.landmarks[3];
    let rightEar = face.landmarks[4];
    let leftEar = face.landmarks[5];

    // the points are given based on the dimensions
    // of the video, which may be different than
    // your canvas – we can convert them using map()!
    rightEye = scalePoint(rightEye);
    leftEye = scalePoint(leftEye);
    nose = scalePoint(nose);
    mouth = scalePoint(mouth);

    // from there, it's up to you to do fun
    // stuff with those points!
    
    if (mouseIsPressed){
    fill(255,0,0,220)
    rect(0,0,640, 480)
    noStroke()
    fill(255,0,255)
    ellipse(rightEye.x+20, rightEye.y-20, 25,25)
    ellipse(rightEye.x+20, rightEye.y+20, 25,25)
    ellipse(rightEye.x-20, rightEye.y-20, 25,25)
    ellipse(rightEye.x-20, rightEye.y+20, 25,25)
    fill(255,200,255)
    ellipse(rightEye.x+20, rightEye.y, 50,20)   
    ellipse(rightEye.x-20, rightEye.y, 50,20)
    ellipse(rightEye.x, rightEye.y+20, 20,50)
    ellipse(rightEye.x, rightEye.y-20, 20,50)
    fill(0)
    ellipse(rightEye.x, rightEye.y,50)
    noFill()
    stroke(random(0,255),0,random(0,255))
    strokeWeight(3)
    ellipse(rightEye.x, rightEye.y, random(10,50))
      
    noStroke()
    fill(255,0,255)
    ellipse(leftEye.x+20, leftEye.y-20, 25,25)
    ellipse(leftEye.x+20, leftEye.y+20, 25,25)
    ellipse(leftEye.x-20, leftEye.y-20, 25,25)
    ellipse(leftEye.x-20, leftEye.y+20, 25,25)
    fill(255,200,255)
    ellipse(leftEye.x+20, leftEye.y, 50,20)   
    ellipse(leftEye.x-20, leftEye.y, 50,20)
    ellipse(leftEye.x, leftEye.y+20, 20,50)
    ellipse(leftEye.x, leftEye.y-20, 20,50)
    fill(0)
    ellipse(leftEye.x, leftEye.y,50)
    noFill()
    stroke(random(0,255),0,random(0,255))
      strokeWeight(3)
    ellipse(leftEye.x, leftEye.y, random(10,50))
    ellipse(mouth.x, mouth.y, 40)      
    }
    
    else{
    fill(255,0,0,220)
    rect(0,0,640, 480)
   noStroke()
    fill(255,0,255)
    ellipse(rightEye.x+20, rightEye.y-20, 25,25)
    ellipse(rightEye.x+20, rightEye.y+20, 25,25)
    ellipse(rightEye.x-20, rightEye.y-20, 25,25)
    ellipse(rightEye.x-20, rightEye.y+20, 25,25)
    fill(255,200,255)
    ellipse(rightEye.x+20, rightEye.y, 50,20)   
    ellipse(rightEye.x-20, rightEye.y, 50,20)
    ellipse(rightEye.x, rightEye.y+20, 20,50)
    ellipse(rightEye.x, rightEye.y-20, 20,50)
    fill(100, 25,255)
    ellipse(rightEye.x, rightEye.y, 35)
    
    fill(255,0,255)
    ellipse(leftEye.x+20, leftEye.y-20, 25,25)
    ellipse(leftEye.x+20, leftEye.y+20, 25,25)
    ellipse(leftEye.x-20, leftEye.y-20, 25,25)
    ellipse(leftEye.x-20, leftEye.y+20, 25,25)
    fill(255,200,255)
    ellipse(leftEye.x+20, leftEye.y, 50,20)   
    ellipse(leftEye.x-20, leftEye.y, 50,20)
    ellipse(leftEye.x, leftEye.y+20, 20,50)
    ellipse(leftEye.x, leftEye.y-20, 20,50)
    fill(100, 25,255)
    ellipse(leftEye.x, leftEye.y, 35)  
    arc(mouth.x, mouth.y, 50, 45, TWO_PI, PI);
 }
  }
}

// a little utility function that converts positions
// in the video to the canvas' dimensions
function scalePoint(pt) {
  let x = map(pt[0], 0, video.width, 0, width);
  let y = map(pt[1], 0, video.height, 0, height);
  return createVector(x, y);
}

// like loading the model, TensorFlow requires
// we get the face data using an async function
async function getFace() {
  // get predictions using the video as
  // an input source (can also be an image
  // or canvas!)
  const predictions = await model.estimateFaces(
    document.querySelector("video"),
    false
  );

  // false means we want positions rather than
  // tensors (ie useful screen locations instead
  // of super-mathy bits)

  // if we there were no predictions, set
  // the face to undefined
  if (predictions.length === 0) {
    face = undefined;
  }

  // otherwise, grab the first face
  else {
    face = predictions[0];
  }
}
