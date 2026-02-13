import React from 'react';
import { registerRoot, Composition } from 'remotion';
import { ExplainerVideo } from './ExplainerVideo.jsx';
import { ExplainerVideoShort } from './ExplainerVideoShort.jsx';

// デフォルトのシーン（プレビュー用）
const defaultScenes = [
  {
    text: 'これはサンプルのシーンです',
    durationInFrames: 90,
    backgroundSrc: null,
    audioSrc: null,
  },
];

// 環境変数からシーンデータを取得（レンダリング時）
const getScenes = () => {
  if (typeof process !== 'undefined' && process.env.SCENES_JSON) {
    try {
      return JSON.parse(process.env.SCENES_JSON);
    } catch (e) {
      console.error('Failed to parse SCENES_JSON:', e);
    }
  }
  return defaultScenes;
};

// 総フレーム数を計算
const getTotalFrames = (scenes) => {
  return scenes.reduce((total, scene) => total + scene.durationInFrames, 0);
};

export const RemotionRoot = () => {
  const scenes = getScenes();
  const totalFrames = getTotalFrames(scenes);

  return (
    <>
      {/* 16:9 横長（通常の解説動画） */}
      <Composition
        id="ExplainerVideo"
        component={ExplainerVideo}
        durationInFrames={Math.max(totalFrames, 30)}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          scenes,
        }}
      />
      {/* 9:16 縦長（ショート動画） */}
      <Composition
        id="ExplainerVideoShort"
        component={ExplainerVideoShort}
        durationInFrames={Math.max(totalFrames, 30)}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          scenes,
        }}
      />
    </>
  );
};

registerRoot(RemotionRoot);
