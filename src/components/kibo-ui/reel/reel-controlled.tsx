'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import {
  Reel,
  ReelContent,
  ReelControls,
  ReelFooter,
  ReelHeader,
  ReelImage,
  type ReelItem,
  ReelNavigation,
  ReelProgress,
  ReelVideo,
} from './index';

// Example data for the reel
const reelItems: ReelItem[] = [
  {
    id: 'video-1',
    type: 'video',
    src: '/videos/sample-video-1.mp4',
    duration: 10, // 10 seconds
    title: 'First Video',
    description: 'This is the first video in the reel',
  },
  {
    id: 'image-1',
    type: 'image',
    src: '/images/sample-landscape.jpg',
    duration: 5, // 5 seconds
    alt: 'Beautiful landscape',
    title: 'Nature Photo',
    description: 'A stunning landscape photograph',
  },
  {
    id: 'video-2',
    type: 'video',
    src: '/videos/sample-video-2.mp4',
    duration: 15, // 15 seconds
    title: 'Second Video',
    description: 'Another exciting video',
  },
  {
    id: 'image-2',
    type: 'image',
    src: '/images/sample-cityscape.jpg',
    duration: 7, // 7 seconds
    alt: 'City skyline',
    title: 'Urban Photography',
    description: 'Modern city architecture',
  },
];

export function ReelControlledExample() {
  const uiText = useTranslations('common');
  // Controlled state for all reel properties
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);

  // External controls
  const handleJumpToItem = (index: number) => {
    setCurrentIndex(index);
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleToggleMute = () => {
    setIsMuted(!isMuted);
  };

  const handleNext = () => {
    if (currentIndex < reelItems.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setCurrentIndex(0); // Loop back to start
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else {
      setCurrentIndex(reelItems.length - 1); // Loop to end
    }
  };

  const currentItem = reelItems[currentIndex];

  return (
    <div className="flex flex-col gap-6">
      {/* External Controls */}
      <div className="flex flex-col gap-4 rounded-lg border p-4">
        <h3 className="font-semibold text-lg">{uiText('m_df181736b8')}</h3>

        <div className="flex gap-2">
          <button
            className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
            onClick={handlePrevious}
            type="button"
          >
            {uiText('previous_a57b08a')}
          </button>
          <button
            className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
            onClick={handlePlayPause}
            type="button"
          >
            {isPlaying ? uiText('pause_858e4ba') : uiText('play_436e610')}
          </button>
          <button
            className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
            onClick={handleNext}
            type="button"
          >
            {uiText('next_1ff57a2')}
          </button>
          <button
            className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
            onClick={handleToggleMute}
            type="button"
          >
            {isMuted ? uiText('unmute_ce4ee4e') : uiText('mute_8dd6857')}
          </button>
        </div>

        <div className="flex gap-2">
          {reelItems.map((item, index) => (
            <button
              className={`rounded px-3 py-1 ${
                index === currentIndex ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-gray-300'
              }`}
              key={item.id}
              onClick={() => handleJumpToItem(index)}
              type="button"
            >
              {index + 1}
            </button>
          ))}
        </div>

        <div className="text-gray-600 text-sm">
          <p>
            {uiText('m_d9a9dca249')}
            {currentIndex}
          </p>
          <p>
            {uiText('m_4cbc47c870')}
            {isPlaying ? uiText('yes_85a39ab') : uiText('no_1ea442a')}
          </p>
          <p>
            {uiText('m_5fdd91c502')}
            {isMuted ? uiText('yes_85a39ab') : uiText('no_1ea442a')}
          </p>
          <p>
            {uiText('m_c50dd61fce')}
            {currentItem.title}
          </p>
        </div>
      </div>

      {/* Controlled Reel Component */}
      <div className="mx-auto w-full max-w-sm">
        <Reel
          data={reelItems}
          index={currentIndex}
          muted={isMuted}
          onIndexChange={setCurrentIndex}
          onMutedChange={setIsMuted}
          onPlayingChange={setIsPlaying}
          playing={isPlaying}
        >
          <ReelProgress />

          <ReelHeader>
            <div className="text-white">
              <h2 className="font-bold text-xl">{uiText('m_f3d3786774')}</h2>
              <p className="text-sm opacity-80">
                {uiText('m_284e12472d')}
                {currentIndex + 1}
                {uiText('of_a4282e4')}
                {reelItems.length}
              </p>
            </div>
          </ReelHeader>

          <ReelContent>
            {(item) => (
              <>
                {item.type === 'video' ? (
                  <ReelVideo src={item.src} />
                ) : (
                  <ReelImage alt={item.alt || ''} duration={item.duration} src={item.src} />
                )}
              </>
            )}
          </ReelContent>

          <ReelNavigation />

          <ReelFooter>
            <div className="text-white">
              <h3 className="font-semibold text-lg">{currentItem.title}</h3>
              {currentItem.description && (
                <p className="mt-1 text-sm opacity-90">{currentItem.description}</p>
              )}
            </div>
          </ReelFooter>

          <ReelControls />
        </Reel>
      </div>

      {/* Advanced Controlled Example with Custom UI */}
      <div className="flex flex-col gap-4 rounded-lg border p-4">
        <h3 className="font-semibold text-lg">{uiText('m_62ee24f330')}</h3>
        <p className="text-gray-600 text-sm">{uiText('m_22a95869ea')}</p>

        <div className="flex gap-4">
          <div className="flex-1">
            <Reel
              className="aspect-[9/16]"
              data={reelItems}
              index={currentIndex}
              muted={isMuted}
              onIndexChange={setCurrentIndex}
              onMutedChange={setIsMuted}
              onPlayingChange={setIsPlaying}
              playing={isPlaying}
            >
              <ReelContent>
                {(item) => (
                  <>
                    {item.type === 'video' ? (
                      <ReelVideo src={item.src} />
                    ) : (
                      <ReelImage alt={item.alt || ''} duration={item.duration} src={item.src} />
                    )}
                  </>
                )}
              </ReelContent>
            </Reel>
          </div>

          <div className="flex flex-1 flex-col justify-center gap-4">
            <div>
              <h4 className="font-semibold">{currentItem.title}</h4>
              <p className="text-gray-600 text-sm">{currentItem.description}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="font-medium text-sm" htmlFor="timeline">
                  {uiText('m_dba8382d55')}
                </label>
                <input
                  className="flex-1"
                  id="timeline"
                  max={reelItems.length - 1}
                  min={0}
                  onChange={(e) => setCurrentIndex(Number(e.target.value))}
                  type="range"
                  value={currentIndex}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  checked={isPlaying}
                  id="autoplay"
                  onChange={(e) => setIsPlaying(e.target.checked)}
                  type="checkbox"
                />
                <label className="text-sm" htmlFor="autoplay">
                  {uiText('m_eea7e1107f')}
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  checked={isMuted}
                  id="muted"
                  onChange={(e) => setIsMuted(e.target.checked)}
                  type="checkbox"
                />
                <label className="text-sm" htmlFor="muted">
                  {uiText('m_b9e78ced88')}
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {reelItems.map((item, index) => (
                <button
                  className={`rounded p-2 text-xs ${
                    index === currentIndex
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                  key={item.id}
                  onClick={() => setCurrentIndex(index)}
                  type="button"
                >
                  {item.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Example of using the controlled Reel in a parent component
export default function ControlledReelPage() {
  const tUi = useTranslations('common');

  return (
    <div className="container mx-auto py-8">
      <h1 className="mb-8 text-center font-bold text-3xl">{tUi('m_dd70485c74')}</h1>
      <ReelControlledExample />
    </div>
  );
}
