import React from 'react';

export function BackgroundVideo() {
  return (
    <div className="fixed inset-0 w-full h-full z-[-10] overflow-hidden pointer-events-none">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute top-1/2 left-1/2 min-w-full min-h-full w-auto h-auto object-cover -translate-x-1/2 -translate-y-1/2 opacity-70"
      >
        <source src="/background.mp4" type="video/mp4" />
      </video>
      {/* Overlay to ensure text readability */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"></div>
    </div>
  );
}
