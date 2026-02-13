// Get references to HTML elements
const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const canvasCtx = canvasElement.getContext('2d');
const feedbackElement = document.getElementById('feedback');
const exerciseSelection = document.getElementById('exercise-selection');
const exerciseContainer = document.getElementById('exercise-container');

let detector = null;
let currentExercise = null; // 'squat' or 'pushup'

// Frame rate limiting for performance (30 FPS for mobile compatibility)
const TARGET_FPS = 30;
const FRAME_INTERVAL = 1000 / TARGET_FPS;
let lastFrameTime = 0;

// MoveNet keypoint indices
const KEYPOINTS = {
    NOSE: 0,
    LEFT_EYE: 1,
    RIGHT_EYE: 2,
    LEFT_EAR: 3,
    RIGHT_EAR: 4,
    LEFT_SHOULDER: 5,
    RIGHT_SHOULDER: 6,
    LEFT_ELBOW: 7,
    RIGHT_ELBOW: 8,
    LEFT_WRIST: 9,
    RIGHT_WRIST: 10,
    LEFT_HIP: 11,
    LEFT_KNEE: 13,
    LEFT_ANKLE: 15,
    RIGHT_HIP: 12,
    RIGHT_KNEE: 14,
    RIGHT_ANKLE: 16
};

/**
 * Start the selected exercise
 */
function startExercise(exercise) {
    currentExercise = exercise;
    exerciseSelection.style.display = 'none';
    exerciseContainer.style.display = 'block';

    // Update title
    const title = document.querySelector('h1');
    title.textContent = exercise === 'squat' ? 'AI Squat Coach' : 'AI Push-up Coach';

    initCamera();
}

/**
 * Call coach for help
 */
function callCoach() {
    // Use the UI Manager to send PeerJS signal
    UI.sendHelpRequest(currentExercise);
}

// Global stream reference for cleanup
window.localStream = null;

/**
 * Initialize theme from localStorage (Helper)
 */
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
    }
}
// Initialize theme on page load
window.addEventListener('DOMContentLoaded', initTheme);


/**
 * Calculate the angle between three points in 3D space
 * @param {Object} a - First point (e.g., hip) with x, y coordinates
 * @param {Object} b - Middle point (e.g., knee) with x, y coordinates
 * @param {Object} c - Third point (e.g., ankle) with x, y coordinates
 * @returns {number} The angle in degrees
 */
function calculateAngle(a, b, c) {
    // Calculate vectors from point b to points a and c
    const radians = Math.atan2(c.y - b.y, c.x - b.x) -
        Math.atan2(a.y - b.y, a.x - b.x);

    // Convert radians to degrees
    let angle = Math.abs(radians * 180.0 / Math.PI);

    // Ensure angle is between 0 and 180 degrees
    if (angle > 180.0) {
        angle = 360 - angle;
    }

    return angle;
}

/**
 * Calculate knee distance ratio relative to hip width
 * @param {Array} keypoints - Array of detected keypoints
 * @returns {Object} Object containing ratio and tracking status
 */
function analyzeKneeTracking(keypoints) {
    const leftKnee = keypoints[KEYPOINTS.LEFT_KNEE];
    const rightKnee = keypoints[KEYPOINTS.RIGHT_KNEE];
    const leftHip = keypoints[KEYPOINTS.LEFT_HIP];
    const rightHip = keypoints[KEYPOINTS.RIGHT_HIP];

    if (leftKnee.score > 0.3 && rightKnee.score > 0.3 &&
        leftHip.score > 0.3 && rightHip.score > 0.3) {

        // Calculate knee distance
        const kneeDx = rightKnee.x - leftKnee.x;
        const kneeDy = rightKnee.y - leftKnee.y;
        const kneeDistance = Math.sqrt(kneeDx * kneeDx + kneeDy * kneeDy);

        // Calculate hip width (reference measurement)
        const hipDx = rightHip.x - leftHip.x;
        const hipDy = rightHip.y - leftHip.y;
        const hipWidth = Math.sqrt(hipDx * hipDx + hipDy * hipDy);

        // Calculate ratio
        const kneeToHipRatio = kneeDistance / hipWidth;

        // Analyze form
        if (kneeToHipRatio < 0.85) {
            return {
                issue: "⚠️ Knees caving in",
                severity: "high",
                ratio: kneeToHipRatio,
                isGood: false
            };
        } else if (kneeToHipRatio > 1.5) {
            return {
                issue: "⚠️ Stance too wide",
                severity: "medium",
                ratio: kneeToHipRatio,
                isGood: false
            };
        } else {
            return {
                issue: "✓ Good knee tracking",
                severity: "none",
                ratio: kneeToHipRatio,
                isGood: true
            };
        }
    }

    return null;
}

