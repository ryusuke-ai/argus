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
} from 'remotion';
import { useEffect, useState } from 'react';

// トランジションのデフォルト長さ（フレーム数）
const DEFAULT_TRANSITION_FRAMES = 6; // 0.2秒 @30fps

// 効果音の遅延再生フレーム数（マイナス値=シーン開始後に再生）
const SOUND_LEAD_FRAMES = -6; // 0.2秒後から再生

// フォント設定
const FONT_FAMILY = 'KeiFont, sans-serif';

// レイアウト定数（1080x1920基準 - ショート動画用）
// 画面比率 2 : 6 : 2 = 上部(セクション) : 中部(画像) : 下部(テキスト+キャラ)
// 1920 * 0.2 = 384px (上下), 1920 * 0.6 = 1152px (中央)
const SCREEN = {
  WIDTH: 1080,
  HEIGHT: 1920,
};

const ZONES = {
  TOP_HEIGHT: 384,       // 上部領域（0〜384）: セクションタイトル 20%
  MIDDLE_HEIGHT: 1152,   // 中部領域（384〜1536）: 画像/動画 60%
  BOTTOM_HEIGHT: 384,    // 下部領域（1536〜1920）: テキスト + キャラクター 20%
  MIDDLE_START: 384,
  MIDDLE_END: 1536,
};

const LAYOUT = {
  // 上部領域：セクションタイトル（中央配置）
  SECTION_FONT_SIZE: 88,   // もっとでかく！
  SECTION_PADDING: '20px 48px',

  // 上部領域：コメント（セクションの下）
  COMMENT_TOP: 290,
  COMMENT_LEFT: 40,
  COMMENT_RIGHT: 40,
  COMMENT_FONT_SIZE: 40,

  // 上部領域：ブランドロゴ（右上）
  LOGO_TOP: 40,
  LOGO_RIGHT: 40,
  LOGO_HEIGHT: 60,
  LOGO_OPACITY: 0.9,

  // 中部領域：画像キャンバス（黒背景、アスペクト固定）
  CANVAS_TOP: ZONES.MIDDLE_START,
  CANVAS_LEFT: 0,
  CANVAS_RIGHT: 0,

  // 下部領域：テキスト（縁取り文字、縦センタリング）
  TEXT_LEFT: 40,
  TEXT_RIGHT: 320,      // キャラクター用スペース確保
  TEXT_FONT_SIZE: 68,   // 気持ち大きく
  TEXT_LINE_HEIGHT: 1.35,

  // 下部領域：キャラクター（もっとでかく、少し左に）
  CHARA_RIGHT: 40,      // 少し左に
  CHARA_HEIGHT: 560,    // もっとでかく！

  // ハイライト（中部領域の下部に表示）
  HIGHLIGHT_TOP: ZONES.MIDDLE_END - 100,
  HIGHLIGHT_FONT_SIZE: 56,
  HIGHLIGHT_PADDING: '14px 32px',

  // デフォルトトランジション（shortはアニメなし）
  DEFAULT_TRANSITION: null,
};

/**
 * セクションタイトルコンポーネント（上部領域中央）
 */
const SectionTitle = ({ title }) => {
  if (!title) return null;

  // shortはアニメーションなし - 即座に表示

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: ZONES.TOP_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
      }}
    >
      <div
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          borderRadius: 12,
          padding: LAYOUT.SECTION_PADDING,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        }}
      >
        <p
          style={{
            color: '#1a1a1a',
            fontSize: LAYOUT.SECTION_FONT_SIZE,
            fontFamily: FONT_FAMILY,
            fontWeight: 700,
            margin: 0,
            letterSpacing: '0.05em',
          }}
        >
          {title}
        </p>
      </div>
    </div>
  );
};

/**
 * ブランドロゴコンポーネント（上部領域右上）
 */
const BrandLogo = ({ src }) => {
  if (!src) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: LAYOUT.LOGO_TOP,
        right: LAYOUT.LOGO_RIGHT,
        zIndex: 15,
        opacity: LAYOUT.LOGO_OPACITY,
      }}
    >
      <Img
        src={staticFile(src)}
        style={{
          height: LAYOUT.LOGO_HEIGHT,
          objectFit: 'contain',
        }}
      />
    </div>
  );
};

/**
 * 上部コメントコンポーネント（上部領域、セクションの下）
 */
