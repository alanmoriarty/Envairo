import React from 'react';

export function BackgroundVideo() {
  return (
    <div className="fixed inset-0 w-full h-full z-[-10] overflow-hidden pointer-events-none bg-[#0a0714]">
      {/* Aurora Ambient Glow Orbs - Pure GPU Radial Gradients WITHOUT Gaussian Blur Shaders */}
      <div 
        className="absolute -top-[20%] -left-[10%] w-[65vw] h-[65vw] rounded-full opacity-35"
        style={{
          background: 'radial-gradient(circle, rgba(121,40,202,0.4) 0%, rgba(121,40,202,0.15) 45%, rgba(10,7,20,0) 75%)',
          transform: 'translateZ(0)',
        }}
      />
      <div 
        className="absolute top-[35%] -right-[15%] w-[60vw] h-[60vw] rounded-full opacity-30"
        style={{
          background: 'radial-gradient(circle, rgba(157,78,221,0.35) 0%, rgba(157,78,221,0.12) 50%, rgba(10,7,20,0) 80%)',
          transform: 'translateZ(0)',
        }}
      />
      <div 
        className="absolute -bottom-[20%] left-[15%] w-[70vw] h-[70vw] rounded-full opacity-25"
        style={{
          background: 'radial-gradient(circle, rgba(59,27,109,0.5) 0%, rgba(59,27,109,0.15) 50%, rgba(10,7,20,0) 80%)',
          transform: 'translateZ(0)',
        }}
      />

      {/* Subtle Noise / Grid Texture layer for depth */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.12),rgba(255,255,255,0))]"></div>
      {/* Dark overlay ensuring contrast */}
      <div className="absolute inset-0 bg-black/40"></div>
    </div>
  );
}