/**
 * Draw the pose skeleton on the canvas
 * @param {Array} keypoints - Array of detected keypoints
 */
function drawPose(keypoints) {
    // Define skeleton connections
    const connections = [
        [5, 6], [5, 7], [7, 9], [6, 8], [8, 10], // Arms
        [5, 11], [6, 12], [11, 12], // Torso
        [11, 13], [13, 15], [12, 14], [14, 16], // Legs
        [0, 1], [0, 2], [1, 3], [2, 4] // Face
    ];

    // Draw connections (skeleton lines)
    canvasCtx.strokeStyle = '#00FF00';
    canvasCtx.lineWidth = 4;

    connections.forEach(([startIdx, endIdx]) => {
        const start = keypoints[startIdx];
        const end = keypoints[endIdx];

        if (start && end && start.score > 0.3 && end.score > 0.3) {
            canvasCtx.beginPath();
            canvasCtx.moveTo(start.x, start.y);
            canvasCtx.lineTo(end.x, end.y);
            canvasCtx.stroke();
        }
    });

    // Draw keypoints (joints)
    keypoints.forEach((keypoint) => {
        if (keypoint.score > 0.3) {
            canvasCtx.fillStyle = '#FF0000';
            canvasCtx.strokeStyle = '#FFFFFF';
            canvasCtx.lineWidth = 2;

            canvasCtx.beginPath();
            canvasCtx.arc(keypoint.x, keypoint.y, 6, 0, 2 * Math.PI);
            canvasCtx.fill();
            canvasCtx.stroke();
        }
    });
}

/**
 * Analyze squat form
 */
