const screens = new Map(
  [...document.querySelectorAll("[data-screen]")].map((screen) => [screen.dataset.screen, screen])
);

const nodes = {
  app: document.querySelector("#app"),
  splash: document.querySelector("#splash"),
  videoInput: document.querySelector("#videoInput"),
  yoloCsvInput: document.querySelector("#yoloCsvInput"),
  progressBar: document.querySelector("#progressBar"),
  analysisMessage: document.querySelector("#analysisMessage"),
  sourceVideo: document.querySelector("#sourceVideo"),
  videoPlaceholder: document.querySelector("#videoPlaceholder"),
  videoIssue: document.querySelector("#videoIssue"),
  videoName: document.querySelector("#videoName"),
  rimPickLayer: document.querySelector("#rimPickLayer"),
  calibrationGuide: document.querySelector("#calibrationGuide"),
  engineStatus: document.querySelector("#engineStatus"),
  overlayCanvas: document.querySelector("#overlayCanvas"),
  metricCard: document.querySelector("#metricCard")
};

const savedLanguageRaw = localStorage.getItem("arcai:language");
const savedLanguage = savedLanguageRaw || ((navigator.language || "").toLowerCase().startsWith("ja") ? "ja" : "en");
const savedPlaybackRate = Number(localStorage.getItem("arcai:playback-rate"));

const state = {
  screen: "home",
  language: savedLanguage === "en" ? "en" : "ja",
  playbackRate: [0.25, 0.5, 1].includes(savedPlaybackRate) ? savedPlaybackRate : 1,
  activeMetricKey: null,
  selectedFile: null,
  selectedUrl: "",
  selectedUrlIsObject: false,
  activeTab: "ball",
  activeView: "full",
  analysis: null,
  previousSnapshot: null,
  snapshotSaved: false,
  animationId: 0,
  poseEngine: null,
  poseEnginePromise: null,
  poseResult: null,
  lastPoseTime: -1,
  poseSamples: [],
  heldPoseMetrics: {},
  poseMetricsHeld: false,
  lastPoseSampleTime: -1,
  lastMetricRender: 0,
  probeCanvas: document.createElement("canvas"),
  motionCanvas: document.createElement("canvas"),
  previousLuma: null,
  lastMotionTime: -1,
  lastBallCandidate: null,
  ballTemplate: null,
  ballTemplateMisses: 0,
  ballManualIndex: 0,
  ballManualLimit: 5,
  ballTrail: [],
  importedBallTrail: [],
  importedBallSource: "",
  lastBallTime: -1,
  ballStatus: "pending",
  rim: null,
  rimPickMode: "idle",
  lastPickAt: 0,
  videoIssue: null,
  fileCodec: null
};

const demoVideoSrc = "./assets/sample-shot.mp4?v=20260619-arcai-35";
const RIM_DIAMETER_M = 0.45;
const SNAPSHOT_KEY = "arcai:last-analysis:v1";
const POSE_METRIC_KEYS = new Set([
  "dip_depth_pct",
  "set_point_height_m",
  "wrist_height_pct",
  "knee_range_deg",
  "hip_range_deg",
  "trunk_lean_deg",
  "lower_to_wrist_score",
  "hand_shot_risk",
  "kinetic_chain_index",
  "knee_to_release_ms",
  "grf_release_coupling_ms",
  "vgrf_proxy_peak_bw",
  "landing_drift_pct"
]);

const localPoseApiCandidates = [
  {
    module: "http://localhost:4173/vendor/tasks-vision/vision_bundle.mjs",
    wasm: "http://localhost:4173/vendor/tasks-vision/wasm",
    model: "http://localhost:4173/assets/models/pose_landmarker_lite.task"
  },
  {
    module: "./vendor/tasks-vision/vision_bundle.mjs",
    wasm: "./vendor/tasks-vision/wasm",
    model: "./assets/models/pose_landmarker_lite.task"
  }
];

const cdnPoseApiCandidate = {
  module: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs",
  wasm: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
  model:
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
};

const poseApiCandidates = (() => {
  const host = window.location.hostname;
  const isLocal = window.location.protocol === "file:" || host === "localhost" || host === "127.0.0.1" || host === "";
  if (isLocal) return [...localPoseApiCandidates, cdnPoseApiCandidate];
  return [cdnPoseApiCandidate, ...localPoseApiCandidates.slice(1)];
})();

const baseAnalysis = {
  status: "api_pending",
  shot_score: null,
  metrics: {
    release_angle_deg: null,
    arc_height_m: null,
    entry_arc_deg: null,
    release_height_m: null,
    ball_track_confidence: null,
    rim_scale_confidence: null,
    dip_depth_cm: null,
    dip_depth_pct: null,
    set_point_height_m: null,
    wrist_height_pct: null,
    knee_range_deg: null,
    hip_range_deg: null,
    trunk_lean_deg: null,
    lower_to_wrist_score: null,
    hand_shot_risk: null,
    kinetic_chain_index: null,
    knee_to_release_ms: null,
    grf_release_coupling_ms: null,
    vgrf_proxy_peak_bw: null,
    landing_drift_cm: null,
    landing_drift_pct: null
  }
};

const uiCopy = {
  en: {
    homeSubtitle: "Analyze Your Shot",
    uploadVideo: "Upload Video",
    loadYoloCsv: "YOLO CSV",
    demoAnalysis: "Demo Analysis",
    analyzingTitle: "Analyzing...",
    resultTitle: "Shot record",
    briefKicker: "Observation-first",
    briefTitle: "Data for coach discussion",
    briefBody: "ArcAI visualizes measurable motion and comparison data. It does not prescribe coaching corrections.",
    originalLabel: "Original",
    originalVideo: "Original Video",
    setRim: "Set Rim",
    setBall: "Set Ball",
    speedLabel: "Speed",
    slowMotionLabel: "Slow",
    observation: "Observation",
    coachDiscussion: "Coach Discussion",
    pending: "Pending",
    estimated: "Estimated",
    range: "Range",
    peak: "Peak",
    score: "Score",
    timing: "Timing",
    confidence: "Confidence",
    proxy: "Proxy",
    live: "Live",
    held: "Held",
    videoNotReadyTitle: "Video not ready",
    videoNotReadyBody: "Wait until the uploaded video is visible, then set the rim.",
    tapRimCenterTitle: "Tap rim center",
    tapRimCenterBody: "Use the original video. Next, tap the rim edge to calibrate scale.",
    tapRimEdgeTitle: "Tap rim edge",
    tapRimEdgeBody: "Tap the visible left or right edge of the rim.",
    tapBallTitle: "Tap ball",
    tapBallBody: "Tap the ball once in the original video to help the motion tracker lock on.",
    ballSeededTitle: "Ball seed set",
    ballSeededBody: "ArcAI will use this point as the first motion-tracking anchor.",
    noticeVideoTitle: "Video not decodable",
    noticeVideoBody: "Convert HEVC/MOV to H.264 MP4 before analysis",
    noticePoseApiTitle: "Pose API unavailable",
    noticePoseApiBody: "MediaPipe is not loaded in this browser session",
    noticeLoadingTitle: "Loading Pose API",
    noticeLoadingBody: "No estimated landmarks are drawn yet",
    noticePoseTitle: "Pose not detected",
    noticePoseBody: "Use a side-view video with the full body visible",
    messages: [
      "ArcAI is reading the shot",
      "Detecting side-view landmarks",
      "Preparing rim calibration",
      "Checking motion transfer",
      "Estimating force proxy",
      "Building observation record"
    ]
  },
  ja: {
    homeSubtitle: "シュートを解析する",
    uploadVideo: "動画をアップロード",
    loadYoloCsv: "YOLO CSV読込",
    demoAnalysis: "デモ解析",
    analyzingTitle: "Analyzing...",
    resultTitle: "シュート記録",
    briefKicker: "観察に特化",
    briefTitle: "コーチと共有するための解析データ",
    briefBody: "ArcAIは計測できる動きと比較データを可視化します。改善方法の指示や診断は行いません。",
    originalLabel: "元動画",
    originalVideo: "元動画",
    setRim: "リング設定",
    setBall: "ボール補助",
    speedLabel: "速度",
    slowMotionLabel: "スロー",
    observation: "観察項目",
    coachDiscussion: "コーチと確認する視点",
    pending: "未確定",
    estimated: "推定",
    range: "幅",
    peak: "ピーク",
    score: "スコア",
    timing: "タイミング",
    confidence: "信頼度",
    proxy: "推定指標",
    live: "計測中",
    held: "固定表示",
    videoNotReadyTitle: "動画の準備中",
    videoNotReadyBody: "元動画が表示されてからリングを設定してください。",
    tapRimCenterTitle: "リング中心をタップ",
    tapRimCenterBody: "元動画上でリング中心をタップしてください。次にリング端をタップします。",
    tapRimEdgeTitle: "リング端をタップ",
    tapRimEdgeBody: "見えているリングの左右どちらかの端をタップしてください。",
    tapBallTitle: "ボールをタップ",
    tapBallBody: "元動画上でボールを1回タップすると、動体トラッカーの起点になります。",
    ballSeededTitle: "ボール起点を設定しました",
    ballSeededBody: "この点を最初の追跡アンカーとして使用します。",
    noticeVideoTitle: "動画を解析できません",
    noticeVideoBody: "HEVC/MOVの場合はH.264 MP4への変換が必要です",
    noticePoseApiTitle: "Pose APIを使用できません",
    noticePoseApiBody: "このブラウザセッションでMediaPipeが読み込まれていません",
    noticeLoadingTitle: "Pose APIを読み込み中",
    noticeLoadingBody: "まだ推定ランドマークは描画されていません",
    noticePoseTitle: "姿勢を検出できません",
    noticePoseBody: "身体全体が入る横方向の動画を使用してください",
    messages: [
      "ArcAIがシュートを読み込んでいます",
      "横方向の身体ランドマークを検出しています",
      "リング設定を準備しています",
      "下肢から手首への連動を確認しています",
      "仮想床反力を推定しています",
      "観察用レコードを作成しています"
    ]
  }
};

const tabContent = {
  ball: {
    title: "Ball Flight",
    rows: [
      ["release_angle_deg", "Release angle", (m) => formatMetric(m.release_angle_deg, "deg")],
      ["arc_height_m", "Arc height", (m) => formatMetric(m.arc_height_m, "m")],
      ["entry_arc_deg", "Entry angle", (m) => formatMetric(m.entry_arc_deg, "deg")],
      ["release_height_m", "Release height", (m) => formatMetric(m.release_height_m, "m")],
      ["ball_track_confidence", "Track confidence", (m) => formatMetric(m.ball_track_confidence, "%")]
    ],
    discussion:
      "Use these values as observation data for a coach. Ball metrics appear only when the rim is calibrated and motion tracking is stable.",
    note: "The current ball tracker is motion-based and experimental. It does not rely on orange color alone."
  },
  body: {
    title: "Body Motion",
    rows: [
      ["dip_depth_pct", "Dip depth", (m) => formatMetric(m.dip_depth_pct, "% height")],
      ["wrist_height_pct", "Wrist height", (m) => formatMetric(m.wrist_height_pct, "% height")],
      ["knee_range_deg", "Knee range", (m) => formatMetric(m.knee_range_deg, "deg")],
      ["trunk_lean_deg", "Trunk lean", (m) => formatMetric(m.trunk_lean_deg, "deg")]
    ],
    discussion:
      "Review whether the observed dip and trunk motion match the athlete's intended shot model before changing technique.",
    note: "These are 2D pose-derived proxies. Absolute cm/m values need camera calibration."
  },
  chain: {
    title: "Chain / Hand Shot",
    rows: [
      ["lower_to_wrist_score", "Chain score", (m) => formatMetric(m.lower_to_wrist_score, "/100")],
      ["hand_shot_risk", "Hand-shot risk", (m) => formatMetric(m.hand_shot_risk, "/100")],
      ["kinetic_chain_index", "Kinetic chain", (m) => formatMetric(m.kinetic_chain_index, "/100")],
      ["knee_to_release_ms", "Knee to wrist peak", (m) => formatMetric(m.knee_to_release_ms, "ms")]
    ],
    discussion:
      "This can support a coach conversation about whether the shot is one-motion, two-motion, or hybrid.",
    note: "Timing uses knee-extension and wrist-rise peaks. Ball release timing is estimated only after stable ball tracking."
  },
  force: {
    title: "Force Proxy",
    rows: [
      ["vgrf_proxy_peak_bw", "vGRF proxy", (m) => formatMetric(m.vgrf_proxy_peak_bw, "/100")],
      ["grf_release_coupling_ms", "GRF-wrist lag", (m) => formatMetric(m.grf_release_coupling_ms, "ms")],
      ["landing_drift_pct", "Foot drift", (m) => formatMetric(m.landing_drift_pct, "% height")],
      ["shot_score", "Shot score", (_, a) => formatMetric(a.shot_score, "%")]
    ],
    discussion:
      "A force proxy can show timing patterns, but it should not be treated as force-plate measurement.",
    note: "Force values are pose-timing proxies, not force-plate measurements."
  }
};

const tabContentJa = {
  ball: {
    title: "ボール軌道",
    labels: {
      release_angle_deg: "リリース角度",
      arc_height_m: "アーチ高",
      entry_arc_deg: "入射角",
      release_height_m: "リリース高",
      ball_track_confidence: "ボール追跡信頼度"
    },
    discussion:
      "リング設定とボール追跡が安定した時だけ表示します。コーチには、弾道の再現性やリリース位置と合わせて共有します。",
    note: "現在のボール追跡は軽量の動体推定です。オレンジ色だけに依存しませんが、YOLOなどの専用検出器ではありません。"
  },
  body: {
    title: "身体動作",
    labels: {
      dip_depth_pct: "Dipの深さ",
      wrist_height_pct: "手首の最高位置",
      knee_range_deg: "膝関節の運動幅",
      trunk_lean_deg: "体幹傾斜"
    },
    discussion:
      "数値だけで良し悪しを決めず、選手が目指すワンモーション/ツーモーション/ハイブリッドの型と照らして確認します。",
    note: "2D姿勢推定からの指標です。cmやmの絶対値にはカメラ校正が必要です。"
  },
  chain: {
    title: "連動性 / 手打ち",
    labels: {
      lower_to_wrist_score: "下肢から手首までの連動性",
      hand_shot_risk: "手打ち傾向",
      kinetic_chain_index: "運動連鎖",
      knee_to_release_ms: "膝伸展から手首上昇ピーク"
    },
    discussion:
      "下肢の伸展、体幹、上肢、手首のタイミング差を、指導者と共有する観察データとして使います。",
    note: "膝伸展ピークと手首上昇ピークのタイミングから推定します。ボールリリース時刻は追跡が安定した時だけ扱います。"
  },
  force: {
    title: "床反力proxy",
    labels: {
      vgrf_proxy_peak_bw: "下肢伸展proxyピーク",
      grf_release_coupling_ms: "床反力と手首のずれ",
      landing_drift_pct: "接地位置のぶれ",
      shot_score: "Shot score"
    },
    discussion:
      "姿勢推定から算出した下肢伸展proxyと、手首上昇へ向かう動きのずれを観察します。",
    note: "これはフォースプレートの実測床反力ではありません。現段階では2D姿勢推定から作るproxyです。"
  }
};

