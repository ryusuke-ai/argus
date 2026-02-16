import {
  AbsoluteFill,
  Audio,
  Img,
  Video,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  continueRender,
  delayRender,
} from "remotion";
import { useEffect, useState } from "react";

// トランジションのデフォルト長さ（フレーム数）
const DEFAULT_TRANSITION_FRAMES = 6; // 0.2秒 @30fps

// 効果音の遅延再生フレーム数（マイナス値=シーン開始後に再生）
const SOUND_LEAD_FRAMES = -6; // 0.2秒後から再生

// フォント設定
const FONT_FAMILY = "KeiFont, sans-serif";

// レイアウト定数（1920x1080基準）
const LAYOUT = {
  // キャラクター領域（右下、大きくはみ出す、余白なし）
  CHARA_RIGHT: -50,
  CHARA_BOTTOM: -300,
  CHARA_HEIGHT: 650,

  // テキスト領域（2行固定）
  TEXT_LEFT: 20,
  TEXT_RIGHT: 180,
  TEXT_BOTTOM: 12, // highlight ありの場合
  TEXT_BOTTOM_NO_HIGHLIGHT: 20, // highlight なしの場合（ゆとりあり）
  TEXT_HEIGHT: 142, // 2行固定高さ（12px増）
  TEXT_FONT_SIZE_DEFAULT: 48, // デフォルトフォントサイズ（4px減）
  TEXT_FONT_SIZE_MIN: 28, // 最小フォントサイズ
  TEXT_MAX_CHARS_DEFAULT: 38, // デフォルトサイズで表示できる最大文字数（フォント小さくなったので増）
  TEXT_PADDING: "6px 28px", // 上下左右の余白

  // メインキャンバス領域（16:9画像用に横幅最大化）
  CANVAS_TOP: 20, // 画像を上寄せ（ハイライトとの被り軽減）
  CANVAS_LEFT: 40,
  CANVAS_RIGHT: 40, // 横幅を最大に
  CANVAS_BOTTOM: 180, // テキストボックスを避ける

  // ハイライトテキスト（画像ありの場合、チャットバブルのちょっと上に配置）
  HIGHLIGHT_BOTTOM: 120, // チャットバブル(90px) + 余白(30px)
  HIGHLIGHT_FONT_SIZE: 72,
  HIGHLIGHT_PADDING: "16px 32px",

  // セクションタイトル（左上）
  SECTION_TOP: 16,
  SECTION_LEFT: 16,
  SECTION_FONT_SIZE: 38,
  SECTION_PADDING: "14px 28px",

  // ウォーターマーク（右上）
  WATERMARK_TOP: 16,
  WATERMARK_RIGHT: 16,
  WATERMARK_HEIGHT: 100,
  WATERMARK_OPACITY: 0.4,
};

/**
 * セクションタイトルコンポーネント
 * 左上に控えめなセクション名を表示（セクション内で永続表示）
 */
const SectionTitle = ({ title, isNewSection, transitionFrames }) => {
  const frame = useCurrentFrame();

  if (!title) return null;

  // フェードインアニメーション（新しいセクション開始時のみ）
  let opacity = 0.85;
  if (isNewSection) {
    opacity = interpolate(
      frame,
      [transitionFrames, transitionFrames + 20],
      [0, 0.85],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        top: LAYOUT.SECTION_TOP,
        left: LAYOUT.SECTION_LEFT,
        zIndex: 10,
        backgroundColor: "#ffffff",
        borderRadius: 8,
        padding: LAYOUT.SECTION_PADDING,
        opacity,
        border: "3px solid #000000",
      }}
    >
      <p
        style={{
          color: "#1a1a1a",
          fontSize: LAYOUT.SECTION_FONT_SIZE,
          fontFamily: FONT_FAMILY,
          fontWeight: 600,
          margin: 0,
          letterSpacing: "0.03em",
        }}
      >
        {title}
      </p>
    </div>
  );
};

/**
 * ウォーターマークコンポーネント
 * 右上にブランドロゴなどを半透明で表示
 */
