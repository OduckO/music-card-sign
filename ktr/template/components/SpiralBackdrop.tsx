import { useId } from 'react'

const sectors = [
  '#b7cbd7',
  '#adcee5',
  '#c8c3df',
  '#ddb2ca',
  '#ebc6bd',
  '#e5d8cc',
  '#d3d9dd',
  '#bac7cf'
].map((color, sector) => {
  const points = [0, 1].flatMap((side) =>
    Array.from({ length: 81 }, (_, index) => {
      const radius = (side ? 80 - index : index) * 22
      const angle = ((sector + side) * Math.PI) / 4 + radius / 145
      return `${(730 + Math.cos(angle) * radius).toFixed(1)},${(270 + Math.sin(angle) * radius).toFixed(1)}`
    })
  )
  return { color, path: `M${points.join(' L')} Z` }
})

export const SpiralBackdrop = ({ wide = false }: { wide?: boolean }) => {
  const filterId = useId()
  return (
    <svg
      className="spiral-art"
      viewBox={wide ? '0 150 1000 330' : '0 0 1000 1250'}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="28" />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`}>
        {sectors.map(({ color, path }) => (
          <path key={color} d={path} fill={color} />
        ))}
      </g>
    </svg>
  )
}