const metricTagByKey = {
  dip_depth_pct: "range",
  knee_range_deg: "range",
  hip_range_deg: "range",
  landing_drift_pct: "range",
  wrist_height_pct: "peak",
  trunk_lean_deg: "peak",
  vgrf_proxy_peak_bw: "proxy",
  grf_release_coupling_ms: "timing",
  lower_to_wrist_score: "score",
  hand_shot_risk: "score",
  kinetic_chain_index: "score",
  knee_to_release_ms: "timing",
  ball_track_confidence: "confidence",
  rim_scale_confidence: "confidence"
};

const metricDetails = {
  ja: {
    release_angle_deg: {
      what: "ボールが手から離れた直後の上向き角度です。",
      reference: "ワンモーション参考: フリースロー研究では46-54°程度が扱われますが、距離・身長・リリース高で変わります。",
      read: "毎回の再現性を見る項目です。1回だけの高低より、成功ショット平均との差を見る方が安全です。",
      limit: "現在はボール追跡が安定した時だけ表示します。"
    },
    arc_height_m: {
      what: "ボール最高点がリングよりどれだけ高いかの推定値です。",
      reference: "ワンモーション参考: 固定理想値ではなく、成功ショットの個人平均を基準にします。",
      read: "低すぎる/高すぎるの判断は、距離と入射角とセットで見ます。",
      limit: "リング設定とボール軌跡が安定しない時は未確定にします。"
    },
    entry_arc_deg: {
      what: "リング付近へ落ちていく時の入射角です。",
      reference: "ワンモーション参考: 大きいほどリングに対する進入余裕は増えますが、必要速度も変わります。",
      read: "リリース角度、アーチ高、距離を合わせて確認します。",
      limit: "リング直前のボールが追跡できた時だけ参考値になります。"
    },
    release_height_m: {
      what: "リング高を基準にしたリリース高の推定値です。",
      reference: "ワンモーション参考: 身長・腕長・ジャンプ量の影響が大きいため個人比較向きです。",
      read: "同じ選手の成功/失敗、疲労前後、フォーム変更前後で比較します。",
      limit: "2D動画のため絶対値はカメラ条件に左右されます。"
    },
    ball_track_confidence: {
      what: "ボール候補が連続して滑らかに追えているかの信頼度です。",
      reference: "ArcAI基準: 70%以上で弾道数値の参考表示、低い時は未確定扱い。",
      read: "低い時はボール補助ボタンで起点を設定してください。",
      limit: "現段階は軽量動体トラッカーで、専用YOLO検出器ではありません。"
    },
    dip_depth_pct: {
      what: "Dip中に骨盤がどれだけ下がったかを身長比で見ます。",
      reference: "ワンモーション参考: Dipがあるか、毎回の幅が安定しているかを優先します。固定理想値は置きません。",
      read: "床反力推定と手首上昇のタイミングと一緒に見る項目です。",
      limit: "カメラが傾くと値が変わります。"
    },
    wrist_height_pct: {
      what: "手首の最高位置を身体高に対する割合で見ます。",
      reference: "ワンモーション参考: 高さそのものより、リリース時の再現性と身体連動を確認します。",
      read: "低い/高いだけで判断せず、ボール軌道と合わせます。",
      limit: "2D姿勢推定のため奥行き方向の動きは拾えません。"
    },
    knee_range_deg: {
      what: "シュート中に膝角度がどれだけ変化したかです。",
      reference: "ワンモーション参考: 下肢が全く使われない状態を避け、Dipから上肢へ連続するかを見ます。",
      read: "大きければ良いではなく、タイミングと再現性が重要です。",
      limit: "膝が服や身体で隠れると誤差が出ます。"
    },
    trunk_lean_deg: {
      what: "体幹の傾きのピークです。",
      reference: "ワンモーション参考: 大きな前後ブレが少なく、リリース方向へ過度に流れないことを見ます。",
      read: "左右どちらから撮るかで見え方が変わるため、同じ撮影条件で比較します。",
      limit: "身体がリングと重なると姿勢推定が乱れます。"
    },
    lower_to_wrist_score: {
      what: "下肢の伸展から手首上昇までが連続しているかのArcAIスコアです。",
      reference: "ArcAI基準: 70以上は連動あり、50未満は手首主導の可能性として観察します。",
      read: "コーチと、ワンモーション/ツーモーション/ハイブリッドのどれを目指すか確認する材料です。",
      limit: "スコアは診断ではなく、動画内タイミングからの推定です。"
    },
    hand_shot_risk: {
      what: "下肢・体幹より手首/腕が先行している可能性を示します。",
      reference: "ArcAI基準: 30未満は低め、60以上は手打ち傾向として観察します。",
      read: "高い時は、数値だけで直さず実際のフォームを見て判断します。",
      limit: "ボール保持やリリースが隠れると誤判定があります。"
    },
    kinetic_chain_index: {
      what: "下肢から上肢へ力がつながって見えるかの総合指標です。",
      reference: "ArcAI基準: 70以上を安定連動の参考域とします。",
      read: "成功ショットの平均を作って、自分の基準との差を見る項目です。",
      limit: "床反力そのものではなく姿勢タイミングからの推定です。"
    },
    knee_to_release_ms: {
      what: "膝伸展ピークから手首上昇ピークまでの時間差です。",
      reference: "ワンモーション参考: 下肢がわずかに先行し、手首へ途切れず伝わる形を見ます。",
      read: "負の値や極端な遅れは、手首主導または検出乱れの可能性として確認します。",
      limit: "ボールリリース時刻そのものではありません。"
    },
    vgrf_proxy_peak_bw: {
      what: "Dipから伸び上がる動きで生じる床反力を、姿勢変化から推定したピークです。",
      reference: "ワンモーション参考: 大きさ単体より、手首上昇とのタイミングが重要です。",
      read: "矢印は視覚化用です。数値はフォースプレート測定ではありません。",
      limit: "体重比の実測値ではなく、ArcAIのproxyスコアです。"
    },
    grf_release_coupling_ms: {
      what: "床反力proxyピークと手首上昇ピークのずれです。",
      reference: "ワンモーション参考: 下肢から手首へ遅れすぎず連続しているかを見ます。",
      read: "同じ選手で、指導前後の変化を見るのに向いています。",
      limit: "検出ピークが不安定な時は未確定になります。"
    },
    landing_drift_pct: {
      what: "接地位置・足部位置の横方向ぶれです。",
      reference: "ワンモーション参考: 小さいほど再現性の観察には有利ですが、戦術的な動きとは分けて見ます。",
      read: "同じ位置からの反復で比較します。",
      limit: "片足が隠れると値が大きく出ることがあります。"
    },
    shot_score: {
      what: "複数項目をまとめた将来用の総合表示です。",
      reference: "現時点では未確定です。",
      read: "ArcAIは指導ではなく解析を優先するため、十分な検出が揃うまで出しません。",
      limit: "スコアだけで良し悪しを判断しない設計です。"
    }
  },
  en: {}
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const uiCopyOverrides = {
  en: {
    setBall: "Manual test",
    loadYoloCsv: "Load YOLO CSV",
    tapBallBody:
      "Pause on a frame where the ball is clearly visible, ideally just after release and before the apex. Avoid the bottom control area."
  },
  ja: {
    setBall: "手動補助 試験",
    loadYoloCsv: "YOLO CSV読込",
    tapBallBody:
      "ボールがはっきり見えるコマでタップしてください。推奨はリリース直後から最高点手前です。画面下の操作バー付近は避けてください。"
  }
};

function t(key) {
  return uiCopyOverrides[state.language]?.[key] ?? uiCopy[state.language]?.[key] ?? uiCopy.en[key] ?? key;
}

function unitLabel(unit) {
  if (state.language !== "ja") return unit;
  const units = {
    deg: "°",
    "% height": "%身長",
    "/100": "/100",
    ms: "ms",
    m: "m",
    "%": "%"
  };
  return units[unit] ?? unit;
}

function formatMetric(value, unit) {
  if (value === null || value === undefined || Number.isNaN(value)) return t("pending");
  return `${value}${unitLabel(unit)}`;
}

function metricStatus(value, key) {
  if (value === null || value === undefined || Number.isNaN(value)) return t("pending");
  return t(metricTagByKey[key] || "estimated");
}

function currentMessages() {
  return uiCopy[state.language]?.messages || uiCopy.en.messages;
}

function renderCalibrationGuide() {
  if (!nodes.calibrationGuide) return;
  const hasVideo = decodedVideoIsUsable();
  const rimDone = Boolean(state.rim?.center && state.rim?.radiusX);
  const yoloDone = state.importedBallTrail.length >= 3;
  const manualDone = state.ballTrail.length >= 1;
  const ja = state.language === "ja";
  const copy = ja
    ? {
        title: "次の作業",
        video: "動画読込",
        rim: "リング設定",
        ball: "手動補助 試験",
        yolo: "YOLO CSV読込",
        nextVideo: "まず動画が表示されるまで待ってください。",
        nextRim: "次はリング設定です。リング中心をタップし、その後リング端をタップしてください。",
        nextYolo: "CSVはGoogle Colabで作成します。Colabでarcai_yolo_ball_track.csvをダウンロードしてから、YOLO CSV読込で選んでください。",
        ready: "手動補助は試験機能です。数値に使うボール軌道はYOLO CSVを優先してください。",
        readyYolo: "YOLO CSVを読み込み済みです。ArcAI Viewで軌跡と数値を確認してください。",
        optional: "任意"
      }
    : {
        title: "Next step",
        video: "Video",
        rim: "Rim",
        ball: "Manual assist test",
        yolo: "Load YOLO CSV",
        nextVideo: "Wait until the uploaded video is visible.",
        nextRim: "Set the rim: tap the rim center, then tap the rim edge.",
        nextYolo: "Create arcai_yolo_ball_track.csv in Google Colab, download it, then choose it with Load YOLO CSV.",
        ready: "Manual assist is experimental. Use YOLO CSV as the primary ball track for metrics.",
        readyYolo: "YOLO CSV is loaded. Review the trail and values in ArcAI View.",
        optional: "Optional"
      };

  const nextText = !hasVideo
    ? copy.nextVideo
    : !rimDone
      ? copy.nextRim
      : !yoloDone
        ? copy.nextYolo
        : yoloDone
          ? copy.readyYolo
          : copy.ready;
  const steps = [
    { label: copy.video, done: hasVideo, current: !hasVideo },
    { label: copy.rim, done: rimDone, current: hasVideo && !rimDone },
    { label: copy.yolo, done: yoloDone, current: hasVideo && rimDone && !yoloDone },
    { label: `${copy.ball} ${copy.optional}`, done: manualDone, current: false }
  ];

  nodes.calibrationGuide.innerHTML = `
    <div class="guide-head">
      <strong>${copy.title}</strong>
      <span>${nextText}</span>
    </div>
    <div class="guide-steps">
      ${steps
        .map(
          (step) =>
            `<span class="${step.done ? "done" : ""} ${step.current ? "current" : ""}">${step.done ? "✓ " : ""}${step.label}</span>`
        )
        .join("")}
    </div>
  `;
}

renderCalibrationGuide = function renderCalibrationGuide() {
  if (!nodes.calibrationGuide) return;
  const hasVideo = decodedVideoIsUsable();
  const rimDone = Boolean(state.rim?.center && state.rim?.radiusX);
  const autoBallDone = state.importedBallTrail.length >= 3;
  const manualDone = state.ballTrail.length >= 1;
  const ja = state.language === "ja";
  const copy = ja
    ? {
        title: "次の作業",
        video: "動画読込",
        rim: "リング設定",
        autoBall: "自動ボール検出",
        manualBall: "手動補助",
        nextVideo: "まず動画が表示されるまで待ってください。",
        nextRim: "次はリング設定です。リング中心をタップし、その後リング端をタップしてください。",
        nextAutoBall: "ボールはアップロード時に自動検出します。検出できない場合のみ手動補助を使います。",
        readyAutoBall: "自動ボール検出を読み込み済みです。ArcAI Viewで軌跡と数値を確認してください。",
        optional: "任意"
      }
    : {
        title: "Next step",
        video: "Video",
        rim: "Rim",
        autoBall: "Auto ball detection",
        manualBall: "Manual assist",
        nextVideo: "Wait until the uploaded video is visible.",
        nextRim: "Set the rim: tap the rim center, then tap the rim edge.",
        nextAutoBall: "ArcAI detects the ball automatically during upload. Use manual assist only if detection fails.",
        readyAutoBall: "Auto ball detection is loaded. Review the trail and values in ArcAI View.",
        optional: "Optional"
      };

  const nextText = !hasVideo
    ? copy.nextVideo
    : !rimDone
      ? copy.nextRim
      : !autoBallDone
        ? copy.nextAutoBall
        : copy.readyAutoBall;
  const steps = [
    { label: copy.video, done: hasVideo, current: !hasVideo },
    { label: copy.rim, done: rimDone, current: hasVideo && !rimDone },
    { label: copy.autoBall, done: autoBallDone, current: hasVideo && rimDone && !autoBallDone },
    { label: `${copy.manualBall} ${copy.optional}`, done: manualDone, current: false }
  ];

  nodes.calibrationGuide.innerHTML = `
    <div class="guide-head">
      <strong>${copy.title}</strong>
      <span>${nextText}</span>
    </div>
    <div class="guide-steps">
      ${steps
        .map(
          (step) =>
            `<span class="${step.done ? "done" : ""} ${step.current ? "current" : ""}">${step.done ? "✓ " : ""}${step.label}</span>`
        )
        .join("")}
    </div>
  `;
};

function getDisplayMetrics(analysis = state.analysis || baseAnalysis) {
  return {
    ...(analysis.metrics || {}),
    ...state.heldPoseMetrics
  };
}

function getLocalizedTab(tabKey) {
  const base = tabContent[tabKey];
  const local = state.language === "ja" ? tabContentJa[tabKey] : null;
  return local ? { ...base, ...local } : base;
}

function metricDetailFor(key) {
  const local = metricDetails[state.language]?.[key] || (state.language === "ja" ? metricDetails.ja[key] : null);
  if (local) return local;
  if (state.language === "en") {
    return {
      what: "This item helps describe the shot motion from the uploaded side-view video.",
      reference: "One-motion reference: use it as an observation range and compare it with the athlete's own successful-shot baseline.",
      read: "Review it with the other timing and ball-flight items instead of judging it alone.",
      limit: "This prototype uses 2D video-derived estimates, not lab-grade measurement."
    };
  }
  return {
    what: state.language === "ja" ? "この項目は解析補助指標です。" : "This is an analysis support metric.",
    reference: state.language === "ja" ? "参考域は今後データ蓄積後に設定します。" : "Reference range will be set after collecting repeated data.",
    read: state.language === "ja" ? "同じ撮影条件での比較に使います。" : "Use it for comparison under the same capture setup.",
    limit: state.language === "ja" ? "単独で良し悪しを判断しないでください。" : "Do not judge quality from this value alone."
  };
}

function applyLanguage() {
  document.documentElement.lang = state.language;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.classList.toggle("active", button.dataset.lang === state.language);
  });
  if (state.screen === "analyzing") nodes.analysisMessage.textContent = currentMessages()[0];
  renderMetricCard();
  renderCalibrationGuide();
}