const Watermark = ({ src }) => {
  if (!src) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: LAYOUT.WATERMARK_TOP,
        right: LAYOUT.WATERMARK_RIGHT,
        zIndex: 10,
        opacity: LAYOUT.WATERMARK_OPACITY,
      }}
    >
      <Img
        src={staticFile(src)}
        style={{
          height: LAYOUT.WATERMARK_HEIGHT,
          objectFit: "contain",
        }}
      />
    </div>
  );
};

/**
 * ハイライトコンポーネント
 * subsectionの要点を伝える（効果音付き、黄色背景）
 * hasImage: 画像がある場合は下部に、ない場合は中央に大きく表示
 */
const Highlight = ({ highlight, hasImage = true }) => {
  if (!highlight) return null;

  const text = highlight.text || "";

  // 画像がない場合は中央に大きく表示
  if (!hasImage) {
    return (
      <div
        style={{
          position: "absolute",
          top: LAYOUT.CANVAS_TOP,
          left: LAYOUT.CANVAS_LEFT,
          right: LAYOUT.CANVAS_RIGHT,
          bottom: LAYOUT.CANVAS_BOTTOM,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 5,
        }}
      >
        <div
          style={{
            padding: "40px 80px",
            backgroundColor: "rgba(255, 255, 0, 0.95)",
            borderRadius: 16,
            maxWidth: "80%",
          }}
        >
          <p
            style={{
              color: "#1a1a1a",
              fontSize: 120,
              fontFamily: FONT_FAMILY,
              fontWeight: 900,
              margin: 0,
              lineHeight: 1.4,
              textAlign: "center",
            }}
          >
            {text}
          </p>
        </div>
      </div>
    );
  }

  // 画像がある場合は下部に表示（チャットバブルのちょっと上）
  return (
    <div
      style={{
        position: "absolute",
        bottom: LAYOUT.HIGHLIGHT_BOTTOM,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        zIndex: 5,
      }}
    >
      <div
        style={{
          padding: LAYOUT.HIGHLIGHT_PADDING,
          backgroundColor: "rgba(255, 255, 0, 0.95)",
          borderRadius: 10,
        }}
      >
        <p
          style={{
            color: "#1a1a1a",
            fontSize: LAYOUT.HIGHLIGHT_FONT_SIZE,
            fontFamily: FONT_FAMILY,
            fontWeight: 900,
            margin: 0,
            lineHeight: 1.2,
            textAlign: "center",
          }}
        >
          {text}
        </p>
      </div>
    </div>
  );
};

/**
 * メインキャンバスコンポーネント
 * 説明画像を16:9の白背景（黒枠線）で表示
 * 画像サイズはハイライトの有無に関わらず固定
 */
const MainCanvas = ({ imageSrc, transitionFrames, animate = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 登場アニメーション（animate時のみ）
  let canvasOpacity = 1;
  let scale = 1;

  if (animate) {
    canvasOpacity = interpolate(
      frame,
      [transitionFrames, transitionFrames + 15],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    const scaleSpring = spring({
      frame: Math.max(0, frame - transitionFrames),
      fps,
      config: { damping: 20, stiffness: 100 },
    });
    scale = interpolate(scaleSpring, [0, 1], [0.95, 1]);
  }

  if (!imageSrc) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        top: LAYOUT.CANVAS_TOP,
        left: LAYOUT.CANVAS_LEFT,
        right: LAYOUT.CANVAS_RIGHT,
        bottom: LAYOUT.CANVAS_BOTTOM, // 固定値（ハイライトの有無に関わらず）
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: canvasOpacity,
        transform: `scale(${scale})`,
      }}
    >
      {/* 16:9の白背景キャンバス（黒枠線付き） */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxHeight: "100%",
          aspectRatio: "16 / 9",
          backgroundColor: "#ffffff",
          border: "4px solid #000000",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
        }}
      >
        <Img
          src={staticFile(imageSrc)}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
          }}
        />
      </div>
    </div>
  );
};

/**
 * キャラクターコンポーネント
 * 喋っている間ゆっくりジャンプするアニメーション
 * animate: trueの場合のみ登場アニメーション
 */