const TopComment = ({ comment }) => {
  if (!comment) return null;

  // shortはアニメーションなし - 即座に表示
  return (
    <div
      style={{
        position: 'absolute',
        top: LAYOUT.COMMENT_TOP,
        left: LAYOUT.COMMENT_LEFT,
        right: LAYOUT.COMMENT_RIGHT,
        zIndex: 10,
      }}
    >
      <p
        style={{
          color: 'white',
          fontSize: LAYOUT.COMMENT_FONT_SIZE,
          fontFamily: FONT_FAMILY,
          fontWeight: 700,
          margin: 0,
          textAlign: 'center',
          // 縁取り
          WebkitTextStroke: '2px #000000',
          paintOrder: 'stroke fill',
          textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
        }}
      >
        {comment}
      </p>
    </div>
  );
};

/**
 * ハイライトコンポーネント（中部領域の下部に表示）
 */
const Highlight = ({ highlight, hasImage = true }) => {
  if (!highlight) return null;

  const text = highlight.text || '';

  // 画像がない場合は中部領域の中央に大きく表示
  if (!hasImage) {
    return (
      <div
        style={{
          position: 'absolute',
          top: ZONES.MIDDLE_START,
          left: 0,
          right: 0,
          height: ZONES.MIDDLE_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 5,
          backgroundColor: '#000000',
        }}
      >
        <div
          style={{
            padding: '32px 48px',
            backgroundColor: 'rgba(255, 255, 0, 0.95)',
            borderRadius: 16,
            maxWidth: '90%',
          }}
        >
          <p
            style={{
              color: '#1a1a1a',
              fontSize: 72,
              fontFamily: FONT_FAMILY,
              fontWeight: 900,
              margin: 0,
              lineHeight: 1.4,
              textAlign: 'center',
            }}
          >
            {text}
          </p>
        </div>
      </div>
    );
  }

  // 画像がある場合は中部領域の下部に表示
  return (
    <div
      style={{
        position: 'absolute',
        top: LAYOUT.HIGHLIGHT_TOP,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        zIndex: 10,
      }}
    >
      <div
        style={{
          padding: LAYOUT.HIGHLIGHT_PADDING,
          backgroundColor: 'rgba(255, 255, 0, 0.95)',
          borderRadius: 10,
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
        }}
      >
        <p
          style={{
            color: '#1a1a1a',
            fontSize: LAYOUT.HIGHLIGHT_FONT_SIZE,
            fontFamily: FONT_FAMILY,
            fontWeight: 900,
            margin: 0,
            lineHeight: 1.2,
            textAlign: 'center',
          }}
        >
          {text}
        </p>
      </div>
    </div>
  );
};

/**
 * メインキャンバスコンポーネント（中部領域）
 * 黒背景、アスペクト比固定で画像を表示
 */
const MainCanvas = ({ imageSrc, transitionFrames, animate = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  let canvasOpacity = 1;
  let scale = 1;

  if (animate) {
    canvasOpacity = interpolate(
      frame,
      [transitionFrames, transitionFrames + 15],
      [0, 1],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );
    const scaleSpring = spring({
      frame: Math.max(0, frame - transitionFrames),
      fps,
      config: { damping: 20, stiffness: 100 },
    });
    scale = interpolate(scaleSpring, [0, 1], [0.95, 1]);
  }

  // 中部領域全体を黒背景で覆う
  return (
    <div
      style={{
        position: 'absolute',
        top: ZONES.MIDDLE_START,
        left: 0,
        right: 0,
        height: ZONES.MIDDLE_HEIGHT,
        backgroundColor: '#000000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: canvasOpacity,
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
      }}
    >
      {imageSrc && (
        <Img
          src={staticFile(imageSrc)}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
          }}
        />
      )}
    </div>
  );
};

/**
 * キャラクターコンポーネント（下部領域の右側）
 */