function applyPlaybackRate() {
  nodes.sourceVideo.playbackRate = state.playbackRate;
  document.querySelectorAll("[data-speed]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.speed) === state.playbackRate);
  });
}

function loadPreviousSnapshot() {
  try {
    const text = localStorage.getItem(SNAPSHOT_KEY);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function saveAnalysisSnapshot() {
  if (!state.analysis || state.snapshotSaved) return;
  const metrics = getDisplayMetrics(state.analysis);
  const hasAnyValue = Object.values(metrics).some((value) => value !== null && value !== undefined && !Number.isNaN(value));
  if (!hasAnyValue) return;
  const snapshot = {
    savedAt: new Date().toISOString(),
    source: state.analysis.source || "shot",
    metrics: { ...metrics }
  };
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    state.snapshotSaved = true;
  } catch {
    state.snapshotSaved = false;
  }
}

function hashText(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function showScreen(name) {
  state.screen = name;
  screens.forEach((screen, key) => {
    screen.classList.toggle("active", key === name);
  });
  if (name === "result") requestAnimationFrame(restartCanvas);
}

function splash() {
  setTimeout(() => {
    nodes.splash.classList.add("fade-out");
    setTimeout(() => {
      nodes.splash.classList.remove("active");
      nodes.app.classList.add("ready");
      showScreen("home");
    }, 1760);
  }, 2200);
}

function makeAnalysis(file) {
  return {
    ...baseAnalysis,
    source: file ? file.name : "demo",
    status: "waiting_for_verified_detection",
    metrics: { ...baseAnalysis.metrics }
  };
}

function setVideo(file) {
  state.selectedFile = file;
  if (state.selectedUrl && state.selectedUrlIsObject) URL.revokeObjectURL(state.selectedUrl);
  state.selectedUrl = file ? URL.createObjectURL(file) : "";
  state.selectedUrlIsObject = Boolean(file);
  state.previousSnapshot = loadPreviousSnapshot();
  state.snapshotSaved = false;
  state.poseResult = null;
  state.lastPoseTime = -1;
  state.poseSamples = [];
  state.heldPoseMetrics = {};
  state.poseMetricsHeld = false;
  state.lastPoseSampleTime = -1;
  state.lastMetricRender = 0;
  state.previousLuma = null;
  state.lastMotionTime = -1;
  state.lastBallCandidate = null;
  state.ballTemplate = null;
  state.ballTemplateMisses = 0;
  state.ballManualIndex = 0;
  state.ballTrail = [];
  state.importedBallTrail = [];
  state.importedBallSource = "";
  state.lastBallTime = -1;
  state.ballStatus = "pending";
  state.rim = null;
  state.rimPickMode = "idle";
  state.videoIssue = null;
  nodes.rimPickLayer.classList.add("hidden");
  setVideoPickingControls(false);
  nodes.videoIssue.classList.add("hidden");
  nodes.videoIssue.textContent = "";
  nodes.sourceVideo.loop = true;
  nodes.sourceVideo.muted = true;
  nodes.sourceVideo.playbackRate = state.playbackRate;
  if (state.selectedUrl) {
    nodes.sourceVideo.src = state.selectedUrl;
    nodes.sourceVideo.load();
    nodes.videoPlaceholder.classList.add("hidden");
    nodes.videoName.textContent = file.name;
  } else {
    nodes.sourceVideo.src = demoVideoSrc;
    nodes.sourceVideo.load();
    nodes.videoPlaceholder.classList.add("hidden");
    nodes.videoName.textContent = "Sample shot";
  }
  nodes.sourceVideo.currentTime = 0;
  nodes.sourceVideo.play().catch(() => {});
  renderCalibrationGuide();
  restartCanvas();
}

function setTranscodedVideo(url, originalName) {
  if (state.selectedUrl && state.selectedUrlIsObject) URL.revokeObjectURL(state.selectedUrl);
  const baseUrl = window.location.protocol === "file:" ? "http://localhost:4173/" : window.location.href;
  state.selectedUrl = new URL(url, baseUrl).href;
  state.selectedUrlIsObject = false;
  state.poseResult = null;
  state.lastPoseTime = -1;
  state.poseSamples = [];
  state.heldPoseMetrics = {};
  state.poseMetricsHeld = false;
  state.lastPoseSampleTime = -1;
  state.lastMetricRender = 0;
  state.previousLuma = null;
  state.lastMotionTime = -1;
  state.lastBallCandidate = null;
  state.ballTemplate = null;
  state.ballTemplateMisses = 0;
  state.ballManualIndex = 0;
  state.ballTrail = [];
  state.importedBallTrail = [];
  state.importedBallSource = "";
  state.lastBallTime = -1;
  state.ballStatus = "pending";
  state.videoIssue = null;
  state.rimPickMode = "idle";
  nodes.rimPickLayer.classList.add("hidden");
  setVideoPickingControls(false);
  nodes.videoIssue.classList.add("hidden");
  nodes.videoIssue.textContent = "";
  nodes.sourceVideo.src = state.selectedUrl;
  nodes.sourceVideo.load();
  nodes.sourceVideo.playbackRate = state.playbackRate;
  nodes.videoPlaceholder.classList.add("hidden");
  nodes.videoName.textContent = `${originalName} -> MP4`;
  nodes.sourceVideo.currentTime = 0;
  nodes.sourceVideo.play().catch(() => {});
  renderCalibrationGuide();
  restartCanvas();
}

async function inspectFileCodec(file) {
  if (!file) return null;
  const chunk = await file.slice(0, Math.min(file.size, 8_000_000)).arrayBuffer();
  const bytes = new Uint8Array(chunk);
  let text = "";
  const step = 16_384;
  for (let index = 0; index < bytes.length; index += step) {
    const slice = bytes.subarray(index, Math.min(bytes.length, index + step));
    text += String.fromCharCode(...slice);
  }
  return {
    hvc1: text.includes("hvc1"),
    hev1: text.includes("hev1"),
    avc1: text.includes("avc1"),
    mp4a: text.includes("mp4a"),
    mov: /\.mov$/i.test(file.name)
  };
}

function showVideoIssue(title, detail) {
  state.videoIssue = { title, detail };
  nodes.videoIssue.innerHTML = `${title}<small>${detail}</small>`;
  nodes.videoIssue.classList.remove("hidden");
}

async function transcodeVideo(file) {
  const form = new FormData();
  form.append("video", file, file.name);
  const endpoint = new URL("/api/transcode", window.location.href);
  if (window.location.protocol === "file:") endpoint.href = "http://localhost:4173/api/transcode";
  const response = await fetch(endpoint.href, {
    method: "POST",
    body: form
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`Transcode API returned non-JSON response (HTTP ${response.status}).`);
    }
  }
  if (!payload) throw new Error(`Transcode API returned an empty response (HTTP ${response.status}).`);
  if (!response.ok || !payload.ok) throw new Error(payload.message || "transcode failed");
  return payload;
}

async function detectServerBallTrack(videoUrl) {
  const endpoint = new URL("/api/ball-track", window.location.href);
  if (window.location.protocol === "file:") endpoint.href = "http://localhost:4173/api/ball-track";
  const response = await fetch(endpoint.href, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ url: videoUrl })
  });
  const text = await response.text();
  if (!text) throw new Error(`Ball detector returned an empty response (HTTP ${response.status}).`);
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Ball detector returned non-JSON response (HTTP ${response.status}).`);
  }
  if (!response.ok || !payload.ok) throw new Error(payload.message || payload.error || "ball detection failed");
  return payload;
}

function decodedVideoIsUsable() {
  const video = nodes.sourceVideo;
  return video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
}

function waitForVideoReady() {
  const video = nodes.sourceVideo;
  if (decodedVideoIsUsable()) return Promise.resolve({ ok: true });
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      if (decodedVideoIsUsable()) {
        resolve({ ok: true });
        return;
      }
      if (video.error) {
        resolve({ ok: false, reason: "media_error", detail: video.error.message || `code ${video.error.code}` });
        return;
      }
      resolve({ ok: false, reason: "no_decoded_frames", detail: "videoWidth/videoHeight is 0" });
    };
    video.addEventListener("loadeddata", done, { once: true });
    video.addEventListener("canplay", done, { once: true });
    video.addEventListener("error", done, { once: true });
    setTimeout(done, 9000);
  });
}

function clearVideoIssueIfReady() {
  if (!decodedVideoIsUsable()) return;
  nodes.videoIssue.classList.add("hidden");
  nodes.videoIssue.textContent = "";
  state.videoIssue = null;
  renderCalibrationGuide();
}

function setEngineStatus(text) {
  nodes.engineStatus.textContent = text;
}

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => resolve(fallback), ms);
    })
  ]);
}

async function loadPoseEngine() {
  if (state.poseEngine?.landmarker || state.poseEngine?.error) return state.poseEngine;
  if (state.poseEnginePromise) return state.poseEnginePromise;

  setEngineStatus("Loading Pose API");
  state.poseEnginePromise = (async () => {
    let lastError = null;
    const errors = [];
    for (const candidate of poseApiCandidates) {
      try {
        const moduleUrl = new URL(candidate.module, window.location.href).href;
        const wasmUrl = new URL(candidate.wasm, window.location.href).href;
        const modelUrl = new URL(candidate.model, window.location.href).href;
        const tasksVision = await import(moduleUrl);
        const vision = await tasksVision.FilesetResolver.forVisionTasks(wasmUrl);
        const landmarker = await tasksVision.PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelUrl
          },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.45,
          minPosePresenceConfidence: 0.45,
          minTrackingConfidence: 0.45
        });
        state.poseEngine = { landmarker, error: null, source: candidate.module };
        setEngineStatus("Pose API active");
        return state.poseEngine;
      } catch (error) {
        lastError = error;
        errors.push(`${candidate.module}: ${error.name || "Error"}: ${error.message || error}`);
      }
    }

    state.poseEngine = { landmarker: null, error: lastError };
    window.__arcaiDebug = {
      ...(window.__arcaiDebug || {}),
      poseError: lastError ? `${lastError.name || "Error"}: ${lastError.message || lastError}` : null,
      poseErrors: errors
    };
    setEngineStatus("Pose API unavailable");
    return state.poseEngine;
  })();

  return state.poseEnginePromise;
}

async function runAnalysis(file) {
  showScreen("analyzing");
  state.analysis = makeAnalysis(file);
  state.fileCodec = await inspectFileCodec(file).catch(() => null);
  setVideo(file);
  let progress = 0;
  const messages = currentMessages();
  nodes.progressBar.style.width = "0%";
  nodes.analysisMessage.textContent = messages[0];
  setEngineStatus("Pose API pending");
  const timer = setInterval(() => {
    progress = Math.min(96, progress + 6 + Math.random() * 8);
    nodes.progressBar.style.width = `${progress}%`;
    nodes.analysisMessage.textContent = messages[Math.min(messages.length - 1, Math.floor(progress / 18))];
  }, 160);

  const minimumWait = new Promise((resolve) => setTimeout(resolve, 1900));
  let videoStatus = await waitForVideoReady();
  let engine = state.poseEngine;
  const codec = state.fileCodec;
  const likelyHevc = codec?.hvc1 || codec?.hev1;

  if (file) {
    showVideoIssue("Preparing video", "ArcAI is creating a browser-readable MP4.");
    setEngineStatus("Preparing video");
    nodes.analysisMessage.textContent = "Preparing video";
    try {
      const processed = await transcodeVideo(file);
      setTranscodedVideo(processed.url, file.name);
      videoStatus = await waitForVideoReady();
      if (videoStatus.ok) {
        nodes.videoIssue.classList.add("hidden");
        nodes.videoIssue.textContent = "";
        state.videoIssue = null;
      }
      setEngineStatus("Video ready / ball detecting (YOLOv8n)");
      detectServerBallTrack(processed.analysis_url || processed.url)
        .then((ballTrack) => {
          const yoloLoaded = applyServerBallTrack(ballTrack, "YOLO auto");
          setEngineStatus(yoloLoaded ? "Ball detector active" : "Ball detector pending");
        })
        .catch((error) => {
          window.__arcaiDebug = {
            ...(window.__arcaiDebug || {}),
            ballTrackError: `${error.name || "Error"}: ${error.message || error}`
          };
          state.ballStatus = "server_yolo_failed";
          state.importedBallSource = error.message || "YOLO auto failed";
          setEngineStatus("Ball detector pending");
          renderCalibrationGuide();
        });
    } catch (error) {
      window.__arcaiDebug = {
        ...(window.__arcaiDebug || {}),
        videoProcessError: `${error.name || "Error"}: ${error.message || error}`
      };
      if (!videoStatus.ok || likelyHevc) {
        showVideoIssue("Video processing failed", error.message || "ArcAI could not prepare this video.");
        setEngineStatus("Video processing failed");
      } else {
        setEngineStatus("Ball detector unavailable");
      }
    }
  }

  if (videoStatus.ok) {
    engine = await withTimeout(loadPoseEngine(), 5500, { landmarker: null, error: new Error("Pose API timeout") });
    if (!engine.landmarker && !state.poseEngine?.landmarker) {
      state.poseEngine = engine;
      setEngineStatus("Pose API unavailable");
    }
  } else {
    const title = likelyHevc ? "HEVC/MOV video is not decoded" : "Video frames are not decoded";
    const detail = likelyHevc
      ? "This browser reports 0 x 0 video frames for hvc1/HEVC, so ArcAI cannot analyze this file yet."
      : `${videoStatus.detail}. ArcAI needs decoded frames before pose analysis.`;
    if (!state.videoIssue || nodes.engineStatus.textContent !== "Transcode failed") {
      showVideoIssue(title, detail);
      setEngineStatus("Video not decodable");
    }
  }
  await minimumWait;
  clearInterval(timer);
  nodes.progressBar.style.width = "100%";
  renderMetricCard();
  setTimeout(() => showScreen("result"), 260);
}

function renderMetricCard() {
  const analysis = state.analysis || baseAnalysis;
  const displayMetrics = getDisplayMetrics(analysis);
  const tab = getLocalizedTab(state.activeTab);
  const rows = tab.rows
    .map(([key, label, value]) => {
      const display = value(displayMetrics, { ...analysis, metrics: displayMetrics });
      const rawValue = key === "shot_score" ? analysis.shot_score : displayMetrics[key];
      const labelText = tab.labels?.[key] || label;
      const detail = metricDetailFor(key);
      const expanded = state.activeMetricKey === key;
      return `
        <div class="metric-row ${expanded ? "expanded" : ""}" role="button" tabindex="0" data-metric="${key}">
          <span>${labelText}</span>
          <strong>${display}</strong>
          <em>${metricStatus(rawValue, key)}</em>
        </div>
        ${
          expanded
            ? `<div class="metric-detail">
                <p><b>${state.language === "ja" ? "意味" : "Meaning"}</b>${detail.what}</p>
                <p><b>${state.language === "ja" ? "ワンモーション参考" : "One-motion reference"}</b>${detail.reference}</p>
                <p><b>${state.language === "ja" ? "見方" : "How to read"}</b>${detail.read}</p>
                <p><b>${state.language === "ja" ? "限界" : "Limit"}</b>${detail.limit}</p>
              </div>`
            : ""
        }
      `;
    })
    .join("");
  nodes.metricCard.innerHTML = `
    <div class="metric-heading">
      <span>${t("observation")} / ${state.poseMetricsHeld ? t("held") : t("live")}</span>
      <h3>${tab.title}</h3>
    </div>
    ${rows}
    <div class="discussion-box">
      <span>${t("coachDiscussion")}</span>
      <p>${tab.discussion}</p>
    </div>
    <p class="metric-note">${tab.note}</p>
  `;
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === state.activeTab);
  });
}

function point(x, y) {
  return { x, y };
}

function line(ctx, points, color, width = 3) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.stroke();
  ctx.restore();
}

function dot(ctx, p, radius, color, stroke = "rgba(0,0,0,.72)") {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = radius * 0.8;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(0.8, radius * 0.42);
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.restore();
}

function arrow(ctx, from, to, color, label) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - 11 * Math.cos(angle - Math.PI / 6), to.y - 11 * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(to.x - 11 * Math.cos(angle + Math.PI / 6), to.y - 11 * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.font = "700 10px Inter, sans-serif";
  ctx.fillText(label, to.x + 6, to.y + 3);
  ctx.restore();
}

function sizeCanvas() {
  const canvas = nodes.overlayCanvas;
  const parent = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(260, parent.clientWidth);
  const height = Math.max(180, parent.clientHeight);
  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
  return { width, height, dpr };
}

function restartCanvas() {
  if (state.animationId) cancelAnimationFrame(state.animationId);
  drawCanvas();
}

function easeInOut(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function easeOut(value) {
  const t = clamp(value, 0, 1);
  return 1 - (1 - t) ** 3;
}

function bezierPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return point(
    u ** 3 * p0.x + 3 * u ** 2 * t * p1.x + 3 * u * t ** 2 * p2.x + t ** 3 * p3.x,
    u ** 3 * p0.y + 3 * u ** 2 * t * p1.y + 3 * u * t ** 2 * p2.y + t ** 3 * p3.y
  );
}

function playbackState() {
  const video = nodes.sourceVideo;
  if (video && Number.isFinite(video.duration) && video.duration > 0) {
    return {
      phase: clamp(video.currentTime / video.duration, 0, 0.999),
      time: video.currentTime,
      duration: video.duration,
      synced: true
    };
  }
  const fallbackDuration = 6;
  const time = (performance.now() / 1000) % fallbackDuration;
  return {
    phase: time / fallbackDuration,
    time,
    duration: fallbackDuration,
    synced: false
  };
}

const poseEdges = [
  [11, 12],
  [11, 13],
  [13, 15],
  [15, 19],
  [15, 21],
  [12, 14],
  [14, 16],
  [16, 20],
  [16, 22],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [27, 29],
  [27, 31],
  [24, 26],
  [26, 28],
  [28, 30],
  [28, 32]
];

function fitVideoRect(width, height) {
  const video = nodes.sourceVideo;
  const sourceWidth = video.videoWidth || 16;
  const sourceHeight = video.videoHeight || 9;
  const padding = 14;
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const sourceAspect = sourceWidth / sourceHeight;
  const availableAspect = availableWidth / availableHeight;
  let drawWidth = availableWidth;
  let drawHeight = availableHeight;
  if (availableAspect > sourceAspect) {
    drawHeight = availableHeight;
    drawWidth = drawHeight * sourceAspect;
  } else {
    drawWidth = availableWidth;
    drawHeight = drawWidth / sourceAspect;
  }
  return {
    x: (width - drawWidth) / 2,
    y: (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight
  };
}

function fitPoseZoomRect(landmarks, width, height) {
  const bounds = visiblePoseBounds(landmarks);
  if (!bounds) return fitVideoRect(width, height);
  const padX = Math.max(0.055, (bounds.maxX - bounds.minX) * 0.38);
  const padY = Math.max(0.075, (bounds.maxY - bounds.minY) * 0.22);
  const minX = clamp(bounds.minX - padX, 0, 1);
  const maxX = clamp(bounds.maxX + padX, 0, 1);
  const minY = clamp(bounds.minY - padY, 0, 1);
  const maxY = clamp(bounds.maxY + padY, 0, 1);
  const sourceWidth = Math.max(0.01, maxX - minX);
  const sourceHeight = Math.max(0.01, maxY - minY);
  const padding = 18;
  const targetWidth = Math.max(1, width - padding * 2);
  const targetHeight = Math.max(1, height - padding * 2);
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return {
    x: width / 2 - centerX * scale,
    y: height / 2 - centerY * scale,
    width: scale,
    height: scale
  };
}

function mapLandmark(landmark, rect) {
  return point(rect.x + landmark.x * rect.width, rect.y + landmark.y * rect.height);
}

function mapNormalizedPoint(normalized, rect) {
  return point(rect.x + normalized.x * rect.width, rect.y + normalized.y * rect.height);
}

function videoDisplayRect(element = nodes.sourceVideo) {
  const box = element.getBoundingClientRect();
  const sourceWidth = nodes.sourceVideo.videoWidth || 16;
  const sourceHeight = nodes.sourceVideo.videoHeight || 9;
  const sourceAspect = sourceWidth / sourceHeight;
  const boxAspect = box.width / box.height;
  let width = box.width;
  let height = box.height;
  if (boxAspect > sourceAspect) {
    height = box.height;
    width = height * sourceAspect;
  } else {
    width = box.width;
    height = width / sourceAspect;
  }
  return {
    left: box.left + (box.width - width) / 2,
    top: box.top + (box.height - height) / 2,
    width,
    height
  };
}

function videoPointFromPointer(event) {
  if (!decodedVideoIsUsable()) return null;
  const rect = videoDisplayRect();
  const touch = event.changedTouches?.[0] || event.touches?.[0];
  const clientX = touch?.clientX ?? event.clientX;
  const clientY = touch?.clientY ?? event.clientY;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  const x = clamp((clientX - rect.left) / rect.width, 0, 1);
  const y = clamp((clientY - rect.top) / rect.height, 0, 1);
  return { x, y };
}

function rimRadiusPx() {
  if (!state.rim?.radiusX) return null;
  return state.rim.radiusX * (nodes.sourceVideo.videoWidth || 0);
}

function rimMetersPerPixel() {
  const radius = rimRadiusPx();
  if (!radius || radius < 2) return null;
  return RIM_DIAMETER_M / (radius * 2);
}

function setRimPickText(title, body) {
  nodes.rimPickLayer.innerHTML = `<strong>${title}</strong><span>${body}</span>`;
}

function setVideoPickingControls(active) {
  nodes.sourceVideo.controls = !active;
  nodes.sourceVideo.classList.toggle("picking", active);
}

function startRimPicking() {
  if (!decodedVideoIsUsable()) {
    nodes.rimPickLayer.classList.remove("hidden");
    setRimPickText(t("videoNotReadyTitle"), t("videoNotReadyBody"));
    setTimeout(() => {
      if (state.rimPickMode === "idle") nodes.rimPickLayer.classList.add("hidden");
    }, 1600);
    return;
  }
  state.rimPickMode = "center";
  nodes.sourceVideo.pause();
  setVideoPickingControls(true);
  nodes.rimPickLayer.classList.remove("hidden");
  setRimPickText(t("tapRimCenterTitle"), t("tapRimCenterBody"));
  renderCalibrationGuide();
}

function startBallPicking() {
  if (!decodedVideoIsUsable()) {
    nodes.rimPickLayer.classList.remove("hidden");
    setRimPickText(t("videoNotReadyTitle"), t("videoNotReadyBody"));
    setTimeout(() => {
      if (state.rimPickMode === "idle") nodes.rimPickLayer.classList.add("hidden");
    }, 1600);
    return;
  }
  state.rimPickMode = "ball";
  nodes.sourceVideo.pause();
  setVideoPickingControls(true);
  nodes.rimPickLayer.classList.remove("hidden");
  setRimPickText(t("tapBallTitle"), t("tapBallBody"));
  renderCalibrationGuide();
}

function handleRimPick(event) {
  if (state.rimPickMode === "idle") return;
  const now = performance.now();
  if (now - state.lastPickAt < 220) return;
  state.lastPickAt = now;
  const p = videoPointFromPointer(event);
  if (!p) return;
  event.preventDefault();
  event.stopPropagation();
  if (state.rimPickMode === "center") {
    state.rim = {
      center: p,
      radiusX: null,
      setAt: nodes.sourceVideo.currentTime || 0
    };
    state.rimPickMode = "edge";
    setRimPickText(t("tapRimEdgeTitle"), t("tapRimEdgeBody"));
    renderCalibrationGuide();
    return;
  }

  if (state.rimPickMode === "ball") {
    const sourceWidth = nodes.sourceVideo.videoWidth || 1;
    const sourceHeight = nodes.sourceVideo.videoHeight || 1;
    const radiusPx = Math.max(4, (state.rim?.radiusX || 0.018) * sourceWidth * 0.5);
    createBallTemplate(p);
    state.ballTrail = [];
    state.lastBallTime = -1;
    state.lastBallCandidate = null;
    pushBallCandidate({
      normalized: point(p.x, p.y),
      x: p.x * sourceWidth,
      y: p.y * sourceHeight,
      radius: radiusPx,
      confidence: 1,
      nearPose: false,
      source: "manual",
      seeded: true
    });
    state.ballStatus = "manual_seeded";
    state.rimPickMode = "idle";
    setRimPickText(t("ballSeededTitle"), t("ballSeededBody"));
    setTimeout(() => {
      nodes.rimPickLayer.classList.add("hidden");
      setVideoPickingControls(false);
    }, 520);
    nodes.sourceVideo.play().catch(() => {});
    renderMetricCard();
    renderCalibrationGuide();
    restartCanvas();
    return;
  }

  const sourceWidth = nodes.sourceVideo.videoWidth || 1;
  const sourceHeight = nodes.sourceVideo.videoHeight || 1;
  const dx = (p.x - state.rim.center.x) * sourceWidth;
  const dy = (p.y - state.rim.center.y) * sourceHeight;
  const radiusPx = Math.hypot(dx, dy);
  state.rim.radiusX = clamp(radiusPx / sourceWidth, 0.006, 0.08);
  state.rimPickMode = "idle";
  nodes.rimPickLayer.classList.add("hidden");
  setVideoPickingControls(false);
  nodes.sourceVideo.play().catch(() => {});
  computeBallMetrics();
  renderMetricCard();
  renderCalibrationGuide();
  restartCanvas();
}

const poseSides = {
  left: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27, heel: 29, foot: 31 },
  right: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28, heel: 30, foot: 32 }
};

function landmarkScore(landmark) {
  if (!landmark) return 0;
  if (landmark.visibility !== undefined) return landmark.visibility;
  if (landmark.presence !== undefined) return landmark.presence;
  return 1;
}

function landmarkIsVisible(landmark, threshold = 0.35) {
  return landmarkScore(landmark) >= threshold;
}

function pointFromLandmark(landmark) {
  return point(landmark.x, landmark.y);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function averagePoint(points) {
  if (!points.length) return null;
  return point(
    points.reduce((sum, item) => sum + item.x, 0) / points.length,
    points.reduce((sum, item) => sum + item.y, 0) / points.length
  );
}

function angleDeg(a, b, c) {
  const ab = point(a.x - b.x, a.y - b.y);
  const cb = point(c.x - b.x, c.y - b.y);
  const denom = Math.max(0.000001, Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y));
  const cosine = clamp((ab.x * cb.x + ab.y * cb.y) / denom, -1, 1);
  return (Math.acos(cosine) * 180) / Math.PI;
}

function roundMetric(value, digits = 0) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function range(values) {
  const filtered = values.filter(Number.isFinite);
  if (!filtered.length) return null;
  return Math.max(...filtered) - Math.min(...filtered);
}

function percentile(values, ratio) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = clamp(Math.round((sorted.length - 1) * ratio), 0, sorted.length - 1);
  return sorted[index];
}

function robustRange(values) {
  const low = percentile(values, 0.1);
  const high = percentile(values, 0.9);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  return high - low;
}

function pickPeak(items, key) {
  return items.reduce((best, item) => (item[key] > best[key] ? item : best), items[0]);
}

function visiblePoseBounds(landmarks) {
  const visible = landmarks.filter((landmark) => landmarkIsVisible(landmark, 0.28));
  if (!visible.length) return null;
  return visible.reduce(
    (bounds, landmark) => ({
      minX: Math.min(bounds.minX, landmark.x),
      maxX: Math.max(bounds.maxX, landmark.x),
      minY: Math.min(bounds.minY, landmark.y),
      maxY: Math.max(bounds.maxY, landmark.y)
    }),
    { minX: 1, maxX: 0, minY: 1, maxY: 0 }
  );
}

function selectPoseSide(landmarks) {
  return Object.entries(poseSides).reduce(
    (best, [side, indices]) => {
      const score =
        landmarkScore(landmarks[indices.shoulder]) +
        landmarkScore(landmarks[indices.elbow]) +
        landmarkScore(landmarks[indices.wrist]) +
        landmarkScore(landmarks[indices.hip]) +
        landmarkScore(landmarks[indices.knee]) +
        landmarkScore(landmarks[indices.ankle]);
      return score > best.score ? { side, indices, score } : best;
    },
    { side: "left", indices: poseSides.left, score: -1 }
  );
}

function makePoseSample(landmarks) {
  const video = nodes.sourceVideo;
  const time = Number.isFinite(video.currentTime) ? video.currentTime : performance.now() / 1000;
  const selected = selectPoseSide(landmarks);
  const points = {};
  ["shoulder", "elbow", "wrist", "hip", "knee", "ankle"].forEach((key) => {
    const landmark = landmarks[selected.indices[key]];
    if (landmarkIsVisible(landmark)) points[key] = pointFromLandmark(landmark);
  });
  if (!points.shoulder || !points.wrist || !points.hip || !points.knee || !points.ankle) return null;

  const bounds = visiblePoseBounds(landmarks);
  if (!bounds) return null;
  const feet = [27, 28, 29, 30, 31, 32]
    .map((index) => landmarks[index])
    .filter((landmark) => landmarkIsVisible(landmark, 0.25))
    .map(pointFromLandmark);
  const floorY = feet.length ? Math.max(...feet.map((item) => item.y)) : bounds.maxY;
  const footX = averagePoint(feet)?.x ?? points.ankle.x;
  const shoulderMid =
    averagePoint([11, 12].map((index) => landmarks[index]).filter((item) => landmarkIsVisible(item)).map(pointFromLandmark)) ||
    points.shoulder;
  const hipMid =
    averagePoint([23, 24].map((index) => landmarks[index]).filter((item) => landmarkIsVisible(item)).map(pointFromLandmark)) ||
    points.hip;
  const bodyHeight = Math.max(0.18, floorY - bounds.minY, bounds.maxY - bounds.minY);
  const trunkDy = Math.max(0.001, hipMid.y - shoulderMid.y);
  const trunkLeanDeg = Math.abs((Math.atan2(shoulderMid.x - hipMid.x, trunkDy) * 180) / Math.PI);

  return {
    time,
    side: selected.side,
    bodyHeight,
    floorY,
    footX,
    hipY: hipMid.y,
    wristY: points.wrist.y,
    wristHeightPct: clamp(((floorY - points.wrist.y) / bodyHeight) * 100, 0, 165),
    kneeAngle: angleDeg(points.hip, points.knee, points.ankle),
    hipAngle: angleDeg(points.shoulder, points.hip, points.knee),
    trunkLeanDeg,
    forceAnchor: point(footX, floorY)
  };
}

function computePoseMetrics(samples) {
  if (samples.length < 2) return {};
  const medianHeight = median(samples.map((sample) => sample.bodyHeight)) || 1;
  const medianFloor = median(samples.map((sample) => sample.floorY)) || 1;
  const stableSamples = samples.filter((sample) => {
    const heightOk = sample.bodyHeight > medianHeight * 0.55 && sample.bodyHeight < medianHeight * 1.55;
    const floorOk = Math.abs(sample.floorY - medianFloor) < medianHeight * 0.75;
    return heightOk && floorOk;
  });
  if (stableSamples.length < 2) return {};
  const bodyHeight = median(stableSamples.map((sample) => sample.bodyHeight)) || medianHeight || 1;
  const dipDepthPct = (robustRange(stableSamples.map((sample) => sample.hipY)) / bodyHeight) * 100;
  const kneeRangeDeg = robustRange(stableSamples.map((sample) => sample.kneeAngle));
  const hipRangeDeg = robustRange(stableSamples.map((sample) => sample.hipAngle));
  const footDriftPct = (robustRange(stableSamples.map((sample) => sample.footX)) / bodyHeight) * 100;
  const metrics = {
    dip_depth_pct: dipDepthPct <= 55 ? roundMetric(dipDepthPct, 1) : null,
    wrist_height_pct: roundMetric(percentile(stableSamples.map((sample) => sample.wristHeightPct), 0.9), 0),
    knee_range_deg: kneeRangeDeg <= 95 ? roundMetric(kneeRangeDeg, 0) : null,
    hip_range_deg: hipRangeDeg <= 95 ? roundMetric(hipRangeDeg, 0) : null,
    trunk_lean_deg:
      percentile(stableSamples.map((sample) => sample.trunkLeanDeg), 0.9) <= 70
        ? roundMetric(percentile(stableSamples.map((sample) => sample.trunkLeanDeg), 0.9), 0)
        : null,
    landing_drift_pct: footDriftPct <= 50 ? roundMetric(footDriftPct, 1) : null
  };

  const span = stableSamples[stableSamples.length - 1].time - stableSamples[0].time;
  if (stableSamples.length < 8 || span < 0.35) return metrics;

  const impulses = [];
  const wristTravelPct = (robustRange(stableSamples.map((sample) => sample.wristY)) / bodyHeight) * 100;
  const lowerMotionScore = clamp(((metrics.knee_range_deg || 0) + (metrics.hip_range_deg || 0) + (metrics.dip_depth_pct || 0) * 3) / 115 * 100, 0, 100);
  const wristMotionScore = clamp(wristTravelPct / 68 * 100, 0, 100);
  for (let index = 1; index < stableSamples.length; index += 1) {
    const prev = stableSamples[index - 1];
    const current = stableSamples[index];
    const dt = current.time - prev.time;
    if (dt <= 0.005 || dt > 0.25) continue;
    const height = Math.max(0.18, (prev.bodyHeight + current.bodyHeight) / 2);
    const kneeExtension = (current.kneeAngle - prev.kneeAngle) / dt;
    const hipRise = ((prev.hipY - current.hipY) / height / dt) * 100;
    const wristRise = ((prev.wristY - current.wristY) / height / dt) * 100;
    impulses.push({
      time: current.time,
      lower: Math.max(0, kneeExtension) + Math.max(0, hipRise) * 3,
      wrist: Math.max(0, wristRise),
      hipRise: Math.max(0, hipRise)
    });
  }

  if (impulses.length < 4) return metrics;
  const lowerPeak = pickPeak(impulses, "lower");
  const wristPeak = pickPeak(impulses, "wrist");
  metrics.vgrf_proxy_peak_bw = roundMetric(
    clamp(lowerMotionScore * 0.7 + clamp(lowerPeak.lower / 520 * 100, 0, 100) * 0.3, 0, 100),
    0
  );

  const rawLagMs = lowerPeak.lower > 1 && wristPeak.wrist > 1 ? (wristPeak.time - lowerPeak.time) * 1000 : null;
  const hasTimingPeaks = Number.isFinite(rawLagMs) && rawLagMs > -250 && rawLagMs < 650;
  const lagMs = hasTimingPeaks ? rawLagMs : null;
  const timingScore = hasTimingPeaks
    ? clamp(100 - Math.abs(lagMs - 160) / 2.4 - (lagMs < 0 ? 28 : 0), 0, 100)
    : clamp(lowerMotionScore * 0.48 + wristMotionScore * 0.52, 0, 100);
  const chainScore = clamp(timingScore * 0.62 + lowerMotionScore * 0.38, 0, 100);
  const handRisk = clamp(
    100 - chainScore + (hasTimingPeaks && lagMs < 0 ? 18 : 0) + (lowerMotionScore < 35 ? 18 : 0),
    0,
    100
  );
  metrics.lower_to_wrist_score = roundMetric(chainScore, 0);
  metrics.hand_shot_risk = roundMetric(handRisk, 0);
  metrics.kinetic_chain_index = roundMetric((chainScore + (100 - handRisk)) / 2, 0);

  if (hasTimingPeaks) {
    metrics.knee_to_release_ms = roundMetric(lagMs, 0);
    metrics.grf_release_coupling_ms = roundMetric(lagMs, 0);
  }

  return metrics;
}

function mergePoseMetrics(metrics) {
  const entries = Object.entries(metrics).filter(([, value]) => value !== null && value !== undefined && !Number.isNaN(value));
  if (!entries.length) return;
  if (!state.analysis) state.analysis = makeAnalysis(state.selectedFile);
  entries.forEach(([key, value]) => {
    state.analysis.metrics[key] = value;
  });
  state.analysis.status = "pose_metrics_active_object_detection_pending";
  const now = performance.now();
  if (now - state.lastMetricRender > 240) {
    state.lastMetricRender = now;
    renderMetricCard();
  }
  saveAnalysisSnapshot();
}

function holdPoseMetrics() {
  if (state.poseMetricsHeld || !state.analysis) return;
  const held = {};
  POSE_METRIC_KEYS.forEach((key) => {
    const value = state.analysis.metrics[key];
    if (value !== null && value !== undefined && !Number.isNaN(value)) held[key] = value;
  });
  if (!Object.keys(held).length) return;
  state.heldPoseMetrics = held;
  state.poseMetricsHeld = true;
  renderMetricCard();
  saveAnalysisSnapshot();
}

function appendPoseSample(landmarks) {
  const sample = makePoseSample(landmarks);
  if (!sample) return;
  if (state.lastPoseSampleTime >= 0 && sample.time + 0.08 < state.lastPoseSampleTime) {
    holdPoseMetrics();
    state.poseSamples = [];
  }
  if (Math.abs(sample.time - state.lastPoseSampleTime) < 0.026) return;
  state.lastPoseSampleTime = sample.time;
  state.poseSamples.push(sample);
  if (state.poseSamples.length > 220) state.poseSamples.shift();
  mergePoseMetrics(computePoseMetrics(state.poseSamples));
  const duration = nodes.sourceVideo.duration;
  if (!state.poseMetricsHeld && Number.isFinite(duration) && duration > 1 && sample.time > duration * 0.92) {
    holdPoseMetrics();
  }
}

function detectPoseForCurrentFrame() {
  const engine = state.poseEngine?.landmarker;
  const video = nodes.sourceVideo;
  if (!engine || !decodedVideoIsUsable()) return null;
  if (Math.abs(video.currentTime - state.lastPoseTime) < 0.016 && state.poseResult) return state.poseResult;

  try {
    state.poseResult = engine.detectForVideo(video, performance.now());
    state.lastPoseTime = video.currentTime;
    if (state.poseResult?.landmarks?.[0]?.length) setEngineStatus("Pose API active");
    else setEngineStatus("Pose not detected");
  } catch (error) {
    state.poseResult = null;
    window.__arcaiDebug = {
      ...(window.__arcaiDebug || {}),
      poseRuntimeError: `${error.name || "Error"}: ${error.message || error}`
    };
    setEngineStatus("Pose API error");
  }
  return state.poseResult;
}

function componentCenter(component) {
  return point(component.sx / component.count, component.sy / component.count);
}

function setupMotionProbe() {
  const video = nodes.sourceVideo;
  const probe = state.motionCanvas;
  const probeWidth = 192;
  const probeHeight = Math.max(80, Math.round((video.videoHeight / video.videoWidth) * probeWidth));
  if (probe.width !== probeWidth || probe.height !== probeHeight) {
    probe.width = probeWidth;
    probe.height = probeHeight;
    state.previousLuma = null;
  }
  return { probe, probeWidth, probeHeight };
}

function readMotionFrame() {
  if (!decodedVideoIsUsable()) return null;
  const { probe, probeWidth, probeHeight } = setupMotionProbe();
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(nodes.sourceVideo, 0, 0, probeWidth, probeHeight);
  const data = ctx.getImageData(0, 0, probeWidth, probeHeight).data;
  const luma = new Uint8Array(probeWidth * probeHeight);
  for (let index = 0; index < luma.length; index += 1) {
    const offset = index * 4;
    luma[index] = Math.round(data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114);
  }
  return { data, luma, probeWidth, probeHeight };
}

function createBallTemplate(normalized) {
  const frame = readMotionFrame();
  if (!frame) return null;
  const { data, probeWidth, probeHeight } = frame;
  const cx = clamp(Math.round(normalized.x * probeWidth), 0, probeWidth - 1);
  const cy = clamp(Math.round(normalized.y * probeHeight), 0, probeHeight - 1);
  const rimRadius = state.rim?.radiusX ? state.rim.radiusX * probeWidth : 5.5;
  const radius = Math.round(clamp(rimRadius * 0.72, 4, 9));
  const samples = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || x >= probeWidth || y < 0 || y >= probeHeight) continue;
      const offset = (y * probeWidth + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      samples.push({
        dx,
        dy,
        r,
        g,
        b,
        l: Math.round(r * 0.299 + g * 0.587 + b * 0.114)
      });
    }
  }
  if (samples.length < 16) return null;
  state.ballTemplate = {
    center: point(cx / probeWidth, cy / probeHeight),
    last: point(cx / probeWidth, cy / probeHeight),
    radius,
    samples,
    createdAt: nodes.sourceVideo.currentTime || 0
  };
  state.ballTemplateMisses = 0;
  state.previousLuma = null;
  state.lastMotionTime = -1;
  return state.ballTemplate;
}

function detectBallByTemplate(rect, frame) {
  const template = state.ballTemplate;
  if (!template || !frame) return null;
  const { data, luma, probeWidth, probeHeight } = frame;
  const lastTrail = state.ballTrail[state.ballTrail.length - 1];
  const anchor = lastTrail?.normalized || template.last || template.center;
  const anchorX = clamp(Math.round(anchor.x * probeWidth), 0, probeWidth - 1);
  const anchorY = clamp(Math.round(anchor.y * probeHeight), 0, probeHeight - 1);
  const searchRadius = Math.round(clamp(18 + state.ballTemplateMisses * 7, 18, 48));
  const step = state.ballTemplateMisses > 2 ? 3 : 2;
  let best = null;

  for (let y = Math.max(template.radius, anchorY - searchRadius); y <= Math.min(probeHeight - template.radius - 1, anchorY + searchRadius); y += step) {
    for (let x = Math.max(template.radius, anchorX - searchRadius); x <= Math.min(probeWidth - template.radius - 1, anchorX + searchRadius); x += step) {
      let error = 0;
      let motion = 0;
      let count = 0;
      for (const sample of template.samples) {
        const sx = x + sample.dx;
        const sy = y + sample.dy;
        if (sx < 0 || sx >= probeWidth || sy < 0 || sy >= probeHeight) continue;
        const index = sy * probeWidth + sx;
        const offset = index * 4;
        const dr = Math.abs(data[offset] - sample.r);
        const dg = Math.abs(data[offset + 1] - sample.g);
        const db = Math.abs(data[offset + 2] - sample.b);
        const dl = Math.abs(luma[index] - sample.l);
        error += dl * 0.55 + ((dr + dg + db) / 3) * 0.45;
        if (state.previousLuma) motion += Math.abs(luma[index] - state.previousLuma[index]);
        count += 1;
      }
      if (!count) continue;
      const avgError = error / count;
      const similarity = 1 - clamp((avgError - 8) / 54, 0, 1);
      const normalized = point(x / probeWidth, y / probeHeight);
      const continuity = 1 - clamp(distance(normalized, anchor) / 0.24, 0, 1);
      const motionScore = state.previousLuma ? clamp((motion / count - 5) / 26, 0, 1) : 0.45;
      const confidence = clamp(similarity * 0.68 + continuity * 0.22 + motionScore * 0.1, 0, 1);
      if (!best || confidence > best.confidence) {
        best = {
          normalized,
          confidence,
          similarity,
          motionScore
        };
      }
    }
  }

  if (!best || best.confidence < 0.58 || best.similarity < 0.56) {
    state.ballTemplateMisses += 1;
    return null;
  }

  state.ballTemplateMisses = 0;
  template.last = best.normalized;
  return {
    normalized: best.normalized,
    x: rect.x + best.normalized.x * rect.width,
    y: rect.y + best.normalized.y * rect.height,
    radius: clamp(template.radius * (rect.width / probeWidth), 3.2, 10),
    confidence: best.confidence,
    nearPose: false,
    source: "template"
  };
}

function pushBallCandidate(candidate) {
  if (!candidate) return;
  const video = nodes.sourceVideo;
  const time = Number.isFinite(video.currentTime) ? video.currentTime : performance.now() / 1000;
  if (Math.abs(time - state.lastBallTime) < 0.055) return;
  const last = state.ballTrail[state.ballTrail.length - 1];
  if (last) {
    const gap = Math.abs(time - last.time);
    const jump = distance(candidate.normalized, last.normalized);
    const assisted = last.seeded || candidate.seeded || last.source === "template" || candidate.source === "template";
    const maxJump = assisted ? 0.18 : 0.11;
    if (gap < 0.32 && jump > maxJump) {
      state.ballStatus = "unstable";
      return;
    }
  }
  state.lastBallTime = time;
  state.ballStatus = "tracking";
  state.ballTrail.push({ ...candidate, time });
  if (state.ballTrail.length > 90) state.ballTrail.shift();
  computeBallMetrics();
}

function splitCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function normalizeCsvHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function numberFromCsvRow(row, names) {
  for (const name of names) {
    const value = row[name];
    if (value === undefined || value === "") continue;
    const number = Number(String(value).replace("%", ""));
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function parseYoloCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map(normalizeCsvHeader);
  const rows = [];
  for (const line of lines.slice(1)) {
    const values = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index];
    });
    const frame = numberFromCsvRow(row, ["frame", "frame_index", "frame_id", "f"]);
    const time = numberFromCsvRow(row, ["time", "time_s", "seconds", "t"]);
    const x = numberFromCsvRow(row, ["x_center", "center_x", "cx", "x"]);
    const y = numberFromCsvRow(row, ["y_center", "center_y", "cy", "y"]);
    const width = numberFromCsvRow(row, ["width", "w", "box_width"]);
    const height = numberFromCsvRow(row, ["height", "h", "box_height"]);
    let confidence = numberFromCsvRow(row, ["confidence", "conf", "score", "probability"]);
    if (confidence !== null && confidence > 1) confidence /= 100;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    rows.push({
      frame,
      time,
      x,
      y,
      width,
      height,
      confidence: clamp(confidence ?? 0.5, 0, 1),
      source: "yolo_csv"
    });
  }
  return rows;
}

function coerceBallTrackRow(row) {
  const frame = Number(row.frame ?? row.frame_index ?? row.frame_id ?? row.f);
  const time = Number(row.time ?? row.time_s ?? row.seconds ?? row.t);
  const x = Number(row.x ?? row.x_center ?? row.center_x ?? row.cx);
  const y = Number(row.y ?? row.y_center ?? row.center_y ?? row.cy);
  const width = Number(row.width ?? row.w ?? row.box_width);
  const height = Number(row.height ?? row.h ?? row.box_height);
  let confidence = Number(row.confidence ?? row.conf ?? row.score ?? row.probability);
  if (Number.isFinite(confidence) && confidence > 1) confidence /= 100;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    frame: Number.isFinite(frame) ? frame : null,
    time: Number.isFinite(time) ? time : null,
    x,
    y,
    width: Number.isFinite(width) ? width : null,
    height: Number.isFinite(height) ? height : null,
    confidence: clamp(Number.isFinite(confidence) ? confidence : 0.5, 0, 1),
    source: row.source || "server_yolo"
  };
}

function setImportedBallRows(rows, sourceName = "YOLO") {
  const normalizedRows = rows.map(coerceBallTrackRow).filter(Boolean);
  const videoWidth = nodes.sourceVideo.videoWidth || 1;
  const videoHeight = nodes.sourceVideo.videoHeight || 1;
  const validRows = normalizedRows.filter((row) => {
    const x = row.x <= 1 ? row.x * videoWidth : row.x;
    const y = row.y <= 1 ? row.y * videoHeight : row.y;
    const boxWidth = row.width && row.width <= 1 ? row.width * videoWidth : row.width;
    const boxHeight = row.height && row.height <= 1 ? row.height * videoHeight : row.height;
    const minBallBox = clamp(Math.min(videoWidth, videoHeight) * 0.018, 14, 24);
    const hasBox = Number.isFinite(boxWidth) && Number.isFinite(boxHeight) && boxWidth > 0 && boxHeight > 0;
    const boxLooksUsable = !hasBox || Math.min(boxWidth, boxHeight) >= minBallBox;
    return x >= 0 && x <= videoWidth * 1.05 && y >= 0 && y <= videoHeight * 1.05 && boxLooksUsable;
  });
  const bestByFrame = new Map();
  for (const row of validRows) {
    const key = Number.isFinite(row.frame) ? `f:${row.frame}` : `t:${roundMetric(row.time ?? 0, 3)}`;
    const current = bestByFrame.get(key);
    if (!current || row.confidence > current.confidence) bestByFrame.set(key, row);
  }
  state.importedBallTrail = [...bestByFrame.values()].sort((a, b) => {
    const aKey = Number.isFinite(a.frame) ? a.frame : a.time ?? 0;
    const bKey = Number.isFinite(b.frame) ? b.frame : b.time ?? 0;
    return aKey - bKey;
  });
  state.importedBallSource = sourceName;
  state.ballStatus = state.importedBallTrail.length >= 3 ? "yolo_csv_loaded" : "pending";
  computeBallMetrics();
  renderMetricCard();
  renderCalibrationGuide();
  restartCanvas();
}

function importYoloCsv(text, fileName = "YOLO CSV") {
  setImportedBallRows(parseYoloCsv(text), fileName);
}

function applyServerBallTrack(ballTrack, sourceName = "YOLO auto") {
  const rows = Array.isArray(ballTrack?.rows) ? ballTrack.rows : [];
  if (!ballTrack?.ok || rows.length < 3) {
    state.ballStatus = "server_yolo_failed";
    state.importedBallSource = ballTrack?.error || "YOLO auto failed";
    renderCalibrationGuide();
    restartCanvas();
    return false;
  }
  setImportedBallRows(rows, sourceName);
  state.ballStatus = state.importedBallTrail.length >= 3 ? "server_yolo_loaded" : "server_yolo_failed";
  state.importedBallSource = `${sourceName}: ${state.importedBallTrail.length}/${ballTrack.track_points || rows.length}`;
  renderCalibrationGuide();
  restartCanvas();
  return state.ballStatus === "server_yolo_loaded";
}

function importedBallTrailPoints() {
  if (state.importedBallTrail.length < 3 || !decodedVideoIsUsable()) return [];
  const videoWidth = nodes.sourceVideo.videoWidth || 1;
  const videoHeight = nodes.sourceVideo.videoHeight || 1;
  const duration = Number.isFinite(nodes.sourceVideo.duration) ? nodes.sourceVideo.duration : null;
  const frames = state.importedBallTrail.map((item) => item.frame).filter(Number.isFinite);
  const maxFrame = frames.length ? Math.max(...frames) : 0;
  const frameSpan = Math.max(1, maxFrame);
  return state.importedBallTrail
    .map((item) => {
      const x = item.x <= 1 ? item.x : item.x / videoWidth;
      const y = item.y <= 1 ? item.y : item.y / videoHeight;
      const time = Number.isFinite(item.time)
        ? item.time
        : duration
          ? (item.frame ?? 0) / frameSpan * duration
          : 0;
      const radiusPx = Math.max(item.width || 0, item.height || 0) / 2;
      return {
        normalized: point(clamp(x, 0, 1), clamp(y, 0, 1)),
        time,
        radius: radiusPx > 0 ? clamp(radiusPx, 2.5, 14) : 4.5,
        confidence: item.confidence,
        source: "yolo_csv",
        imported: true
      };
    })
    .filter((item) => Number.isFinite(item.time));
}

function cleanBallTrail(raw) {
  if (raw.length < 5) return [];
  const cleaned = [raw[0]];
  for (let index = 1; index < raw.length; index += 1) {
    const previous = cleaned[cleaned.length - 1];
    const current = raw[index];
    const gap = Math.max(0.016, current.time - previous.time);
    const jump = distance(current.normalized, previous.normalized);
    const imported = current.imported || previous.imported;
    const allowedJump = imported ? 0.24 : 0.16;
    const allowedGap = imported ? 0.42 : 0.45;
    if (jump > allowedJump) continue;
    if (gap > allowedGap && jump > allowedJump * 0.45) continue;
    cleaned.push(current);
  }
  return cleaned;
}

function splitBallTrailSegments(trail) {
  const segments = [];
  let segment = [];
  for (const item of trail) {
    const previous = segment[segment.length - 1];
    if (previous) {
      const gap = Math.max(0, item.time - previous.time);
      const jump = distance(item.normalized, previous.normalized);
      const imported = item.imported || previous.imported;
      const allowedJump = imported ? 0.24 : 0.16;
      if (jump > allowedJump || (gap > 0.42 && jump > allowedJump * 0.45)) {
        if (segment.length >= 2) segments.push(segment);
        segment = [];
      }
    }
    segment.push(item);
  }
  if (segment.length >= 2) segments.push(segment);
  return segments;
}

function stableBallTrail() {
  const imported = cleanBallTrail(importedBallTrailPoints());
  if (imported.length >= 5) return imported;
  const raw = state.ballTrail.filter((item) => item.seeded || item.confidence >= (item.source === "template" ? 0.52 : 0.5));
  if (raw.length < 5) return [];
  const cleaned = cleanBallTrail(raw);
  if (cleaned.length < 5) return [];

  const sourceWidth = nodes.sourceVideo.videoWidth || 1;
  const sourceHeight = nodes.sourceVideo.videoHeight || 1;
  const pointsPx = cleaned.map((item) => ({
    x: item.normalized.x * sourceWidth,
    y: item.normalized.y * sourceHeight,
    time: item.time
  }));
  const horizontalSpan = range(pointsPx.map((item) => item.x)) || 0;
  const verticalSpan = range(pointsPx.map((item) => item.y)) || 0;
  const pathLength = pointsPx.slice(1).reduce((sum, item, index) => sum + distance(item, pointsPx[index]), 0);
  const directLength = distance(pointsPx[0], pointsPx[pointsPx.length - 1]);
  const pathRatio = pathLength / Math.max(1, directLength);
  if (horizontalSpan < sourceWidth * 0.035 || verticalSpan < sourceHeight * 0.018 || pathRatio > 2.35) return [];

  if (state.rim?.center) {
    const release = cleaned[0].normalized;
    const last = cleaned[cleaned.length - 1].normalized;
    const closesTowardRim = Math.abs(last.x - state.rim.center.x) <= Math.abs(release.x - state.rim.center.x) + 0.03;
    if (!closesTowardRim && !cleaned.some((item) => item.seeded)) return [];
  }
  return cleaned;
}


function manualBallVisualTrail() {
  const raw = state.ballTrail
    .filter((item) => item?.normalized && (item.seeded || item.source === "manual" || item.source === "template"))
    .slice(-12);
  if (!raw.length) return [];
  const visible = [];
  for (const item of raw) {
    const previous = visible[visible.length - 1];
    if (!previous || distance(item.normalized, previous.normalized) <= 0.24) {
      visible.push(item);
    }
  }
  return visible;
}

function computeBallMetrics() {
  if (!state.analysis) return;
  const trail = stableBallTrail();
  const metersPerPixel = rimMetersPerPixel();
  if (!state.rim?.center || !metersPerPixel || trail.length < 5) {
    state.analysis.metrics.ball_track_confidence = null;
    state.analysis.metrics.release_angle_deg = null;
    state.analysis.metrics.entry_arc_deg = null;
    state.analysis.metrics.arc_height_m = null;
    state.analysis.metrics.release_height_m = null;
    return;
  }

  const sourceWidth = nodes.sourceVideo.videoWidth || 1;
  const sourceHeight = nodes.sourceVideo.videoHeight || 1;
  const pointsPx = trail.map((item) => ({
    x: item.normalized.x * sourceWidth,
    y: item.normalized.y * sourceHeight,
    time: item.time
  }));
  const release = pointsPx[0];
  const early = pointsPx[Math.min(3, pointsPx.length - 1)];
  const last = pointsPx[pointsPx.length - 1];
  const beforeLast = pointsPx[Math.max(0, pointsPx.length - 4)];
  const apex = pointsPx.reduce((best, item) => (item.y < best.y ? item : best), pointsPx[0]);
  const rimPx = {
    x: state.rim.center.x * sourceWidth,
    y: state.rim.center.y * sourceHeight
  };
  const radiusPx = rimRadiusPx() || sourceWidth * 0.015;
  const horizontalSpan = range(pointsPx.map((item) => item.x)) || 0;
  const verticalSpan = range(pointsPx.map((item) => item.y)) || 0;
  const closestToRim = Math.min(...pointsPx.map((item) => distance(item, rimPx)));
  const pathLength = pointsPx.slice(1).reduce((sum, item, index) => sum + distance(item, pointsPx[index]), 0);
  const directLength = distance(pointsPx[0], pointsPx[pointsPx.length - 1]);
  const pathRatio = pathLength / Math.max(1, directLength);
  const closesTowardRim = Math.abs(last.x - rimPx.x) < Math.abs(release.x - rimPx.x);
  const closeScore = 1 - clamp((closestToRim - radiusPx * 4) / Math.max(1, radiusPx * 12), 0, 1);
  const motionScore = clamp(horizontalSpan / Math.max(1, radiusPx * 8), 0, 1);
  const arcScore = clamp(verticalSpan / Math.max(1, radiusPx * 3.2), 0, 1);
  const smoothScore = 1 - clamp((pathRatio - 1.35) / 1.25, 0, 1);
  const directionScore = closesTowardRim ? 1 : 0.25;
  const trajectoryQuality = clamp(
    closeScore * 0.28 + motionScore * 0.2 + arcScore * 0.18 + directionScore * 0.14 + smoothScore * 0.2,
    0,
    1
  );
  const releaseDx = early.x - release.x;
  const releaseDy = early.y - release.y;
  const entryDx = last.x - beforeLast.x;
  const entryDy = last.y - beforeLast.y;
  const releaseAngle = Math.atan2(-releaseDy, Math.max(1, Math.abs(releaseDx))) * 180 / Math.PI;
  const entryAngle = Math.atan2(entryDy, Math.max(1, Math.abs(entryDx))) * 180 / Math.PI;
  const arcHeight = Math.max(0, (rimPx.y - apex.y) * metersPerPixel);
  const releaseHeight = Math.max(0, (rimPx.y - release.y) * metersPerPixel + 3.05);
  const rawConfidence = clamp(
    trail.length / 18 + Math.min(0.35, trail.reduce((sum, item) => sum + item.confidence, 0) / trail.length / 3),
    0,
    1
  );
  const confidence = clamp(rawConfidence * 0.58 + trajectoryQuality * 0.42, 0, 1);
  state.analysis.metrics.ball_track_confidence = roundMetric(confidence * 100, 0);
  state.analysis.metrics.rim_scale_confidence = roundMetric(clamp((state.rim.radiusX || 0) / 0.018, 0, 1) * 100, 0);

  if (confidence < 0.7 || trajectoryQuality < 0.58 || smoothScore < 0.42) {
    state.analysis.metrics.ball_track_confidence = roundMetric(Math.min(state.analysis.metrics.ball_track_confidence || 0, 69), 0);
    state.analysis.metrics.release_angle_deg = null;
    state.analysis.metrics.entry_arc_deg = null;
    state.analysis.metrics.arc_height_m = null;
    state.analysis.metrics.release_height_m = null;
    return;
  }

  if (Number.isFinite(releaseAngle) && releaseAngle > -15 && releaseAngle < 80) {
    state.analysis.metrics.release_angle_deg = roundMetric(releaseAngle, 1);
  }
  if (Number.isFinite(entryAngle) && entryAngle > -5 && entryAngle < 85) {
    state.analysis.metrics.entry_arc_deg = roundMetric(entryAngle, 1);
  }
  state.analysis.metrics.arc_height_m = arcHeight >= 0.08 ? roundMetric(arcHeight, 2) : null;
  state.analysis.metrics.release_height_m = releaseHeight >= 1.0 ? roundMetric(releaseHeight, 2) : null;
  const hasUsableFlightMetric =
    state.analysis.metrics.release_angle_deg !== null ||
    state.analysis.metrics.entry_arc_deg !== null ||
    state.analysis.metrics.arc_height_m !== null ||
    state.analysis.metrics.release_height_m !== null;
  if (!hasUsableFlightMetric) {
    state.analysis.metrics.ball_track_confidence = roundMetric(Math.min(state.analysis.metrics.ball_track_confidence || 0, 69), 0);
  }
}

function detectBallCandidate(rect, landmarks) {
  const video = nodes.sourceVideo;
  if (!decodedVideoIsUsable()) return null;
  if (Math.abs(video.currentTime - state.lastMotionTime) < 0.075) return state.lastBallCandidate;

  const frame = readMotionFrame();
  if (!frame) return null;
  const { data, luma, probeWidth, probeHeight } = frame;
  const moving = new Uint8Array(probeWidth * probeHeight);
  const templateCandidate = detectBallByTemplate(rect, frame);
  if (templateCandidate) {
    state.previousLuma = luma;
    state.lastMotionTime = video.currentTime;
    state.lastBallCandidate = templateCandidate;
    pushBallCandidate(templateCandidate);
    return templateCandidate;
  }

  if (!state.previousLuma) {
    state.previousLuma = luma;
    state.lastMotionTime = video.currentTime;
    state.lastBallCandidate = null;
    return null;
  }

  const previousLuma = state.previousLuma;
  const posePoints = (landmarks || [])
    .filter((landmark) => landmarkIsVisible(landmark, 0.25))
    .map((landmark) => point(landmark.x * probeWidth, landmark.y * probeHeight));
  for (let index = 0; index < luma.length; index += 1) {
    const diff = Math.abs(luma[index] - previousLuma[index]);
    if (diff > 26) moving[index] = 1;
  }
  state.lastMotionTime = video.currentTime;

  const visited = new Uint8Array(probeWidth * probeHeight);
  const components = [];
  const queue = [];
  for (let start = 0; start < moving.length; start += 1) {
    if (!moving[start] || visited[start]) continue;
    visited[start] = 1;
    queue.length = 0;
    queue.push(start);
    const component = {
      count: 0,
      sx: 0,
      sy: 0,
      minX: probeWidth,
      minY: probeHeight,
      maxX: 0,
      maxY: 0,
      diff: 0
    };
    while (queue.length) {
      const index = queue.pop();
      const x = index % probeWidth;
      const y = Math.floor(index / probeWidth);
      component.count += 1;
      component.sx += x;
      component.sy += y;
      component.diff += Math.abs(luma[index] - previousLuma[index]);
      component.minX = Math.min(component.minX, x);
      component.minY = Math.min(component.minY, y);
      component.maxX = Math.max(component.maxX, x);
      component.maxY = Math.max(component.maxY, y);
      const neighbors = [index - 1, index + 1, index - probeWidth, index + probeWidth];
      for (const next of neighbors) {
        if (next < 0 || next >= moving.length || visited[next] || !moving[next]) continue;
        const nx = next % probeWidth;
        if (Math.abs(nx - x) > 1) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }
    components.push(component);
  }

  const last = state.ballTrail[state.ballTrail.length - 1];
  const candidates = components
    .map((component) => {
      const boxWidth = component.maxX - component.minX + 1;
      const boxHeight = component.maxY - component.minY + 1;
      const area = boxWidth * boxHeight;
      if (component.count < 5 || component.count > 280 || area > probeWidth * probeHeight * 0.035) return null;
      const ratio = Math.max(boxWidth, boxHeight) / Math.max(1, Math.min(boxWidth, boxHeight));
      if (ratio > 2.4) return null;
      const center = componentCenter(component);
      const normalized = point(center.x / probeWidth, center.y / probeHeight);
      const nearPose = posePoints.some((posePoint) => distance(center, posePoint) < Math.max(8, Math.max(boxWidth, boxHeight) * 1.7));
      const continuity = last ? 1 - clamp(distance(normalized, last.normalized) / 0.22, 0, 1) : 0.25;
      const density = component.count / Math.max(1, area);
      const roundness = 1 - clamp(Math.abs(1 - boxWidth / Math.max(1, boxHeight)), 0, 1);
      if (!last && !nearPose && !state.rim?.center) return null;
      if (last && distance(normalized, last.normalized) > 0.18) return null;
      const rimDirection =
        state.rim?.center && last
          ? Math.abs(normalized.x - state.rim.center.x) <= Math.abs(last.normalized.x - state.rim.center.x) + 0.045
          : true;
      const confidence = clamp(
        density * 0.44 + roundness * 0.22 + continuity * 0.25 + (nearPose ? 0.07 : 0) + (rimDirection ? 0.02 : -0.12),
        0,
        1
      );
      return {
        normalized,
        x: rect.x + normalized.x * rect.width,
        y: rect.y + normalized.y * rect.height,
        radius: clamp(Math.max(boxWidth, boxHeight) * 0.5 * (rect.width / probeWidth), 3.2, 11),
        confidence,
        nearPose
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.confidence - a.confidence);

  const candidate = candidates[0] && candidates[0].confidence >= (last ? 0.42 : 0.5) ? candidates[0] : null;
  state.previousLuma = luma;
  state.lastBallCandidate = candidate;
  if (candidate) pushBallCandidate(candidate);
  else state.ballStatus = state.ballTrail.length >= 4 ? "tracking" : "pending";
  return candidate;
}

function estimateShotRangeMeters() {
  const metersPerPixel = rimMetersPerPixel();
  const trail = stableBallTrail();
  if (!state.rim?.center || !metersPerPixel || trail.length < 2) return null;
  const videoWidth = nodes.sourceVideo.videoWidth || 1;
  const release = trail[0].normalized;
  const shotRange = Math.abs(state.rim.center.x - release.x) * videoWidth * metersPerPixel;
  return shotRange >= 0.8 && shotRange <= 9.5 ? shotRange : null;
}

function courtFloorY(rect) {
  return rect.y + rect.height * 0.86;
}

function estimatedGroundNorm() {
  const ground = percentile(state.poseSamples.map((sample) => sample.floorY), 0.9);
  return Number.isFinite(ground) ? ground : null;
}

function forceAnchorSample(sample) {
  const ground = estimatedGroundNorm() ?? sample.floorY;
  const threshold = Math.max(0.012, (sample.bodyHeight || 0.18) * 0.075);
  for (let index = state.poseSamples.length - 1; index >= 0; index -= 1) {
    const candidate = state.poseSamples[index];
    if (!Number.isFinite(candidate.footX) || !Number.isFinite(candidate.floorY)) continue;
    if (Math.max(0, ground - candidate.floorY) <= threshold) return candidate;
  }
  return sample;
}

function lowerImpulseProxyBetween(previous, sample) {
  if (!previous || !sample) return null;
  const dt = sample.time - previous.time;
  if (dt <= 0.005 || dt > 0.25) return null;
  const bodyHeight = Math.max(0.18, (sample.bodyHeight + previous.bodyHeight) / 2);
  const kneeExtension = (sample.kneeAngle - previous.kneeAngle) / dt;
  const hipRise = ((previous.hipY - sample.hipY) / bodyHeight / dt) * 100;
  return Math.max(0, kneeExtension) + Math.max(0, hipRise) * 3;
}

function currentLowerImpulseProxy(sample) {
  const samples = state.poseSamples;
  const previous = samples[samples.length - 2];
  return lowerImpulseProxyBetween(previous, sample);
}

function lowerImpulseProxyPeak() {
  let peak = 0;
  for (let index = 1; index < state.poseSamples.length; index += 1) {
    const value = lowerImpulseProxyBetween(state.poseSamples[index - 1], state.poseSamples[index]);
    if (Number.isFinite(value)) peak = Math.max(peak, value);
  }
  return peak > 0 ? peak : null;
}

function drawCourtGuide(ctx, rect, floorY, scale) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(255, 255, 255, .2)";
  ctx.lineWidth = 1.25 * scale;
  ctx.beginPath();
  ctx.moveTo(rect.x + rect.width * 0.04, floorY);
  ctx.lineTo(rect.x + rect.width * 0.96, floorY);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, .1)";
  ctx.lineWidth = 0.8 * scale;
  [0.25, 0.5, 0.75].forEach((ratio) => {
    const x = rect.x + rect.width * ratio;
    ctx.beginPath();
    ctx.moveTo(x, floorY - 5 * scale);
    ctx.lineTo(x, floorY + 5 * scale);
    ctx.stroke();
  });

  ctx.fillStyle = "rgba(255,255,255,.5)";
  ctx.font = "700 9px Inter, sans-serif";
  ctx.fillText("floor guide / court lines uncalibrated", rect.x + 12, Math.max(rect.y + 20, floorY - 12));
  ctx.restore();
}

function drawVirtualRimScene(ctx, rect, scale) {
  if (!state.rim?.center) return;
  const center = mapNormalizedPoint(state.rim.center, rect);
  const radiusX = clamp((state.rim.radiusX || 0.024) * rect.width, 7 * scale, 22 * scale);
  const radiusY = radiusX * 0.22;
  const sample = state.poseSamples[state.poseSamples.length - 1];
  const athleteX = sample?.footX ?? 0.5;
  const side = state.rim.center.x < athleteX ? -1 : 1;
  const boardX = center.x + side * radiusX * 2.15;
  const boardTop = center.y - radiusX * 2.8;
  const boardBottom = center.y + radiusX * 2.45;
  const supportX = boardX + side * radiusX * 1.6;
  const floorY = clamp(courtFloorY(rect), center.y + radiusX * 4.2, rect.y + rect.height - 8);

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(255,255,255,.22)";
  ctx.lineWidth = 1.05 * scale;
  ctx.beginPath();
  ctx.moveTo(boardX, boardTop);
  ctx.lineTo(boardX, boardBottom);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,.13)";
  ctx.setLineDash([4 * scale, 5 * scale]);
  ctx.beginPath();
  ctx.moveTo(supportX, boardBottom);
  ctx.lineTo(supportX, floorY);
  ctx.moveTo(boardX, center.y);
  ctx.lineTo(supportX, center.y + radiusX * 0.8);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(255, 196, 0, .78)";
  ctx.lineWidth = 1.8 * scale;
  ctx.beginPath();
  ctx.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,.46)";
  ctx.font = "700 9px Inter, sans-serif";
  ctx.fillText("virtual rim guide / support uncalibrated", rect.x + 12, Math.max(rect.y + 20, boardTop - 8));
  ctx.restore();
}

function drawBallTrail(ctx, rect, scale) {
  let visibleTrail = state.importedBallTrail.length >= 3
    ? importedBallTrailPoints()
    : stableBallTrail();
  if (!visibleTrail.length) visibleTrail = manualBallVisualTrail();
  if (visibleTrail.length === 1) {
    ctx.save();
    const p = mapNormalizedPoint(visibleTrail[0].normalized, rect);
    ctx.shadowColor = "rgba(255, 196, 0, .72)";
    ctx.shadowBlur = 5 * scale;
    dot(ctx, p, clamp((visibleTrail[0].radius || 4) * 0.78, 3, 6.2) * scale, "rgba(255, 196, 0, .92)", "rgba(255,255,255,.75)");
    ctx.restore();
    return;
  }
  const segments = splitBallTrailSegments(visibleTrail);
  if (!segments.length) return;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 196, 0, .88)";
  ctx.lineWidth = 1.7 * scale;
  ctx.shadowColor = "rgba(255, 196, 0, .65)";
  ctx.shadowBlur = 4 * scale;
  for (const segment of segments) {
    const points = segment.map((item) => mapNormalizedPoint(item.normalized, rect));
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      const mid = point((current.x + next.x) / 2, (current.y + next.y) / 2);
      ctx.quadraticCurveTo(current.x, current.y, mid.x, mid.y);
    }
    const lastPoint = points[points.length - 1];
    ctx.lineTo(lastPoint.x, lastPoint.y);
    ctx.stroke();
  }
  const dots = segments.flat().slice(-18);
  dots.forEach((item, index) => {
    const p = mapNormalizedPoint(item.normalized, rect);
    const alpha = 0.22 + (index / Math.max(1, dots.length)) * 0.58;
    dot(ctx, p, clamp((item.radius || 3.5) * 0.78, 2, 5.8) * scale, `rgba(255, 196, 0, ${alpha})`, "rgba(0,0,0,.3)");
  });
  ctx.restore();
}

function drawCourtAndForceProxy(ctx, rect, scale) {
  const sample = state.poseSamples[state.poseSamples.length - 1];
  const floorY = courtFloorY(rect);

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();

  drawCourtGuide(ctx, rect, floorY, scale);
  if (!sample) {
    ctx.restore();
    return;
  }

  const anchor = forceAnchorSample(sample);
  const footX = clamp(rect.x + anchor.footX * rect.width, rect.x + 10, rect.x + rect.width - 10);
  const currentProxy = currentLowerImpulseProxy(sample);
  const peakProxy = lowerImpulseProxyPeak();
  if (!Number.isFinite(currentProxy) || !Number.isFinite(peakProxy) || peakProxy <= 0 || currentProxy <= 0) {
    ctx.restore();
    return;
  }
  const relativeProxy = clamp(currentProxy / peakProxy, 0, 1);
  if (relativeProxy < 0.08) {
    ctx.restore();
    return;
  }
  const arrowSize = clamp(rect.height * 0.24 * relativeProxy, 18 * scale, 92 * scale);

  ctx.strokeStyle = "rgba(255, 196, 0, .88)";
  ctx.fillStyle = "rgba(255, 196, 0, .88)";
  ctx.lineWidth = 3.2 * scale;
  const from = point(footX, floorY + 2);
  const to = point(footX, floorY - arrowSize);
  ctx.shadowColor = "rgba(255, 196, 0, .62)";
  ctx.shadowBlur = 8 * scale;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - 7 * scale, to.y + 14 * scale);
  ctx.lineTo(to.x + 7 * scale, to.y + 14 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(255, 196, 0, .18)";
  ctx.beginPath();
  ctx.ellipse(footX, floorY + 3 * scale, 22 * scale, 4.8 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = "800 10px Inter, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,.58)";
  const labelX = clamp(footX + 8, rect.x + 10, rect.x + rect.width - 118);
  ctx.fillText(`relative vGRF proxy ${Math.round(relativeProxy * 100)}%`, labelX, Math.max(rect.y + 22, to.y - 6));
  ctx.restore();
}

function drawPoseLandmarks(ctx, landmarks, rect, scale, view = state.activeView) {
  const visible = (index) => {
    const landmark = landmarks[index];
    return landmark && (landmark.visibility === undefined || landmark.visibility > 0.35);
  };
  const zoomBoost = view === "body" || view === "compare" ? 1.34 : 1;
  const dotBoost = view === "body" || view === "compare" ? 1.42 : 1;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  poseEdges.forEach(([from, to]) => {
    if (!visible(from) || !visible(to)) return;
    const a = mapLandmark(landmarks[from], rect);
    const b = mapLandmark(landmarks[to], rect);
    const isArm = [13, 14, 15, 16, 19, 20, 21, 22].includes(from) || [13, 14, 15, 16, 19, 20, 21, 22].includes(to);
    const isLeg = [25, 26, 27, 28, 29, 30, 31, 32].includes(from) || [25, 26, 27, 28, 29, 30, 31, 32].includes(to);
    ctx.strokeStyle = isArm ? "rgba(255, 152, 40, .9)" : isLeg ? "rgba(76, 211, 194, .9)" : "rgba(247, 243, 234, .78)";
    ctx.lineWidth = (isArm ? 1.65 : 1.45) * scale * zoomBoost;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 2.2 * scale * zoomBoost;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  });

  landmarks.forEach((landmark, index) => {
    if (landmark.visibility !== undefined && landmark.visibility < 0.35) return;
    const p = mapLandmark(landmark, rect);
    const isWrist = index === 15 || index === 16;
    const isShoulderHip = [11, 12, 23, 24].includes(index);
    const color = isWrist ? "#ffc400" : isShoulderHip ? "#fff0b8" : "#dff8ff";
    dot(ctx, p, (isWrist ? 2.45 : 1.75) * scale * dotBoost, color);
  });
  ctx.restore();
}

function formatDelta(current, previous, unit = "") {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return "Pending";
  const delta = roundMetric(current - previous, Math.abs(current - previous) < 10 ? 1 : 0);
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta}${unit}`;
}

