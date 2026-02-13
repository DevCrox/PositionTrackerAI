# AI Fitness Coach - Technical Documentation

## Overview
A browser-based AI-powered fitness coaching application that provides real-time form analysis for squats and push-ups using computer vision and pose estimation.

## Technology Stack

### Core Technologies
- **HTML5** - Application structure
- **CSS3** - Professional neutral styling
- **JavaScript (ES6+)** - Application logic
- **TensorFlow.js (v4.11.0)** - Machine learning framework
- **MoveNet (SINGLEPOSE_LIGHTNING)** - Pose detection model

### Key Libraries
- `@tensorflow/tfjs` - TensorFlow JavaScript library
- `@tensorflow-models/pose-detection` - Pre-trained pose estimation models

## Architecture

### Application Flow

```
1. User opens application
   ↓
2. Exercise selection screen displays
   ↓
3. User selects exercise (Squat or Push-up)
   ↓
4. Camera permission requested
   ↓
5. TensorFlow.js initializes
   ↓
6. MoveNet model loads
   ↓
7. Real-time pose detection begins
   ↓
8. Form analysis runs on each frame
   ↓
9. Visual feedback displayed to user
```

### File Structure

```
/Hackaton/
├── index.html          # Main application file
├── styles.css          # Professional neutral styling
└── README.md          # This documentation
```

## How It Works

### 1. Pose Detection

**MoveNet Model:**
- Detects 17 body keypoints in real-time
- Runs at ~30-60 FPS on modern hardware
- Returns x, y coordinates and confidence scores

**Keypoints Tracked:**
```
0:  Nose
1:  Left Eye
2:  Right Eye
3:  Left Ear
4:  Right Ear
5:  Left Shoulder
6:  Right Shoulder
7:  Left Elbow
8:  Right Elbow
9:  Left Wrist
10: Right Wrist
11: Left Hip
12: Right Hip
13: Left Knee
14: Right Knee
15: Left Ankle
16: Right Ankle
```

### 2. Angle Calculation

**Formula:**
```javascript
angle = atan2(c.y - b.y, c.x - b.x) - atan2(a.y - b.y, a.x - b.x)
```

**Converts to degrees:**
```javascript
angle = abs(radians * 180 / π)
```

**Normalizes to 0-180°:**
```javascript
if (angle > 180) angle = 360 - angle
```

### 3. Exercise-Specific Analysis

#### Squats (Score: 0-10 points)

**Angles Measured:**

1. **Knee Angle** (Hip → Knee → Ankle)
   - Target: < 90° for full depth
   - Scoring: 0-3 points

2. **Hip Angle** (Shoulder → Hip → Knee)
   - Target: 45-100° for proper hinge
   - Scoring: 0-2 points

3. **Back Lean** (Vertical alignment)
   - Target: < 45° from vertical
   - Scoring: 0-2 points

4. **Ankle Angle** (Knee → Ankle → Floor)
   - Target: 70-110° for proper mobility
   - Scoring: 0-1 point

5. **Knee Tracking** (Knee Distance / Hip Width Ratio)
   - Target: 0.85-1.5 for proper tracking
   - Scoring: 0-2 points
   - **How it works:**
     - Calculates distance between knees using Euclidean formula: `√((x₂-x₁)² + (y₂-y₁)²)`
     - Normalizes by dividing by hip width for body-size independence
     - Detects **knee valgus** (knees caving in) when ratio < 0.85
     - Detects **stance too wide** when ratio > 1.5
   - **Acceptable Ranges:**
     - < 0.85: ⚠️ Knees caving in (high injury risk)
     - 0.85-1.0: Slightly narrow but acceptable
     - 1.0-1.3: ✅ Ideal range
     - 1.3-1.5: Slightly wide but acceptable
     - \> 1.5: ⚠️ Stance too wide

**Feedback Logic:**
- 9-10 points: "🏆 Perfect Form!"
- 5-8 points: Specific corrections
- 0-4 points: Multiple form issues

#### Push-ups (Score: 0-10 points)

**Angles Measured:**

1. **Elbow Angle** (Shoulder → Elbow → Wrist)
   - Target: 80-100° at bottom
   - Scoring: 0-3 points

2. **Shoulder Angle** (Elbow → Shoulder → Hip)
   - Target: 70-100° for proper scapular position
   - Scoring: 0-2 points

3. **Back Straightness** (Shoulder → Hip → Knee)
   - Target: 160-200° (straight plank)
   - Scoring: 0-2 points

4. **Knee Angle** (Hip → Knee → Ankle)
   - Target: 160-200° (straight legs)
   - Scoring: 0-2 points

5. **Full Body Alignment** (Shoulder → Hip → Ankle)
   - Target: 165-195° (perfect plank)
   - Scoring: 0-1 point

**Feedback Logic:**
- 9-10 points: "🏆 Perfect Form!"
- 6-8 points: Specific corrections
- 0-5 points: Multiple form issues

### 4. Visual Feedback System