const Character = ({ characterSrc, animate = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const jumpCycle = 20;
  const jumpHeight = 4;
  const jumpY = Math.sin((frame / jumpCycle) * Math.PI * 2) * jumpHeight;

  let opacity = 1;
  let scale = 1;

  if (animate) {
    opacity = interpolate(frame, [0, 10], [0, 1], {
      extrapolateRight: 'clamp',
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
        position: 'absolute',
        // 下部領域内に配置
        top: ZONES.MIDDLE_END + 20,
        right: LAYOUT.CHARA_RIGHT,
        opacity,
        transform: `translateY(${-jumpY}px) scale(${scale})`,
        zIndex: 5,
      }}
    >
      <Img
        src={staticFile(characterSrc)}
        style={{
          height: LAYOUT.CHARA_HEIGHT,
          objectFit: 'contain',
        }}
      />
    </div>
  );
};

/**
 * 動画クリップシーン
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

  let inOpacity = 1;
  if (transitionIn === 'fade' || transitionIn === 'crossfade') {
    inOpacity = interpolate(frame, [0, transitionFrames], [0, 1], {
      extrapolateRight: 'clamp',
    });
  }

  let outOpacity = 1;
  const outStart = durationInFrames - transitionFrames;
  if (transitionOut === 'fade' || transitionOut === 'crossfade') {
    outOpacity = interpolate(frame, [outStart, durationInFrames], [1, 0], {
      extrapolateLeft: 'clamp',
    });
  }

  const opacity = Math.min(inOpacity, outOpacity);
  const startFrom = Math.round(videoStartTime * fps);

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: '#000000' }}>
      {videoSrc && (
        <OffthreadVideo
          src={staticFile(videoSrc)}
          startFrom={startFrom}
          volume={videoVolume}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )}
    </AbsoluteFill>
  );
};

/**
 * シーンコンポーネント（縦長用）
 */
const Scene = ({
  text,
  audioSrc,
  backgroundSrc,
  characterSrc,
  imageSrc,
  highlight,
  currentSection,
  isNewSection,
  comment,        // 上部コメント
  logoSrc,        // ブランドロゴ
  watermarkSrc,
  durationInFrames,
  transitionIn,
  transitionOut,
  transitionFrames = DEFAULT_TRANSITION_FRAMES,
  textBoxColor = 'rgba(0, 0, 0, 0.8)',
  playbackRate = 1.0,
}) => {
  // shortはアニメなし - 全てのトランジションを強制無効化
  const effectiveTransitionIn = null;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // トランジションイン（デフォルトでフェード）
  let inOpacity = 1;
  let inTranslateX = 0;

  if (effectiveTransitionIn === 'fade' || effectiveTransitionIn === 'crossfade') {
    inOpacity = interpolate(frame, [0, transitionFrames], [0, 1], {
      extrapolateRight: 'clamp',
    });
  } else if (effectiveTransitionIn === 'slideLeft') {
    inTranslateX = interpolate(frame, [0, transitionFrames], [100, 0], {
      extrapolateRight: 'clamp',
    });
    inOpacity = interpolate(frame, [0, transitionFrames], [0, 1], {
      extrapolateRight: 'clamp',
    });
  } else if (effectiveTransitionIn === 'slideRight') {
    inTranslateX = interpolate(frame, [0, transitionFrames], [-100, 0], {
      extrapolateRight: 'clamp',
    });
    inOpacity = interpolate(frame, [0, transitionFrames], [0, 1], {
      extrapolateRight: 'clamp',
    });
  }

  // トランジションアウト
  let outOpacity = 1;
  let outTranslateX = 0;
  const outStart = durationInFrames - transitionFrames;

  if (transitionOut === 'fade' || transitionOut === 'crossfade') {
    outOpacity = interpolate(frame, [outStart, durationInFrames], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  } else if (transitionOut === 'slideLeft') {
    outTranslateX = interpolate(frame, [outStart, durationInFrames], [0, -100], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    outOpacity = interpolate(frame, [outStart, durationInFrames], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  } else if (transitionOut === 'slideRight') {
    outTranslateX = interpolate(frame, [outStart, durationInFrames], [0, 100], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    outOpacity = interpolate(frame, [outStart, durationInFrames], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  }

  const opacity = Math.min(inOpacity, outOpacity);
  const translateX = inTranslateX + outTranslateX;

  const hasTransition = !!effectiveTransitionIn;

  const textOpacity = hasTransition
    ? interpolate(frame, [transitionFrames, transitionFrames + 15], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;

  const textTranslateY = hasTransition
    ? interpolate(
        spring({
          frame: Math.max(0, frame - transitionFrames),
          fps,
          config: { damping: 100, stiffness: 200 },
        }),
        [0, 1],
        [30, 0]
      )
    : 0;

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: `translateX(${translateX}%)`,
      }}
    >
      {/* 背景 */}
      {backgroundSrc && (
        backgroundSrc.endsWith('.mp4') || backgroundSrc.endsWith('.webm') ? (
          <OffthreadVideo
            src={staticFile(backgroundSrc)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
            muted
            loop
          />
        ) : (
          <Img
            src={staticFile(backgroundSrc)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        )
      )}

      {/* ブランドロゴ（上部右上） */}
      <BrandLogo src={logoSrc} />

      {/* セクションタイトル（上部中央） */}
      <SectionTitle title={currentSection} />

      {/* 上部コメント */}
      <TopComment comment={comment} />

      {/* メインキャンバス（説明画像） */}
      <MainCanvas
        imageSrc={imageSrc}
        transitionFrames={transitionFrames}
        animate={hasTransition}
      />

      {/* ハイライト */}
      <Highlight highlight={highlight} hasImage={!!imageSrc} />

      {/* キャラクター立ち絵 */}
      {characterSrc && (
        <Character characterSrc={characterSrc} animate={hasTransition} />
      )}

      {/* テキスト表示エリア（下部領域、縁取り文字、縦センタリング） */}
      <div
        style={{
          position: 'absolute',
          top: ZONES.MIDDLE_END,
          left: LAYOUT.TEXT_LEFT,
          right: LAYOUT.TEXT_RIGHT,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',  // 縦センタリング
          opacity: textOpacity,
          transform: `translateY(${textTranslateY}px)`,
        }}
      >
        <p
          style={{
            color: 'white',
            fontSize: LAYOUT.TEXT_FONT_SIZE,
            fontFamily: FONT_FAMILY,
            fontWeight: 900,
            margin: 0,
            lineHeight: LAYOUT.TEXT_LINE_HEIGHT,
            // 縁取り（黒）
            WebkitTextStroke: '3px #000000',
            paintOrder: 'stroke fill',
            // 追加のシャドウで立体感
            textShadow: `
              4px 4px 0px #000000,
              -2px -2px 0px #000000,
              2px -2px 0px #000000,
              -2px 2px 0px #000000,
              0px 4px 8px rgba(0,0,0,0.5)
            `,
          }}
        >
          {text}
        </p>
      </div>

      {/* 音声 */}
      {audioSrc && <Audio src={staticFile(audioSrc)} playbackRate={playbackRate} />}
    </AbsoluteFill>
  );
};

/**
 * メインコンポジション（ショート動画用）
 */
export const ExplainerVideoShort = ({ scenes, bgmSrc, bgmVolume = 0.08, fontSrc, watermarkSrc }) => {
  const [fontLoaded, setFontLoaded] = useState(!fontSrc);
  const [handle] = useState(() => (fontSrc ? delayRender('Loading font') : null));

  useEffect(() => {
    if (!fontSrc) return;

    const font = new FontFace('KeiFont', `url(${staticFile(fontSrc)})`);
    font.load().then((loadedFont) => {
      document.fonts.add(loadedFont);
      setFontLoaded(true);
      continueRender(handle);
    }).catch((err) => {
      console.error('Font load error:', err);
      continueRender(handle);
    });
  }, [fontSrc, handle]);

  if (!scenes || scenes.length === 0) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center' }}>
        <p style={{ color: 'white', fontSize: 48 }}>No scenes provided</p>
      </AbsoluteFill>
    );
  }

  if (!fontLoaded) {
    return null;
  }

  let currentFrame = 0;
  let currentSection = null;
  let firstSection = null;
  const scenesWithTiming = scenes.map((scene) => {
    const startFrame = currentFrame;
    const transitionFrames = scene.transitionFrames || DEFAULT_TRANSITION_FRAMES;
    currentFrame += scene.durationInFrames;

    const isNewSection = !!scene.section && scene.section !== currentSection;
    if (scene.section) {
      currentSection = scene.section;
      if (firstSection === null) {
        firstSection = scene.section;
      }
    }

    return {
      ...scene,
      startFrame,
      transitionFrames,
      currentSection,
      isNewSection,
      highlight: scene.highlight,
    };
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
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
              comment={scene.comment}
              logoSrc={watermarkSrc}
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

      {/* 効果音 */}
      {scenesWithTiming.map((scene, index) => {
        if (!scene.accentSrc) return null;
        const soundStartFrame = Math.max(0, scene.startFrame - SOUND_LEAD_FRAMES);
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

      {/* BGM */}
      {bgmSrc && <Audio src={staticFile(bgmSrc)} volume={bgmVolume} loop />}
    </AbsoluteFill>
  );
};
