import React from 'react';

export function BackgroundVideo() {
  return (
    <div className="fixed inset-0 w-full h-full z-[-10] overflow-hidden pointer-events-none bg-[#0a0714]">
      {/* Aurora Ambient Glow Orbs - Ultra-lightweight GPU composited CSS */}
      <div 
        className="absolute -top-[20%] -left-[10%] w-[55vw] h-[55vw] rounded-full opacity-25 blur-[100px]"
        style={{
          background: 'radial-gradient(circle, #7928CA 0%, rgba(121,40,202,0) 70%)',
          transform: 'translateZ(0)',
        }}
      />
      <div 
        className="absolute top-[40%] -right-[15%] w-[50vw] h-[50vw] rounded-full opacity-20 blur-[110px]"
        style={{
          background: 'radial-gradient(circle, #9D4EDD 0%, rgba(157,78,221,0) 70%)',
          transform: 'translateZ(0)',
        }}
      />
      <div 
        className="absolute -bottom-[20%] left-[20%] w-[60vw] h-[60vw] rounded-full opacity-15 blur-[120px]"
        style={{
          background: 'radial-gradient(circle, #3B1B6D 0%, rgba(59,27,109,0) 70%)',
          transform: 'translateZ(0)',
        }}
      />

      {/* Subtle Noise / Grid Texture layer for depth */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))]"></div>
      {/* Dark overlay ensuring contrast */}
      <div className="absolute inset-0 bg-black/40"></div>
    </div>
  );
}