function drawComparePanel(ctx, width, height) {
  const previous = state.previousSnapshot;
  const current = state.analysis?.metrics || {};
  ctx.save();
  const panelWidth = Math.min(width - 28, 300);
  const panelX = (width - panelWidth) / 2;
  const panelY = height - 118;
  ctx.fillStyle = "rgba(5,5,5,.74)";
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelWidth, 92, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.78)";
  ctx.font = "800 11px Inter, sans-serif";
  ctx.fillText("Compare", panelX + 12, panelY + 20);
  ctx.font = "700 10px Inter, sans-serif";
  if (!previous?.metrics) {
    ctx.fillStyle = "rgba(255,255,255,.52)";
    ctx.fillText("Previous shot will appear after another analysis.", panelX + 12, panelY + 44);
    ctx.fillText("Use this view for progress tracking.", panelX + 12, panelY + 61);
    ctx.restore();
    return;
  }
  const rows = [
    ["Dip", current.dip_depth_pct, previous.metrics.dip_depth_pct, "%"],
    ["Chain", current.lower_to_wrist_score, previous.metrics.lower_to_wrist_score, ""],
    ["Arc", current.arc_height_m, previous.metrics.arc_height_m, "m"]
  ];
  rows.forEach(([label, currentValue, previousValue, unit], index) => {
    const y = panelY + 42 + index * 16;
    ctx.fillStyle = "rgba(255,255,255,.48)";
    ctx.fillText(label, panelX + 12, y);
    ctx.fillStyle = "rgba(255,196,0,.88)";
    ctx.fillText(formatDelta(currentValue, previousValue, unit), panelX + 78, y);
  });
  ctx.restore();
}

