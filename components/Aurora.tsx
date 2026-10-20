/**
 * Fixed, non-interactive aurora backdrop: three slowly drifting colour
 * blobs plus a faint grid. Pure CSS animation (no JS), so it costs
 * nothing at runtime and renders on the server.
 */
export default function Aurora() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-40 -left-32 h-[32rem] w-[32rem] rounded-full bg-neon-violet/25 blur-[120px] animate-aurora" />
      <div
        className="absolute top-1/3 -right-40 h-[34rem] w-[34rem] rounded-full bg-neon-cyan/20 blur-[130px] animate-aurora"
        style={{ animationDelay: '-6s' }}
      />
      <div
        className="absolute -bottom-48 left-1/4 h-[30rem] w-[30rem] rounded-full bg-neon-pink/20 blur-[120px] animate-aurora"
        style={{ animationDelay: '-12s' }}
      />
      {/* subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.055) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse at 50% 0%, #000 35%, transparent 78%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 0%, #000 35%, transparent 78%)',
        }}
      />
    </div>
  );
}