function analyzeSquat(keypoints) {
    const leftHip = keypoints[KEYPOINTS.LEFT_HIP];
    const leftKnee = keypoints[KEYPOINTS.LEFT_KNEE];
    const leftAnkle = keypoints[KEYPOINTS.LEFT_ANKLE];
    const rightHip = keypoints[KEYPOINTS.RIGHT_HIP];
    const rightKnee = keypoints[KEYPOINTS.RIGHT_KNEE];
    const rightAnkle = keypoints[KEYPOINTS.RIGHT_ANKLE];
    const leftShoulder = keypoints[KEYPOINTS.LEFT_SHOULDER];
    const rightShoulder = keypoints[KEYPOINTS.RIGHT_SHOULDER];

    if (leftHip.score > 0.3 && leftKnee.score > 0.3 && leftAnkle.score > 0.3 &&
        rightHip.score > 0.3 && rightKnee.score > 0.3 && rightAnkle.score > 0.3 &&
        leftShoulder.score > 0.3 && rightShoulder.score > 0.3) {

        const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
        const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
        const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

        const leftHipAngle = calculateAngle(leftShoulder, leftHip, leftKnee);
        const rightHipAngle = calculateAngle(rightShoulder, rightHip, rightKnee);
        const avgHipAngle = (leftHipAngle + rightHipAngle) / 2;

        const avgShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
        const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
        const avgHipX = (leftHip.x + rightHip.x) / 2;
        const avgHipY = (leftHip.y + rightHip.y) / 2;
        const backLeanRadians = Math.atan2(avgShoulderX - avgHipX, avgHipY - avgShoulderY);
        const backLeanAngle = Math.abs(backLeanRadians * 180 / Math.PI);

        const leftFloorPoint = { x: leftAnkle.x, y: leftAnkle.y + 100 };
        const rightFloorPoint = { x: rightAnkle.x, y: rightAnkle.y + 100 };
        const leftAnkleAngle = calculateAngle(leftKnee, leftAnkle, leftFloorPoint);
        const rightAnkleAngle = calculateAngle(rightKnee, rightAnkle, rightFloorPoint);
        const avgAnkleAngle = (leftAnkleAngle + rightAnkleAngle) / 2;

        // Analyze knee tracking
        const kneeTracking = analyzeKneeTracking(keypoints);

        let formIssues = [];
        let formScore = 0;

        if (avgKneeAngle > 160) {
            formIssues.push("Start squatting");
        } else if (avgKneeAngle >= 90 && avgKneeAngle <= 160) {
            formIssues.push("Go lower");
            formScore += 1;
        } else {
            formIssues.push("Great depth");
            formScore += 3;
        }

        if (avgHipAngle < 45) {
            formIssues.push("⚠️ Hips too low");
        } else if (avgHipAngle > 100) {
            formIssues.push("⚠️ Hinge at hips more");
        } else {
            formScore += 2;
        }

        if (backLeanAngle > 45) {
            formIssues.push("⚠️ Keep chest up");
        } else if (backLeanAngle < 10) {
            formIssues.push("✓ Good back position");
            formScore += 2;
        } else {
            formScore += 1;
        }

        if (avgAnkleAngle < 70) {
            formIssues.push("⚠️ Heels lifting");
        } else if (avgAnkleAngle > 110) {
            formIssues.push("⚠️ Lean Forward");
        } else {
            formScore += 1;
        }

        // Knee tracking analysis (0-2 points)
        if (kneeTracking) {
            if (kneeTracking.isGood) {
                formScore += 2;
            } else {
                formIssues.push(kneeTracking.issue);
            }
        }

        feedbackElement.className = '';
        if (avgKneeAngle > 160) {
            feedbackElement.textContent = 'Start Squatting';
            feedbackElement.classList.add('start');
        } else if (formScore >= 9) {
            feedbackElement.textContent = '🏆 Perfect Form!';
            feedbackElement.classList.add('good');
        } else {
            // Join all issues with a bullet point
            feedbackElement.textContent = formIssues.length > 0 ? formIssues.join(' • ') : 'Keep going!';
            feedbackElement.classList.add('lower');
        }

        const metricsToDisplay = [
            `Knee Angle: ${avgKneeAngle.toFixed(0)}°`,
            `Hip: ${avgHipAngle.toFixed(0)}°`,
            `Back Lean: ${backLeanAngle.toFixed(0)}°`,
            `Ankle: ${avgAnkleAngle.toFixed(0)}°`
        ];

        if (kneeTracking) {
            metricsToDisplay.push(`Knee Width: ${kneeTracking.ratio.toFixed(2)}x`);
        }

        metricsToDisplay.push(`Score: ${formScore}/10`);
        displayMetrics(metricsToDisplay);
    }
}

/**
 * Analyze push-up form
 */