function drawNotice(ctx, width, height, title, body) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.font = "800 16px Inter, sans-serif";
  ctx.fillText(title, width / 2, height / 2 - 10);
  ctx.fillStyle = "rgba(255,255,255,.56)";
  ctx.font = "700 11px Inter, sans-serif";
  ctx.fillText(body, width / 2, height / 2 + 13);
  ctx.restore();
}

function drawCanvas() {
  const { width, height, dpr } = sizeCanvas();
  const ctx = nodes.overlayCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#030303";
  ctx.fillRect(0, 0, width, height);

  const play = playbackState();
  const rect = fitVideoRect(width, height);
  const scale = Math.max(0.72, Math.min(width, height) / 390);
  let landmarks = null;
  let renderRect = rect;

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.globalAlpha = 0.12;
  for (let i = 1; i < 5; i += 1) {
    const y = rect.y + (rect.height * i) / 5;
    ctx.beginPath();
    ctx.moveTo(rect.x, y);
    ctx.lineTo(rect.x + rect.width, y);
    ctx.stroke();
  }
  ctx.restore();

  if (!state.videoIssue && state.activeView === "full" && !state.poseEngine?.landmarker) {
    drawVirtualRimScene(ctx, rect, scale);
  }

  if (state.videoIssue) {
    drawNotice(ctx, width, height, t("noticeVideoTitle"), t("noticeVideoBody"));
  } else if (state.poseEngine?.error) {
    drawNotice(ctx, width, height, t("noticePoseApiTitle"), t("noticePoseApiBody"));
  } else if (!state.poseEngine?.landmarker) {
    drawNotice(ctx, width, height, t("noticeLoadingTitle"), t("noticeLoadingBody"));
  } else {
    const result = detectPoseForCurrentFrame();
    landmarks = result?.landmarks?.[0];
    if (landmarks?.length) {
      appendPoseSample(landmarks);
      if (state.activeView === "body" || state.activeView === "compare") {
        renderRect = fitPoseZoomRect(landmarks, width, height);
      }
      if (state.activeView === "full") {
        drawCourtAndForceProxy(ctx, rect, scale);
        drawVirtualRimScene(ctx, rect, scale);
        detectBallCandidate(rect, landmarks);
        drawBallTrail(ctx, rect, scale);
      } else {
        drawCourtAndForceProxy(ctx, rect, scale);
      }
      drawPoseLandmarks(ctx, landmarks, renderRect, scale, state.activeView);
      if (state.activeView === "compare") drawComparePanel(ctx, width, height);
    } else {
      if (state.activeView === "full") {
        drawVirtualRimScene(ctx, rect, scale);
        drawBallTrail(ctx, rect, scale);
      }
      drawNotice(ctx, width, height, t("noticePoseTitle"), t("noticePoseBody"));
    }
  }

  ctx.save();
  const barX = width * 0.08;
  const barY = height - 18;
  const barW = width * 0.84;
  ctx.fillStyle = "rgba(255,255,255,.22)";
  ctx.fillRect(barX, barY, barW, 2);
  ctx.fillStyle = "#ffc400";
  ctx.fillRect(barX, barY, barW * play.phase, 2);
  ctx.fillStyle = "rgba(255,255,255,.52)";
  ctx.font = "700 10px Inter, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(play.synced ? `${play.time.toFixed(1)} / ${play.duration.toFixed(1)}s` : "preview", width - 18, 25);
  ctx.textAlign = "left";
  const rimLabel = state.rim?.center ? "rim calibrated" : "tap Set Rim";
  const stableTrail = stableBallTrail();
  const ballLabel =
    state.importedBallTrail.length >= 3
      ? `auto ball ${stableTrail.length >= 5 ? "locked" : "needs review"}`
      : stableTrail.length >= 5
        ? "ball trail locked"
        : state.ballTrail.some((item) => item.seeded || item.source === "manual")
          ? "manual ball set"
        : state.ballTrail.length >= 3
          ? "ball candidates unverified"
          : "ball pending";
  ctx.fillText(state.activeView === "full" ? `${rimLabel} / ${ballLabel}` : state.activeView, 18, 25);
  ctx.restore();

  state.animationId = requestAnimationFrame(drawCanvas);
}

