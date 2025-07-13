// HTML elements ko get karo
const webcamVideo = document.getElementById('webcamVideo');
const poseCanvas = document.getElementById('poseCanvas');
const pushupCountDisplay = document.getElementById('pushupCount');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const messageBox = document.getElementById('messageBox');
const loadingSpinner = document.getElementById('loadingSpinner');

// Canvas ke liye context (draw karne ke liye)
const canvasCtx = poseCanvas.getContext('2d');

// Global variables
let pose;         // pose model
let camera;       // camera input
let isTracking = false;
let pushupCount = 0;
let isDown = false;  // user neeche gaya ya nahi
let videoStream = null;

// Pose model setup
const poseConfig = {
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
};

pose = new Pose(poseConfig);

// Model options set karo
pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    smoothSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

pose.onResults(onResults);

// Jab result aaye pose se, to ye function chalega
function onResults(results) {
    if (!isTracking) return;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);
    canvasCtx.drawImage(results.image, 0, 0, poseCanvas.width, poseCanvas.height);

    if (results.poseLandmarks) {
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 4 });
        drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#FF0000', lineWidth: 2 });

        countPushups(results.poseLandmarks);
    }

    canvasCtx.restore();
}

// Push-up count karne ka logic
function countPushups(landmarks) {
    const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
    const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
    const leftElbow = landmarks[POSE_LANDMARKS.LEFT_ELBOW];
    const rightElbow = landmarks[POSE_LANDMARKS.RIGHT_ELBOW];
    const leftWrist = landmarks[POSE_LANDMARKS.LEFT_WRIST];
    const rightWrist = landmarks[POSE_LANDMARKS.RIGHT_WRIST];
    const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
    const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];

    const minVisibility = 0.7;

    // Agar body parts clearly visible nahi hai to return
    if (
        !leftShoulder || leftShoulder.visibility < minVisibility ||
        !rightShoulder || rightShoulder.visibility < minVisibility ||
        !leftElbow || leftElbow.visibility < minVisibility ||
        !rightElbow || rightElbow.visibility < minVisibility ||
        !leftWrist || leftWrist.visibility < minVisibility ||
        !rightWrist || rightWrist.visibility < minVisibility ||
        !leftHip || leftHip.visibility < minVisibility ||
        !rightHip || rightHip.visibility < minVisibility
    ) {
        return;
    }

    // Angle calculate karo (shoulder-elbow-wrist ke beech)
    function calculateAngle(A, B, C) {
        const AB = Math.hypot(B.x - A.x, B.y - A.y);
        const BC = Math.hypot(C.x - B.x, C.y - B.y);
        const AC = Math.hypot(C.x - A.x, A.y - C.y);
        const angleRad = Math.acos((AB ** 2 + BC ** 2 - AC ** 2) / (2 * AB * BC));
        return angleRad * 180 / Math.PI;
    }

    const leftElbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
    const rightElbowAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);
    const avgElbowAngle = (leftElbowAngle + rightElbowAngle) / 2;

    const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const avgHipY = (leftHip.y + rightHip.y) / 2;

    const isShoulderBelowHip = (avgShoulderY - avgHipY) > 0.05;

    // Push-up detect karo
    if (avgElbowAngle < 90 && isShoulderBelowHip) {
        isDown = true;
    } else if (avgElbowAngle > 160 && isDown) {
        pushupCount++;
        pushupCountDisplay.textContent = pushupCount;
        isDown = false;
    }
}

// Webcam on karke tracking start karo
async function startTracking() {
    try {
        loadingSpinner.style.display = 'block';
        messageBox.style.display = 'none';

        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            webcamVideo.srcObject = null;
        }

        videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        webcamVideo.srcObject = videoStream;

        await new Promise((resolve) => {
            webcamVideo.onloadedmetadata = () => {
                poseCanvas.width = webcamVideo.videoWidth;
                poseCanvas.height = webcamVideo.videoHeight;
                resolve();
            };
        });

        camera = new Camera(webcamVideo, {
            onFrame: async () => {
                if (isTracking) {
                    await pose.send({ image: webcamVideo });
                }
            },
            width: webcamVideo.videoWidth,
            height: webcamVideo.videoHeight
        });

        await camera.start();

        isTracking = true;
        pushupCount = 0;
        isDown = false;
        pushupCountDisplay.textContent = pushupCount;

        startButton.disabled = true;
        stopButton.disabled = false;
        loadingSpinner.style.display = 'none';
        showMessage('Tracking shuru ho gaya!', 'success');

    } catch (error) {
        console.error('Webcam error:', error);
        loadingSpinner.style.display = 'none';

        if (error.name === 'NotReadableError' || error.name === 'OverconstrainedError') {
            showMessage('Webcam dusre app me use ho rahi hai.', 'error');
        } else {
            showMessage('Webcam access nahi mil paayi.', 'error');
        }

        startButton.disabled = false;
        stopButton.disabled = true;
    }
}

// Tracking band karo
function stopTracking() {
    isTracking = false;

    if (camera) camera.stop();

    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        webcamVideo.srcObject = null;
    }

    canvasCtx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);

    startButton.disabled = false;
    stopButton.disabled = true;

    showMessage(`Tracking band ho gaya. Total push-ups: ${pushupCount}`, 'success');
}

// Message box show karna
function showMessage(message, type) {
    messageBox.textContent = message;
    messageBox.className = `message-box ${type}`;
    messageBox.style.display = 'block';

    setTimeout(() => {
        messageBox.style.display = 'none';
    }, 5000);
}

// Button click pe functions chalana
startButton.addEventListener('click', startTracking);
stopButton.addEventListener('click', stopTracking);

// Starting message
showMessage('Start pe click karo push-ups track karne ke liye!', 'success');

// Window resize hone pe canvas resize karo
window.addEventListener('resize', () => {
    if (webcamVideo.srcObject) {
        poseCanvas.width = webcamVideo.videoWidth;
        poseCanvas.height = webcamVideo.videoHeight;
    }
});