function analyzePushup(keypoints) {
    const leftShoulder = keypoints[KEYPOINTS.LEFT_SHOULDER];
    const rightShoulder = keypoints[KEYPOINTS.RIGHT_SHOULDER];
    const leftElbow = keypoints[KEYPOINTS.LEFT_ELBOW];
    const rightElbow = keypoints[KEYPOINTS.RIGHT_ELBOW];
    const leftWrist = keypoints[KEYPOINTS.LEFT_WRIST];
    const rightWrist = keypoints[KEYPOINTS.RIGHT_WRIST];
    const leftHip = keypoints[KEYPOINTS.LEFT_HIP];
    const rightHip = keypoints[KEYPOINTS.RIGHT_HIP];
    const leftKnee = keypoints[KEYPOINTS.LEFT_KNEE];
    const rightKnee = keypoints[KEYPOINTS.RIGHT_KNEE];
    const leftAnkle = keypoints[KEYPOINTS.LEFT_ANKLE];
    const rightAnkle = keypoints[KEYPOINTS.RIGHT_ANKLE];

    if (leftShoulder.score > 0.3 && rightShoulder.score > 0.3 &&
        leftElbow.score > 0.3 && rightElbow.score > 0.3 &&
        leftWrist.score > 0.3 && rightWrist.score > 0.3 &&
        leftHip.score > 0.3 && rightHip.score > 0.3 &&
        leftKnee.score > 0.3 && rightKnee.score > 0.3 &&
        leftAnkle.score > 0.3 && rightAnkle.score > 0.3) {

        // 1. ELBOW ANGLE (Depth) - shoulder-elbow-wrist
        const leftElbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
        const rightElbowAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);
        const avgElbowAngle = (leftElbowAngle + rightElbowAngle) / 2;

        // 2. SHOULDER ANGLE (Scapular positioning) - elbow-shoulder-hip
        // This checks if shoulders are properly retracted/protracted
        const leftShoulderAngle = calculateAngle(leftElbow, leftShoulder, leftHip);
        const rightShoulderAngle = calculateAngle(rightElbow, rightShoulder, rightHip);
        const avgShoulderAngle = (leftShoulderAngle + rightShoulderAngle) / 2;

        // 3. BACK STRAIGHTNESS (Shoulder-Hip-Knee alignment)
        const leftBackAngle = calculateAngle(leftShoulder, leftHip, leftKnee);
        const rightBackAngle = calculateAngle(rightShoulder, rightHip, rightKnee);
        const avgBackAngle = (leftBackAngle + rightBackAngle) / 2;

        // 4. KNEE ANGLE (Leg straightness) - hip-knee-ankle
        // Should be close to 180° for proper form
        const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
        const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
        const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

        // 5. FULL BODY ALIGNMENT (Shoulder-Hip-Ankle)
        const leftBodyAlignment = calculateAngle(leftShoulder, leftHip, leftAnkle);
        const rightBodyAlignment = calculateAngle(rightShoulder, rightHip, rightAnkle);
        const avgBodyAlignment = (leftBodyAlignment + rightBodyAlignment) / 2;

        let formIssues = [];
        let formScore = 0;

        // ELBOW DEPTH ANALYSIS (0-3 points)
        if (avgElbowAngle > 140) {
            formIssues.push("Start push-up");
        } else if (avgElbowAngle >= 100 && avgElbowAngle <= 140) {
            formIssues.push("Go lower");
            formScore += 1;
        } else if (avgElbowAngle >= 80 && avgElbowAngle < 100) {
            formIssues.push("Good depth");
            formScore += 2;
        } else {
            formIssues.push("Perfect depth");
            formScore += 3;
        }

        // SHOULDER ANGLE ANALYSIS (0-2 points)
        // Proper shoulder positioning: ~70-110° range
        if (avgShoulderAngle < 60) {
            formIssues.push("⚠️ Shoulders too forward");
        } else if (avgShoulderAngle > 120) {
            formIssues.push("⚠️ Shoulders too back");
        } else if (avgShoulderAngle >= 70 && avgShoulderAngle <= 100) {
            formIssues.push("✓ Good shoulder position");
            formScore += 2;
        } else {
            formScore += 1;
        }

        // BACK STRAIGHTNESS ANALYSIS (0-2 points)
        // Should be close to 180° (straight line)
        if (avgBackAngle < 160) {
            formIssues.push("⚠️ Hips sagging");
        } else if (avgBackAngle > 200) {
            formIssues.push("⚠️ Hips too high");
        } else {
            formIssues.push("✓ Straight back");
            formScore += 2;
        }

        // KNEE ANGLE ANALYSIS (0-2 points)
        // Legs should be straight: 160-200°
        if (avgKneeAngle < 160) {
            formIssues.push("⚠️ Knees bent");
        } else if (avgKneeAngle >= 160 && avgKneeAngle <= 200) {
            formIssues.push("✓ Straight legs");
            formScore += 2;
        } else {
            formScore += 1;
        }

        // FULL BODY ALIGNMENT (0-1 point)
        if (avgBodyAlignment >= 165 && avgBodyAlignment <= 195) {
            formScore += 1;
        }

        // Provide feedback
        feedbackElement.className = '';
        if (avgElbowAngle > 140) {
            feedbackElement.textContent = 'Start Push-up';
            feedbackElement.classList.add('start');
        } else if (formScore >= 9) {
            feedbackElement.textContent = '🏆 Perfect Form!';
            feedbackElement.classList.add('good');
        } else {
            // Join all issues with a bullet point
            feedbackElement.textContent = formIssues.length > 0 ? formIssues.join(' • ') : 'Keep going!';
            feedbackElement.classList.add('lower');
        }

        // Display comprehensive metrics
        displayMetrics([
            `Elbow: ${avgElbowAngle.toFixed(0)}°`,
            `Shoulder: ${avgShoulderAngle.toFixed(0)}°`,
            `Back: ${avgBackAngle.toFixed(0)}°`,
            `Knee: ${avgKneeAngle.toFixed(0)}°`,
            `Body: ${avgBodyAlignment.toFixed(0)}°`,
            `Score: ${formScore}/10`
        ]);
    }
}