const Character = ({ characterSrc, animate = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ジャンプアニメーション（常に）
  const jumpCycle = 20;
  const jumpHeight = 6;
  const jumpY = Math.sin((frame / jumpCycle) * Math.PI * 2) * jumpHeight;

  // 登場アニメーション（animate時のみ）
  let opacity = 1;
  let scale = 1;

  if (animate) {
    opacity = interpolate(frame, [0, 10], [0, 1], {
      extrapolateRight: "clamp",
    });
    const scaleSpring = spring({
      frame,
      fps,
      config: { damping: 15, stiffness: 80 },
    });
    scale = interpolate(scaleSpring, [0, 1], [0.9, 1]);
  }

  return (
    <div
      style={{
        position: "absolute",
        bottom: LAYOUT.CHARA_BOTTOM,
        right: LAYOUT.CHARA_RIGHT,
        opacity,
        transform: `translateY(${-jumpY}px) scale(${scale})`,
      }}
    >
      <Img
        src={staticFile(characterSrc)}
        style={{
          height: LAYOUT.CHARA_HEIGHT,
          objectFit: "contain",
        }}
      />
    </div>
  );
};

/**
 * シーンコンポーネント
 * 背景画像 + キャラクター + テキスト + 音声を表示
 */
/**
 * 動画クリップシーン
 * フルスクリーンで音声付き動画を再生
 */
const VideoClipScene = ({
  videoSrc,
  videoVolume = 1.0,
  videoStartTime = 0,
  durationInFrames,
  transitionIn,
  transitionOut,
  transitionFrames = DEFAULT_TRANSITION_FRAMES,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // トランジションイン（フェード）
  let inOpacity = 1;
  if (transitionIn === "fade" || transitionIn === "crossfade") {
    inOpacity = interpolate(frame, [0, transitionFrames], [0, 1], {
      extrapolateRight: "clamp",
    });
  }

  // トランジションアウト（フェード）
  let outOpacity = 1;
  const outStart = durationInFrames - transitionFrames;
  if (transitionOut === "fade" || transitionOut === "crossfade") {
    outOpacity = interpolate(frame, [outStart, durationInFrames], [1, 0], {
      extrapolateLeft: "clamp",
    });
  }

  const opacity = Math.min(inOpacity, outOpacity);

  // 動画の開始位置（秒）をフレームに変換
  const startFrom = Math.round(videoStartTime * fps);

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: "#000000" }}>
      {videoSrc && (
        <OffthreadVideo
          src={staticFile(videoSrc)}
          startFrom={startFrom}
          volume={videoVolume}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      )}
    </AbsoluteFill>
  );
};

