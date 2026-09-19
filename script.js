(() => {
  "use strict";

  const CONFIG = Object.freeze({
    camera: {
      idealWidth: 1280,
      idealHeight: 720,
      frameRate: 30
    },
    tracking: {
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    },
    smoothing: {
      min: 0.20,
      max: 0.62,
      velocityThreshold: 0.018,
      maxJump: 0.16
    },
    drawing: {
      lineWidth: 6,
      color: "#ff2f9f",
      minPointDistance: 1.5,
      interpolationSteps: 2
    },
    performance: {
      uiUpdateInterval: 180
    }
  });

  const AppState = {
    cameraActive: false,
    handDetected: false,
    drawing: false,
    cursorVisible: false,
    currentMode: "Idle",
    fps: 0,
    latency: 0,
    canvasWidth: 0,
    canvasHeight: 0,
    videoWidth: 0,
    videoHeight: 0,
    processing: false,
    lastResultsAt: 0,
    lastUiUpdate: 0,
    error: null
  };

  class UIManager {
    constructor() {
      this.el = {
        workspace: document.getElementById("workspace"),
        emptyState: document.getElementById("emptyState"),
        systemState: document.getElementById("systemState"),
        systemStateText: document.getElementById("systemStateText"),
        startStopButton: document.getElementById("startStopButton"),
        startStopText: document.getElementById("startStopText"),
        startStopIcon: document.getElementById("startStopIcon"),
        heroStart: document.getElementById("heroStart"),
        clearButton: document.getElementById("clearButton"),
        handStatus: document.getElementById("handStatus"),
        modeStatus: document.getElementById("modeStatus"),
        drawStatus: document.getElementById("drawStatus"),
        fpsValue: document.getElementById("fpsValue"),
        latencyValue: document.getElementById("latencyValue"),
        workspaceMode: document.getElementById("workspaceMode"),
        trackingText: document.getElementById("trackingText"),
        toast: document.getElementById("toast"),
        toastTitle: document.getElementById("toastTitle"),
        toastMessage: document.getElementById("toastMessage"),
        toastAction: document.getElementById("toastAction"),
        helpToggle: document.getElementById("helpToggle"),
        helpContent: document.getElementById("helpContent")
      };
      this.toastTimer = null;
      this.bind();
    }

    bind() {
      this.el.helpToggle.addEventListener("click", () => {
        const expanded = this.el.helpToggle.getAttribute("aria-expanded") === "true";
        this.el.helpToggle.setAttribute("aria-expanded", String(!expanded));
        this.el.helpContent.hidden = expanded;
      });
    }

    setSystemState(type, label) {
      this.el.systemState.dataset.state = type;
      this.el.systemStateText.textContent = label;
    }

    setWorkspaceActive(active) {
      this.el.workspace.classList.toggle("is-active", active);
    }

    setRunning(running) {
      this.el.startStopText.textContent = running ? "STOP" : "START";
      this.el.startStopIcon.textContent = running ? "■" : "▶";
      this.el.startStopButton.setAttribute("aria-label", running ? "Stop camera and hand tracking" : "Start camera and hand tracking");
    }

    updateState(force = false) {
      const now = performance.now();
      if (!force && now - AppState.lastUiUpdate < CONFIG.performance.uiUpdateInterval) return;
      AppState.lastUiUpdate = now;

      this.el.handStatus.textContent = AppState.handDetected ? "Detected" : "Not detected";
      this.el.modeStatus.textContent = AppState.currentMode;
      this.el.drawStatus.textContent = AppState.drawing ? "ON" : "OFF";
      this.el.fpsValue.textContent = AppState.fps ? String(Math.round(AppState.fps)) : "—";
      this.el.latencyValue.textContent = AppState.latency ? `${Math.round(AppState.latency)}ms` : "—";
      this.el.workspaceMode.textContent = AppState.drawing ? "DRAWING" : AppState.handDetected ? "TRACKING" : "IDLE";
      this.el.trackingText.textContent = AppState.drawing ? "Air drawing active" : AppState.handDetected ? "Hand detected" : AppState.cameraActive ? "Searching for hand" : "Tracking standby";
    }

    showError(title, message, retry) {
      this.el.toastTitle.textContent = title;
      this.el.toastMessage.textContent = message;
      this.el.toastAction.hidden = !retry;
      this.el.toast.classList.add("show");
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.hideToast(), 6500);
      this._retry = retry || null;
    }

    hideToast() {
      this.el.toast.classList.remove("show");
      this.el.toastAction.hidden = true;
    }

    setReady() {
      this.setSystemState("ready", "READY");
      this.el.workspace.classList.remove("is-active");
      this.updateState(true);
    }

    setActive() {
      this.setSystemState("active", "CAMERA ACTIVE");
      this.setWorkspaceActive(true);
      this.updateState(true);
    }
  }

  class PerformanceManager {
    constructor() {
      this.frameCount = 0;
      this.windowStart = performance.now();
      this.lastFrame = performance.now();
    }

    tick() {
      const now = performance.now();
      this.frameCount++;
      const elapsed = now - this.windowStart;
      if (elapsed >= 1000) {
        AppState.fps = (this.frameCount * 1000) / elapsed;
        this.frameCount = 0;
        this.windowStart = now;
      }
      this.lastFrame = now;
    }

    measureLatency() {
      if (AppState.lastResultsAt) AppState.latency = performance.now() - AppState.lastResultsAt;
    }
  }

  class CursorManager {
    constructor(element) {
      this.el = element;
      this.x = 0;
      this.y = 0;
      this.targetX = 0;
      this.targetY = 0;
      this.initialized = false;
      this.raf = null;
      this.animate = this.animate.bind(this);
      requestAnimationFrame(this.animate);
    }

    setTarget(x, y) {
      this.targetX = x;
      this.targetY = y;
      if (!this.initialized) {
        this.x = x;
        this.y = y;
        this.initialized = true;
      }
      this.show();
    }

    show() {
      this.el.classList.add("visible");
      this.el.classList.remove("lost");
      AppState.cursorVisible = true;
    }

    hide() {
      this.el.classList.remove("visible", "drawing");
      this.el.classList.add("lost");
      AppState.cursorVisible = false;
    }

    setDrawing(active) {
      this.el.classList.toggle("drawing", active);
    }

    reset() {
      this.initialized = false;
      this.hide();
      this.el.style.transform = "translate3d(-100px,-100px,0)";
    }

    animate() {
      const smoothing = 0.34;
      this.x += (this.targetX - this.x) * smoothing;
      this.y += (this.targetY - this.y) * smoothing;
      if (this.initialized) {
        this.el.style.transform = `translate3d(${this.x - 21}px, ${this.y - 21}px, 0)`;
      }
      requestAnimationFrame(this.animate);
    }
  }

  class CoordinateTransformer {
    constructor(video, workspace, canvas) {
      this.video = video;
      this.workspace = workspace;
      this.canvas = canvas;
      this.metrics = null;
    }

    resize() {
      const rect = this.workspace.getBoundingClientRect();
      const vw = this.video.videoWidth || CONFIG.camera.idealWidth;
      const vh = this.video.videoHeight || CONFIG.camera.idealHeight;
      const cw = rect.width;
      const ch = rect.height;

      const scale = Math.max(cw / vw, ch / vh);
      const displayWidth = vw * scale;
      const displayHeight = vh * scale;
      const offsetX = (cw - displayWidth) / 2;
      const offsetY = (ch - displayHeight) / 2;

      this.metrics = { cw, ch, vw, vh, scale, displayWidth, displayHeight, offsetX, offsetY };
      AppState.canvasWidth = cw;
      AppState.canvasHeight = ch;
      AppState.videoWidth = vw;
      AppState.videoHeight = vh;
    }

    normalizedToCanvas(landmark) {
      if (!this.metrics) this.resize();
      const m = this.metrics;

      // The video is CSS-mirrored, so mirror X to match the visible preview.
      const mirroredX = 1 - landmark.x;
      return {
        x: mirroredX * m.displayWidth + m.offsetX,
        y: landmark.y * m.displayHeight + m.offsetY
      };
    }
  }

  class DrawingEngine {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
      this.previous = null;
      this.previousRaw = null;
      this.active = false;
      this.dpr = 1;
    }

    resize(width, height) {
      this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const old = this.canvas;
      const snapshot = this._snapshot();
      old.width = Math.max(1, Math.round(width * this.dpr));
      old.height = Math.max(1, Math.round(height * this.dpr));
      old.style.width = `${width}px`;
      old.style.height = `${height}px`;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.ctx.lineCap = "round";
      this.ctx.lineJoin = "round";
      this.ctx.lineWidth = CONFIG.drawing.lineWidth;
      this.ctx.strokeStyle = CONFIG.drawing.color;
      this.ctx.shadowColor = "rgba(255,47,159,.34)";
      this.ctx.shadowBlur = 5;
      if (snapshot) this._restore(snapshot, width, height);
    }

    _snapshot() {
      if (!this.canvas.width || !this.canvas.height) return null;
      const copy = document.createElement("canvas");
      copy.width = this.canvas.width;
      copy.height = this.canvas.height;
      copy.getContext("2d").drawImage(this.canvas, 0, 0);
      return copy;
    }

    _restore(snapshot, width, height) {
      this.ctx.save();
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.globalAlpha = 1;
      this.ctx.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, width * this.dpr, height * this.dpr);
      this.ctx.restore();
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    begin() {
      this.active = true;
      this.previous = null;
      this.previousRaw = null;
    }

    stop() {
      this.active = false;
      this.previous = null;
      this.previousRaw = null;
    }

    draw(point) {
      if (!this.active || !point) return;
      if (!this.previous) {
        this.previous = { ...point };
        this.previousRaw = { ...point };
        return;
      }

      const dx = point.x - this.previousRaw.x;
      const dy = point.y - this.previousRaw.y;
      const distance = Math.hypot(dx, dy);

      // Ignore impossible landmark jumps.
      const diagonal = Math.hypot(AppState.canvasWidth, AppState.canvasHeight);
      if (distance > diagonal * CONFIG.smoothing.maxJump) {
        this.stop();
        return;
      }

      if (distance < CONFIG.drawing.minPointDistance) return;

      const speed = Math.min(1, distance / 35);
      const alpha = CONFIG.smoothing.max - (CONFIG.smoothing.max - CONFIG.smoothing.min) * speed;
      const smoothed = {
        x: this.previous.x + (point.x - this.previous.x) * alpha,
        y: this.previous.y + (point.y - this.previous.y) * alpha
      };

      const steps = Math.max(1, Math.min(4, Math.ceil(distance / 16) * CONFIG.drawing.interpolationSteps));
      this.ctx.beginPath();
      this.ctx.moveTo(this.previous.x, this.previous.y);

      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = this.previous.x + (smoothed.x - this.previous.x) * t;
        const y = this.previous.y + (smoothed.y - this.previous.y) * t;
        this.ctx.lineTo(x, y);
      }

      this.ctx.stroke();
      this.previous = smoothed;
      this.previousRaw = { ...point };
    }

    clear() {
      this.ctx.save();
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.stop();
    }
  }

  class GestureEngine {
    constructor() {
      this.lastDrawing = false;
    }

    evaluate(landmarks) {
      if (!landmarks || landmarks.length < 21) {
        return { draw: false, mode: "Idle" };
      }

      const wrist = landmarks[0];
      const indexTip = landmarks[8];
      const indexPip = landmarks[6];
      const indexMcp = landmarks[5];

      // Stage 1 gesture: index clearly extended.
      // Comparing segment geometry rather than a fixed screen direction keeps
      // the gesture useful when the hand is tilted or rotated.
      const tipToWrist = this.distance(indexTip, wrist);
      const pipToWrist = this.distance(indexPip, wrist);
      const mcpToWrist = this.distance(indexMcp, wrist);
      const extended = tipToWrist > pipToWrist * 1.16 && pipToWrist > mcpToWrist * 1.05;

      return {
        draw: extended,
        mode: extended ? "Drawing" : "Tracking"
      };
    }

    distance(a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    }
  }

  class HandTracker {
    constructor(video, onResults, onFailure) {
      this.video = video;
      this.onResults = onResults;
      this.onFailure = onFailure;
      this.hands = null;
      this.running = false;
      this.raf = null;
      this.lastSent = 0;
      this.frameInterval = 1000 / CONFIG.camera.frameRate;
      this.init();
    }

    init() {
      if (typeof window.Hands !== "function") {
        throw new Error("MediaPipe Hands library is unavailable.");
      }

      this.hands = new window.Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`
      });

      this.hands.setOptions(CONFIG.tracking);
      this.hands.onResults((results) => this.onResults(results));
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.lastSent = 0;
      this.loop();
    }

    async loop(now = performance.now()) {
      if (!this.running) return;

      if (!AppState.processing && this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        if (now - this.lastSent >= this.frameInterval) {
          this.lastSent = now;
          AppState.processing = true;
          try {
            await this.hands.send({ image: this.video });
          } catch (error) {
            this.onFailure(error);
          } finally {
            AppState.processing = false;
          }
        }
      }

      this.raf = requestAnimationFrame((time) => this.loop(time));
    }

    stop() {
      this.running = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
      this.running = false;
    }
  }

  class CameraManager {
    constructor(video) {
      this.video = video;
      this.stream = null;
      this.deviceId = null;
    }

    async getPreferredDevice() {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(d => d.kind === "videoinput");
      if (!cameras.length) return null;

      const front = cameras.find(d => /front|user|facetime|integrated/i.test(d.label));
      return front || cameras[0];
    }

    async start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access is not supported in this browser.");
      }

      const preferred = await this.getPreferredDevice();
      const videoConstraints = {
        width: { ideal: CONFIG.camera.idealWidth },
        height: { ideal: CONFIG.camera.idealHeight },
        frameRate: { ideal: CONFIG.camera.frameRate, max: 30 },
        facingMode: { ideal: "user" }
      };

      if (preferred?.deviceId) videoConstraints.deviceId = { ideal: preferred.deviceId };

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraints
      });

      this.video.srcObject = this.stream;
      await this.video.play();
      this.deviceId = this.stream.getVideoTracks()[0]?.getSettings()?.deviceId || null;

      const track = this.stream.getVideoTracks()[0];
      track?.addEventListener?.("ended", () => this.handleUnexpectedStop());
    }

    handleUnexpectedStop() {
      if (AppState.cameraActive) {
        window.app?.handleCameraLoss();
      }
    }

    stop() {
      this.stream?.getTracks().forEach(track => track.stop());
      this.stream = null;
      this.video.pause();
      this.video.srcObject = null;
    }
  }

  class AirMathsApp {
    constructor() {
      this.ui = new UIManager();
      this.video = document.getElementById("cameraVideo");
      this.canvas = document.getElementById("drawingCanvas");
      this.workspace = document.getElementById("workspace");
      this.cursor = new CursorManager(document.getElementById("fingerCursor"));
      this.performance = new PerformanceManager();
      this.camera = new CameraManager(this.video);
      this.transformer = new CoordinateTransformer(this.video, this.workspace, this.canvas);
      this.drawing = new DrawingEngine(this.canvas);
      this.gesture = new GestureEngine();
      this.tracker = null;
      this.resizeObserver = null;
      this.boundResize = this.resize.bind(this);
      this.onResults = this.onResults.bind(this);
      this.onTrackingFailure = this.onTrackingFailure.bind(this);
      this.bindEvents();
      this.resize();
      this.ui.setReady();
    }

    bindEvents() {
      this.ui.el.startStopButton.addEventListener("click", () => this.toggle());
      this.ui.el.heroStart.addEventListener("click", () => this.start());
      this.ui.el.clearButton.addEventListener("click", () => this.clear());

      this.ui.el.toastAction.addEventListener("click", () => {
        const retry = this.ui._retry;
        this.ui.hideToast();
        if (retry) retry();
      });

      window.addEventListener("resize", this.boundResize, { passive: true });
      window.addEventListener("orientationchange", () => setTimeout(this.boundResize, 120), { passive: true });
      window.visualViewport?.addEventListener("resize", this.boundResize, { passive: true });

      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.workspace);

      document.addEventListener("visibilitychange", () => {
        if (document.hidden && AppState.cameraActive) {
          this.drawing.stop();
          this.cursor.hide();
        }
      });

      this.video.addEventListener("loadedmetadata", () => this.resize(), { passive: true });
    }

    async start() {
      if (AppState.cameraActive) return this.stop();

      this.ui.setSystemState("ready", "STARTING");
      this.ui.el.startStopButton.disabled = true;

      try {
        if (!this.tracker) {
          this.tracker = new HandTracker(this.video, this.onResults, this.onTrackingFailure);
        }

        await this.camera.start();
        this.transformer.resize();
        this.drawing.resize(AppState.canvasWidth, AppState.canvasHeight);

        AppState.cameraActive = true;
        AppState.error = null;
        this.ui.el.startStopButton.disabled = false;
        this.ui.setRunning(true);
        this.ui.setActive();
        this.tracker.start();
        this.ui.updateState(true);
      } catch (error) {
        console.error("Air Maths Board start error:", error);
        AppState.cameraActive = false;
        AppState.error = error;
        this.ui.el.startStopButton.disabled = false;
        this.ui.setRunning(false);
        this.ui.setSystemState("error", "ERROR");
        this.ui.showError(
          "Camera unavailable",
          this.friendlyCameraError(error),
          () => this.start()
        );
        this.ui.updateState(true);
      }
    }

    friendlyCameraError(error) {
      const name = error?.name || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        return "Camera permission is required to use Air Maths Board.";
      }
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        return "No usable camera was found on this device.";
      }
      if (name === "NotReadableError" || name === "TrackStartError") {
        return "The camera may already be in use by another application.";
      }
      if (name === "SecurityError") {
        return "Camera access requires a secure origin such as HTTPS or localhost.";
      }
      return "The camera could not be started. Check browser permissions and try again.";
    }

    async stop() {
      this.tracker?.stop();
      this.camera.stop();
      this.drawing.stop();
      this.cursor.reset();

      AppState.cameraActive = false;
      AppState.handDetected = false;
      AppState.drawing = false;
      AppState.currentMode = "Idle";
      AppState.latency = 0;

      this.ui.setRunning(false);
      this.ui.setReady();
      this.ui.updateState(true);
    }

    clear() {
      this.drawing.clear();
      AppState.drawing = false;
      this.ui.updateState(true);
    }

    handleCameraLoss() {
      this.tracker?.stop();
      this.drawing.stop();
      this.cursor.reset();
      AppState.cameraActive = false;
      AppState.handDetected = false;
      AppState.drawing = false;
      AppState.currentMode = "Idle";
      this.ui.setRunning(false);
      this.ui.setSystemState("error", "ERROR");
      this.ui.showError("Connection lost", "Camera connection lost.", () => this.start());
      this.ui.updateState(true);
    }

    onTrackingFailure(error) {
      console.error("Hand tracking error:", error);
      this.tracker?.stop();
      this.drawing.stop();
      this.cursor.reset();
      AppState.handDetected = false;
      AppState.drawing = false;
      AppState.currentMode = "Idle";
      this.ui.setSystemState("error", "ERROR");
      this.ui.showError("Tracking error", "Hand tracking could not be initialized or recovered.", () => {
        this.tracker = null;
        this.start();
      });
      this.ui.updateState(true);
    }

    onResults(results) {
      if (!AppState.cameraActive) return;

      AppState.lastResultsAt = performance.now();
      this.performance.measureLatency();

      const landmarks = results.multiHandLandmarks?.[0];

      if (!landmarks) {
        AppState.handDetected = false;
        AppState.drawing = false;
        AppState.currentMode = "Idle";
        this.drawing.stop();
        this.cursor.hide();
        this.performance.tick();
        this.ui.updateState();
        return;
      }

      AppState.handDetected = true;
      const indexTip = landmarks[8];
      const point = this.transformer.normalizedToCanvas(indexTip);

      // Ignore points that land outside the visible workspace.
      const inside = point.x >= 0 && point.x <= AppState.canvasWidth &&
                     point.y >= 0 && point.y <= AppState.canvasHeight;

      if (!inside) {
        AppState.drawing = false;
        AppState.currentMode = "Tracking";
        this.drawing.stop();
        this.cursor.setDrawing(false);
        this.cursor.setTarget(
          Math.min(AppState.canvasWidth, Math.max(0, point.x)),
          Math.min(AppState.canvasHeight, Math.max(0, point.y))
        );
        this.ui.updateState();
        return;
      }

      this.cursor.setTarget(point.x, point.y);

      const gesture = this.gesture.evaluate(landmarks);
      AppState.drawing = gesture.draw;
      AppState.currentMode = gesture.mode;

      if (gesture.draw) {
        if (!this.drawing.active) this.drawing.begin();
        this.drawing.draw(point);
      } else {
        this.drawing.stop();
      }

      this.cursor.setDrawing(gesture.draw);
      this.performance.tick();
      this.ui.updateState();
    }

    resize() {
      if (!this.workspace) return;
      this.transformer.resize();
      if (AppState.canvasWidth > 0 && AppState.canvasHeight > 0) {
        this.drawing.resize(AppState.canvasWidth, AppState.canvasHeight);
      }
      this.ui.updateState(true);
    }
  }

  function boot() {
    try {
      if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
        // The UI can still load; camera start will explain the secure-origin requirement.
        console.warn("Camera access generally requires HTTPS or localhost.");
      }
      window.app = new AirMathsApp();
    } catch (error) {
      console.error("Air Maths Board boot failure:", error);
      const state = document.getElementById("systemState");
      const text = document.getElementById("systemStateText");
      state.dataset.state = "error";
      text.textContent = "ERROR";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