/**
 * Display metrics on canvas
 */
function displayMetrics(metrics) {
    canvasCtx.fillStyle = '#FFFFFF';
    canvasCtx.font = 'bold 18px Arial';
    canvasCtx.strokeStyle = '#000000';
    canvasCtx.lineWidth = 3;

    metrics.forEach((text, index) => {
        const y = 25 + (index * 25);
        canvasCtx.strokeText(text, 10, y);
        canvasCtx.fillText(text, 10, y);
    });
}

/**
 * Process pose detection and provide coaching feedback
 */
async function detectPose() {
    if (!detector) return;

    // Frame rate limiting for performance
    const currentTime = performance.now();
    const elapsed = currentTime - lastFrameTime;

    if (elapsed < FRAME_INTERVAL) {
        requestAnimationFrame(detectPose);
        return;
    }

    lastFrameTime = currentTime - (elapsed % FRAME_INTERVAL);

    const poses = await detector.estimatePoses(videoElement);

    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

    if (poses.length > 0) {
        const pose = poses[0];
        const keypoints = pose.keypoints;

        drawPose(keypoints);

        if (currentExercise === 'squat') {
            analyzeSquat(keypoints);
        } else if (currentExercise === 'pushup') {
            analyzePushup(keypoints);
        }
    } else {
        feedbackElement.textContent = 'No pose detected - step back';
        feedbackElement.className = '';
    }

    requestAnimationFrame(detectPose);
}

/**
 * Initialize the webcam and pose detector
 */
async function initCamera() {
    try {
        feedbackElement.textContent = 'Loading AI model...';

        // Wait for TensorFlow.js to be ready
        await tf.ready();

        // Create MoveNet detector
        detector = await poseDetection.createDetector(
            poseDetection.SupportedModels.MoveNet,
            {
                modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
            }
        );

        feedbackElement.textContent = 'Requesting camera access...';

        // Check if getUserMedia is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Camera access not supported on this browser');
        }

        // Request access to the user's webcam
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            }
        });

        window.localStream = stream; // Save for cleanup
        videoElement.srcObject = stream;

        // Wait for video metadata to load
        await new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                resolve();
            };
        });

        // Set canvas dimensions to match video
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;

        // Start video playback
        await videoElement.play();

        feedbackElement.textContent = 'Ready! Stand in front of camera';

        // Show Privacy Toast
        const toast = document.createElement('div');
        toast.className = 'privacy-toast';
        toast.innerHTML = '🔒 <strong>Privacy Note:</strong> Video is processed locally on your device. No images are sent to any server.';
        exerciseContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);

        // Start the processing loop
        detectPose();

    } catch (error) {
        console.error('Error:', error);
        feedbackElement.textContent = 'Error: ' + error.message;
        feedbackElement.style.background = 'rgba(244, 67, 54, 0.95)';
        feedbackElement.style.color = 'white';
    }
}