function bindEvents() {
  nodes.videoInput.addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) runAnalysis(file);
  });

  nodes.yoloCsvInput?.addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    const text = await file.text();
    importYoloCsv(text, file.name);
    event.target.value = "";
  });

  nodes.sourceVideo.addEventListener("loadedmetadata", renderCalibrationGuide);
  nodes.sourceVideo.addEventListener("canplay", renderCalibrationGuide);
  nodes.sourceVideo.addEventListener("loadeddata", clearVideoIssueIfReady);
  nodes.sourceVideo.addEventListener("canplay", clearVideoIssueIfReady);

  document.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget?.dataset.action === "demo") runAnalysis(null);
    if (actionTarget?.dataset.action === "home") showScreen("home");
    if (actionTarget?.dataset.action === "rim") startRimPicking();
    if (actionTarget?.dataset.action === "ball") startBallPicking();

    const langTarget = event.target.closest("[data-lang]");
    if (langTarget) {
      state.language = langTarget.dataset.lang === "en" ? "en" : "ja";
      localStorage.setItem("arcai:language", state.language);
      applyLanguage();
    }

    const speedTarget = event.target.closest("[data-speed]");
    if (speedTarget) {
      state.playbackRate = Number(speedTarget.dataset.speed);
      localStorage.setItem("arcai:playback-rate", String(state.playbackRate));
      applyPlaybackRate();
    }

    const tabTarget = event.target.closest("[data-tab]");
    if (tabTarget) {
      state.activeTab = tabTarget.dataset.tab;
      state.activeMetricKey = null;
      renderMetricCard();
    }

    const metricTarget = event.target.closest("[data-metric]");
    if (metricTarget) {
      const key = metricTarget.dataset.metric;
      state.activeMetricKey = state.activeMetricKey === key ? null : key;
      renderMetricCard();
    }

    const viewTarget = event.target.closest("[data-view]");
    if (viewTarget) {
      state.activeView = viewTarget.dataset.view;
      state.previousLuma = null;
      state.lastMotionTime = -1;
      document.querySelectorAll("[data-view]").forEach((button) => {
        button.classList.toggle("active", button.dataset.view === state.activeView);
      });
      restartCanvas();
    }
  });

  nodes.rimPickLayer.addEventListener("pointerdown", handleRimPick);
  nodes.rimPickLayer.addEventListener("click", handleRimPick);
  nodes.rimPickLayer.addEventListener("touchend", handleRimPick, { passive: false });
  window.addEventListener("resize", restartCanvas);
}

applyLanguage();
applyPlaybackRate();
bindEvents();
splash();
drawCanvas();