**Skeleton Overlay:**
- Green lines: Joint connections
- Red circles: Joint positions
- Only drawn when confidence > 0.3

**On-Screen Metrics:**
- Real-time angle measurements
- Form score (X/8 or X/10)
- White text with black outline for visibility

**Feedback Box:**
- Color-coded by form quality
- Dynamic text with specific corrections
- Smooth transitions

## Camera Requirements

### Optimal Setup

**For Both Exercises:**
- **Angle:** Side view (90° perpendicular)
- **Distance:** 5-8 feet from camera
- **Height:** Chest/waist level
- **Lighting:** Well-lit from front
- **Background:** Solid, contrasting color
- **Frame:** Full body visible (head to feet)

**Why Side View:**
- Best visibility of all critical angles
- Clear depth perception
- Minimal keypoint occlusion
- Accurate angle calculations

## Authentication & Multi-User System

### User Roles
1. **Coach:**
   - Manage multiple athletes
   - Receive real-time help requests
   - Dashboard with athlete status
   - Add members via 6-digit code

2. **Athlete:**
   - Unique connection code
   - Access AI training tools
   - "Call Coach" feature sends dashboard notifications

### Connection Flow
1. Athlete signs up → Receives unique **6-digit code**
2. Coach enters code in dashboard "Add Member"
3. Athlete receives **Connection Request**
4. Athlete accepts request → Accounts are linked

### Privacy & Data
- **Local Storage:** All user data, connections, and notifications are stored locally in the browser (`localStorage`).
- **No Server:** No data is sent to external servers.
- **Privacy Notice:** Users are notified that video processing is local-only.

## Performance

### Optimization Techniques
1. **Model Choice:** SINGLEPOSE_LIGHTNING (fastest variant)
2. **Frame Rate Limiting:** Capped at 30 FPS for mobile compatibility
   - Reduces battery drain on mobile devices
   - Ensures consistent performance across devices
   - Uses `performance.now()` for precise timing
3. **Frame Processing:** requestAnimationFrame loop with throttling
4. **Confidence Filtering:** Only process keypoints > 0.3 score
5. **Efficient Rendering:** Single canvas context

### Expected Performance
- **Desktop:** 30 FPS (capped for consistency)
- **Mobile:** 30 FPS (optimized for battery life)
- **Model Load Time:** 2-5 seconds
- **Camera Init Time:** 1-2 seconds

### Frame Rate Details
The application limits frame processing to **30 FPS** regardless of device capability. This provides:
- ✅ Consistent experience across all devices
- ✅ Reduced CPU/GPU usage
- ✅ Better battery life on mobile devices
- ✅ Smooth real-time feedback without performance issues

## Browser Compatibility

### Supported Browsers
- ✅ Chrome 90+ (Recommended)
- ✅ Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+

### Requirements
- WebRTC support (getUserMedia)
- WebGL support (TensorFlow.js)
- ES6+ JavaScript support
- Canvas API support

### Mobile Support
- ✅ iOS Safari 14+
- ✅ Chrome Mobile 90+
- ⚠️ Requires HTTPS or localhost
- ⚠️ Some older devices may struggle with performance

## Security & Privacy

### Data Handling
- ✅ All processing done locally (client-side)
- ✅ No video/images sent to servers
- ✅ No data storage
- ✅ Camera access only when granted

### Privacy Features
- Camera permission required
- Video feed not recorded
- No analytics tracking
- No external API calls (except CDN for libraries)

## Troubleshooting

### Common Issues

**Camera Not Working:**
- Check browser permissions
- Ensure HTTPS or localhost
- Try different browser
- Close other apps using camera

**Poor Detection:**
- Improve lighting
- Use solid background
- Ensure full body in frame
- Position camera at side angle

**Low Performance:**
- Close other browser tabs
- Use desktop instead of mobile
- Reduce video resolution
- Update browser

**Form Feedback Issues:**
- Verify side view angle
- Check all body parts visible
- Ensure good lighting
- Move closer/farther from camera

## Future Enhancements

### Potential Features
1. Rep counting
2. Workout history tracking
3. Video recording for review
4. Multiple exercise support
5. Real-time coach video call integration
6. Progress tracking dashboard
7. Custom form thresholds
8. Export workout data

## Development

### Running Locally

```bash
# Navigate to project directory
cd /home/devcrox/Documents/Hackaton

# Start local server
python3 -m http.server 8000

# Open browser
http://localhost:8000
```

### Testing on Mobile

```bash
# Find your local IP
hostname -I

# Access from mobile on same WiFi
http://192.168.1.109:8000
```

## Credits

**Technologies:**
- TensorFlow.js by Google
- MoveNet by Google Research
- Modern web standards (HTML5, CSS3, ES6+)

**Developed for:**
- Real-time fitness form analysis
- Accessible AI-powered coaching
- Privacy-focused local processing

---

**Version:** 1.0  
**Last Updated:** 2026-02-13  
**License:** MIT
