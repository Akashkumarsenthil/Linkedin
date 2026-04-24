/**
 * Subtle animated mesh-gradient background for hero sections.
 * Pure CSS, no libs — three slow-moving radial gradients.
 */
export function HeroMesh() {
  return (
    <div className="hero-mesh" aria-hidden>
      <span className="mesh-blob blob-a" />
      <span className="mesh-blob blob-b" />
      <span className="mesh-blob blob-c" />
      <span className="mesh-grid" />
    </div>
  )
}
