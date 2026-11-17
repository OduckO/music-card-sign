import { useId } from 'react'

const noise = (index: number, seed: number) => {
  const value = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453
  return value - Math.floor(value)
}

const tiles = Array.from({ length: 720 }, (_, index) => ({
  x: 65 + noise(index, 1) * 490,
  y: 52 + noise(index, 2) * 326,
  size: 2 + noise(index, 3) * 11,
  opacity: 0.22 + noise(index, 4) * 0.68,
  color: ['#f9e3d9', '#b9cad3', '#faf8ee', '#c8bfd6', '#e3c8ba'][index % 5]
}))

const fragments = Array.from({ length: 90 }, (_, index) => ({
  x: 14 + noise(index, 5) * 590,
  y: 55 + noise(index, 6) * 310,
  size: 1 + noise(index, 7) * 5
}))

const upperWing = 'M310 219C260 149 220 46 101 64C42 74 85 169 112 193C151 232 245 244 310 229Z'
const lowerWing = 'M310 229C241 228 167 210 129 243C89 276 158 356 204 368C259 386 288 280 310 240Z'

export const PixelArtwork = ({ className = '' }: { className?: string }) => {
  const id = useId().replace(/:/g, '')
  return (
    <svg className={className} viewBox="0 0 620 440" fill="none" aria-hidden="true">
      <defs>
        <linearGradient
          id={`${id}-glass`}
          x1="100"
          y1="70"
          x2="520"
          y2="370"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#f3cbbd" />
          <stop offset=".28" stopColor="#cadbe2" />
          <stop offset=".52" stopColor="#fdf7e5" />
          <stop offset=".76" stopColor="#b8b4cf" />
          <stop offset="1" stopColor="#eac0b7" />
        </linearGradient>
        <linearGradient
          id={`${id}-line`}
          x1="80"
          y1="80"
          x2="510"
          y2="370"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#d6aaa2" />
          <stop offset=".5" stopColor="#fffdf3" />
          <stop offset="1" stopColor="#a5bac6" />
        </linearGradient>
        <clipPath id={`${id}-wings`}>
          <path d={upperWing} />
          <path d={lowerWing} />
          <path d={upperWing} transform="translate(620 0) scale(-1 1)" />
          <path d={lowerWing} transform="translate(620 0) scale(-1 1)" />
        </clipPath>
        <filter id={`${id}-grain`}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency=".72"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope=".12" />
          </feComponentTransfer>
          <feBlend in="SourceGraphic" mode="soft-light" />
        </filter>
      </defs>
      <path
        d="M-30 341C109 463 491 269 650 79"
        stroke={`url(#${id}-line)`}
        strokeWidth=".8"
        opacity=".7"
      />
      <path
        d="M-25 349C159 413 525 300 638 92"
        stroke={`url(#${id}-line)`}
        strokeWidth="7"
        opacity=".08"
      />
      <g clipPath={`url(#${id}-wings)`}>
        <rect x="60" y="48" width="500" height="340" fill={`url(#${id}-glass)`} opacity=".62" />
        {tiles.map((tile, index) => (
          <rect
            key={index}
            x={tile.x}
            y={tile.y}
            width={tile.size}
            height={tile.size * (index % 3 === 0 ? 0.55 : 1)}
            fill={tile.color}
            opacity={tile.opacity}
            stroke="#fffdf8"
            strokeWidth=".5"
            transform={index % 5 === 0 ? `rotate(35 ${tile.x} ${tile.y})` : undefined}
          />
        ))}
        <rect
          x="60"
          y="48"
          width="500"
          height="340"
          fill="transparent"
          filter={`url(#${id}-grain)`}
        />
      </g>
      {[false, true].map((mirror) => (
        <g
          key={String(mirror)}
          transform={mirror ? 'translate(620 0) scale(-1 1)' : undefined}
          stroke={`url(#${id}-line)`}
          strokeWidth="1"
        >
          <path d={upperWing} opacity=".85" />
          <path d={lowerWing} opacity=".85" />
          <path
            d="M309 224C235 204 204 124 106 71M308 227C225 229 174 170 94 128M308 230C229 250 158 219 117 190M307 237C253 260 234 326 203 367M305 235C245 269 187 275 151 284M247 191l-19-62-56-13M220 209l-33-46-54 6M263 282l-44-2-15 49"
            opacity=".7"
          />
        </g>
      ))}
      {fragments.map((fragment, index) => (
        <rect
          key={index}
          x={fragment.x}
          y={fragment.y}
          width={fragment.size}
          height={fragment.size}
          fill={tiles[index].color}
          opacity=".45"
          stroke="#fffdf8"
          strokeWidth=".4"
        />
      ))}
      <path
        d="M310 196C299 213 305 255 310 280C315 255 321 213 310 196Z"
        fill={`url(#${id}-glass)`}
        stroke="#fdf8e9"
      />
      <path
        d="M306 205C300 168 285 151 278 150M314 205C320 168 335 151 342 150"
        stroke="#e5d6c5"
        strokeWidth="1.2"
      />
      <circle cx="277" cy="150" r="3" fill="#f8e7d9" />
      <circle cx="343" cy="150" r="3" fill="#d5e2e6" />
      <g transform="translate(479 316) rotate(14)" stroke="#899b9f" strokeWidth="1.2">
        <path
          d="M-16-24h32M-16 25h32M-13-22c0 12 4 15 13 23-9 8-13 12-13 22h26C13 13 9 9 0 1c9-8 13-11 13-23Z"
          fill="#eef0e32e"
        />
        <path d="M-9-13 0-1 9-13M-10 20 0 7 10 20" fill="#e1c9b8" stroke="none" />
      </g>
      <g transform="translate(128 331)" stroke="#b1a1ad" strokeWidth="1">
        <path
          d="M0 0C-24-35 24-35 0 0C35-24 35 24 0 0C24 35-24 35 0 0C-35 24-35-24 0 0Z"
          fill="#e2cbd43b"
        />
        <circle r="3" fill="#f9e2cd" />
      </g>
    </svg>
  )
}