const Scene = ({
  text,
  audioSrc,
  backgroundSrc,
  characterSrc,
  imageSrc,
  highlight,
  currentSection, // 現在のセクション（永続表示用）
  isNewSection, // このシーンで新しいセクションが始まるか
  watermarkSrc,
  durationInFrames,
  transitionIn,
  transitionOut,
  transitionFrames = DEFAULT_TRANSITION_FRAMES,
  textBoxColor = "rgba(0, 0, 0, 0.8)",
  playbackRate = 1.0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // トランジションイン（フェード/スライド）
  let inOpacity = 1;
  let inTranslateX = 0;

  if (transitionIn === "fade" || transitionIn === "crossfade") {
    inOpacity = interpolate(frame, [0, transitionFrames], [0, 1], {
      extrapolateRight: "clamp",
    });
  } else if (transitionIn === "slideLeft") {
    inTranslateX = interpolate(frame, [0, transitionFrames], [100, 0], {
      extrapolateRight: "clamp",
    });
    inOpacity = interpolate(frame, [0, transitionFrames], [0, 1], {
      extrapolateRight: "clamp",
    });
  } else if (transitionIn === "slideRight") {
    inTranslateX = interpolate(frame, [0, transitionFrames], [-100, 0], {
      extrapolateRight: "clamp",
    });
    inOpacity = interpolate(frame, [0, transitionFrames], [0, 1], {
      extrapolateRight: "clamp",
    });
  }

  // トランジションアウト（フェード/スライド）
  let outOpacity = 1;
  let outTranslateX = 0;
  const outStart = durationInFrames - transitionFrames;

  if (transitionOut === "fade" || transitionOut === "crossfade") {
    outOpacity = interpolate(frame, [outStart, durationInFrames], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  } else if (transitionOut === "slideLeft") {
    outTranslateX = interpolate(
      frame,
      [outStart, durationInFrames],
      [0, -100],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    );
    outOpacity = interpolate(frame, [outStart, durationInFrames], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  } else if (transitionOut === "slideRight") {
    outTranslateX = interpolate(frame, [outStart, durationInFrames], [0, 100], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    outOpacity = interpolate(frame, [outStart, durationInFrames], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }

  const opacity = Math.min(inOpacity, outOpacity);
  const translateX = inTranslateX + outTranslateX;

  // アニメーションはtransition指定時のみ
  const hasTransition = !!transitionIn;

  // テキストのフェードイン（transition時のみ）
  const textOpacity = hasTransition
    ? interpolate(frame, [transitionFrames, transitionFrames + 15], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  // テキストのスライドイン（transition時のみ）
  const textTranslateY = hasTransition
    ? interpolate(
        spring({
          frame: Math.max(0, frame - transitionFrames),
          fps,
          config: { damping: 100, stiffness: 200 },
        }),
        [0, 1],
        [30, 0],
      )
    : 0;

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: `translateX(${translateX}%)`,
      }}
    >
      {/* 背景（画像または動画） */}
      {backgroundSrc &&
        (backgroundSrc.endsWith(".mp4") || backgroundSrc.endsWith(".webm") ? (
          <OffthreadVideo
            src={staticFile(backgroundSrc)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
            muted
            loop
          />
        ) : (
          <Img
            src={staticFile(backgroundSrc)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ))}

      {/* セクションタイトル（左上、セクション内で永続表示） */}
      <SectionTitle
        title={currentSection}
        isNewSection={isNewSection}
        transitionFrames={transitionFrames}
      />

      {/* ウォーターマーク（右上） */}
      <Watermark src={watermarkSrc} />

      {/* メインキャンバス（説明画像） */}
      <MainCanvas
        imageSrc={imageSrc}
        transitionFrames={transitionFrames}
        animate={hasTransition}
      />

      {/* ハイライト（badge/caption、画像なしの場合は中央に大きく表示） */}
      <Highlight highlight={highlight} hasImage={!!imageSrc} />

      {/* キャラクター立ち絵 */}
      {characterSrc && (
        <Character characterSrc={characterSrc} animate={hasTransition} />
      )}

      {/* テキスト表示エリア（1行固定、フォントサイズ自動調整） */}
      {(() => {
        // 文字数に応じてフォントサイズを計算
        const textLength = text ? text.length : 0;
        const fontSize =
          textLength <= LAYOUT.TEXT_MAX_CHARS_DEFAULT
            ? LAYOUT.TEXT_FONT_SIZE_DEFAULT
            : Math.max(
                LAYOUT.TEXT_FONT_SIZE_MIN,
                Math.floor(
                  (LAYOUT.TEXT_FONT_SIZE_DEFAULT *
                    LAYOUT.TEXT_MAX_CHARS_DEFAULT) /
                    textLength,
                ),
              );

        // highlight の有無でチャットバブルの位置を変える
        const textBottom = highlight
          ? LAYOUT.TEXT_BOTTOM
          : LAYOUT.TEXT_BOTTOM_NO_HIGHLIGHT;

        return (
          <div
            style={{
              position: "absolute",
              bottom: textBottom,
              left: LAYOUT.TEXT_LEFT,
              right: LAYOUT.TEXT_RIGHT,
              height: LAYOUT.TEXT_HEIGHT,
              backgroundColor: textBoxColor,
              borderRadius: 24,
              padding: LAYOUT.TEXT_PADDING,
              opacity: textOpacity,
              transform: `translateY(${textTranslateY}px)`,
              border: "3px solid rgba(255, 255, 255, 0.3)",
              boxShadow:
                "0 8px 32px rgba(0, 0, 0, 0.4), 0 0 20px rgba(255, 255, 255, 0.1)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <p
              style={{
                color: "white",
                fontSize,
                fontFamily: FONT_FAMILY,
                fontWeight: 600,
                margin: 0,
                lineHeight: 1.3,
                textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                width: "100%",
              }}
            >
              {text}
            </p>
          </div>
        );
      })()}

      {/* 音声 */}
      {audioSrc && (
        <Audio src={staticFile(audioSrc)} playbackRate={playbackRate} />
      )}
    </AbsoluteFill>
  );
};

/**
 * メインコンポジション
 * propsで渡されるscenesを順番に再生
 */
export const ExplainerVideo = ({
  scenes,
  bgmSrc,
  bgmVolume = 0.08,
  fontSrc,
  watermarkSrc,
}) => {
  const [fontLoaded, setFontLoaded] = useState(!fontSrc);
  const [handle] = useState(() =>
    fontSrc ? delayRender("Loading font") : null,
  );

  // フォント読み込み
  useEffect(() => {
    if (!fontSrc) return;

    const font = new FontFace("KeiFont", `url(${staticFile(fontSrc)})`);
    font
      .load()
      .then((loadedFont) => {
        document.fonts.add(loadedFont);
        setFontLoaded(true);
        continueRender(handle);
      })
      .catch((err) => {
        console.error("Font load error:", err);
        continueRender(handle);
      });
  }, [fontSrc, handle]);

  // シーンがない場合のフォールバック
  if (!scenes || scenes.length === 0) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#1a1a2e",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <p style={{ color: "white", fontSize: 48 }}>No scenes provided</p>
      </AbsoluteFill>
    );
  }

  // フォント読み込み待ち
  if (!fontLoaded) {
    return null;
  }

  // 各シーンの開始フレームとセクション情報を計算
  let currentFrame = 0;
  let currentSection = null;
  let firstSection = null; // 最初のセクションを記録（オープニング判定用）
  const scenesWithTiming = scenes.map((scene) => {
    const startFrame = currentFrame;
    const transitionFrames =
      scene.transitionFrames || DEFAULT_TRANSITION_FRAMES;
    currentFrame += scene.durationInFrames;

    // セクションの永続化: 新しいsectionが指定されたら更新、なければ前のを維持
    const isNewSection = !!scene.section && scene.section !== currentSection;
    if (scene.section) {
      currentSection = scene.section;
      // 最初のセクションを記録
      if (firstSection === null) {
        firstSection = scene.section;
      }
    }

    return {
      ...scene,
      startFrame,
      transitionFrames,
      currentSection, // 現在有効なセクション
      isNewSection, // 新しいセクションが始まるか
      highlight: scene.highlight, // openingセクションでもhighlightを許可
    };
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {/* シーン */}
      {scenesWithTiming.map((scene, index) => (
        <Sequence
          key={`scene-${index}`}
          from={scene.startFrame}
          durationInFrames={scene.durationInFrames}
        >
          {scene.isVideoClip ? (
            <VideoClipScene
              videoSrc={scene.videoSrc}
              videoVolume={scene.videoVolume}
              videoStartTime={scene.videoStartTime}
              durationInFrames={scene.durationInFrames}
              transitionIn={scene.transitionIn}
              transitionOut={scene.transitionOut}
              transitionFrames={scene.transitionFrames}
            />
          ) : (
            <Scene
              text={scene.text}
              audioSrc={scene.audioSrc}
              backgroundSrc={scene.backgroundSrc}
              characterSrc={scene.characterSrc}
              imageSrc={scene.imageSrc}
              highlight={scene.highlight}
              currentSection={scene.currentSection}
              isNewSection={scene.isNewSection}
              watermarkSrc={watermarkSrc}
              durationInFrames={scene.durationInFrames}
              transitionIn={scene.transitionIn}
              transitionOut={scene.transitionOut}
              transitionFrames={scene.transitionFrames}
              textBoxColor={scene.textBoxColor}
              playbackRate={scene.playbackRate}
            />
          )}
        </Sequence>
      ))}

      {/* 効果音（シーン開始の少し前から再生） */}
      {scenesWithTiming.map((scene, index) => {
        if (!scene.accentSrc) return null;
        const soundStartFrame = Math.max(
          0,
          scene.startFrame - SOUND_LEAD_FRAMES,
        );
        return (
          <Sequence
            key={`sound-${index}`}
            from={soundStartFrame}
            durationInFrames={60}
          >
            <Audio src={staticFile(scene.accentSrc)} />
          </Sequence>
        );
      })}

      {/* BGM（動画全体にループ再生） */}
      {bgmSrc && <Audio src={staticFile(bgmSrc)} volume={bgmVolume} loop />}
    </AbsoluteFill>
  );
};
