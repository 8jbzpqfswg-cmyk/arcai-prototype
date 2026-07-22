# ArcAI — basketball shot 解析アプリ（プロトタイプ）

## これは何 / 誰のため
- **観察優先（observation-first）**のバスケ・シュート解析Webアプリ。オーナーは**理学療法士(PT)**。
- 方針：**偽の値を出さない**。測れないものは「未確定」にする。断定的なコーチングはしない。
- 使用環境：**iPad / PC のブラウザ**。オーナーは主に iPad。

## デプロイ（重要）
- **Render の Docker**、`main` へのマージで**自動デプロイ**。URL: https://arcai-prototype.onrender.com/
- フロー：`feature branch` を切る → commit → push → **PR作成 → main にマージ**（オーナー依頼で私がマージ）。
- **キャッシュ版番号**：`index.html` の `?v=20260622-arcai-NN` を毎回 +1（manifest/styles/app.js の3か所、`sed -i` で一括）。上げないと実機に反映されない。
- この環境から onrender.com へは**到達できない**（ネットワークポリシー）。実機確認はオーナー。

## 検証方針（必ず守る・往復を減らす鍵）
- ブラウザ内 MediaPipe はローカルで動かせない。**Playwright + プリインストールChromium**で実app.jsを読み込み検証する：
  - Chromium: `/opt/pw-browsers/chromium`（`chromium.launch({executablePath})`）。playwright は scratchpad の node_modules にある。
  - `index.html` をコピーした一時ハーネスに実データ（`world_frames.json` = 実 worldLandmarks、`result_clean.json` = 実ボール追跡55点）を流し、`canvas.toDataURL()` で描画を出して目視。
  - 投影計算は Python 版（court.py）と**数値一致**を確認済み。
- **デプロイ前に必ずcanvas描画を確認**してから小さく出す（実機往復がコスト高）。ハーネス/一時mjsはコミットしない。

## ファイル構成
- `app.js`（3000行超・本体）／`index.html`（画面）／`styles.css`／`server.js`（ボール検出API）／`scripts/arcai_yolo_ball_track.py`（motion_color_round ボール検出）
- 画面：Home → Analyzing → Result。Result内「ArcAI View」に **Full / 3D / Compare** の3タブ。

## 座標系・描画エンジン
- MediaPipe Pose: `pose_landmarks`(2D正規化) と `pose_world_landmarks`(3Dメートル・腰原点・y下向き)。
- 臨床角度 **F = 180 − 内角**（0°=完全伸展, 大=屈曲）。
- 3D投影（app.js内、court.pyから移植）：`cam3dMatrix(az,el,dist,target)`, `proj3d(P,view,cx,cy,focal)`, `line3d/polyline3d/fillpoly3d`。
- コート寸法 `COURT3D`（FIBA half court, m）。色はcanvasなのでRGB（BGR注意はPython側のみ）。

## 現在の機能（2026-07-22 時点）
- **Full(2D)**：真横視点の**横コート**（左=リング/ボード/支柱/ペイント, 右=センターライン, el≈3°で平ら）。
  - 白/グレーのスケルトン＋**頭部の〇**＋首。**床反力**＝足の支持基底面(BOS)から重心直下に上向き矢印。
  - **ボール**＝短い残像(0.45s)＋先端ボール（`drawBallTrail`）。
  - リング較正済みなら**設定リングにコートをピン留め**＋実スケール化（`drawSideCourt2D`）。未較正は枠フィット＋3P想定。
  - **ピンチ/ホイールでズーム、ドラッグでパン**（`state.zoom2d`）。
- **3D**：回転可能な白アバター＋コート＋リング＋**ボール**。
  - `faceHoopYaw` でリング方向を向く。`smoothWorldLandmarks` で軽く平滑化。実距離配置（`estimateShotDistanceMeters`）。
  - **ドラッグで回転・ピンチ/ホイールでズーム**（`state.cam3d`）。ボールは`drawBall3D`（較正リング基準で画像→コート変換）。
- **左右自動**：`courtFacingSign()`（較正リング vs 足元、無ければボール水平移動）で右利き/左利き・撮影方向に対応。
- **再生UI**：ArcAI View に再生/一時停止ボタン＋**YouTube風の速度ポップアップ**（0.25/0.5/0.75/1x, `.arcai-transport`）。
- 主要関数：`drawThreeDScene`, `drawSideCourt2D`, `drawCourtAndForceProxy`(BOS床反力), `drawPoseLandmarks`(mono=full時白), `drawBallTrail`, `drawBall3D`, `estimateShotDistanceMeters`, `courtFacingSign`, `faceHoopYaw`, `smoothWorldLandmarks`。

## 既知の限界（正直に伝える）
- **3Dの動きは単一の真横視点だと奥側関節の深度が原理的に不定**（MediaPipeが推測で埋める）。本質改善には**斜め45°〜正面 or 2方向撮影**が必要。膝・肘（手前側）は比較的正確。
- ボール検出は環境依存（空背景・小さく速い球）。取れた軌道は表示できる。

## 触らない原則
- server.js・ボール検出・床反力・コート・Render設定は、無関係な変更で不用意に触らない。UI変更は承認を取る。
- 変更は**表示/追加**中心で、検出・指標ロジックを壊さない。

## 引き継ぎ記録（もっと詳しい経緯）
- 別リポジトリ `arcai-ipad-work` の `work/PROGRESS_3D_view.md`（時系列の実装ログ）と `work/DESIGN_DECISIONS_手打ち度.md`（設計合意）。
